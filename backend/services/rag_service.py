import asyncio
import hashlib
import time
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from typing import AsyncGenerator
from chroma_client import get_collection
from services.embedding_service import get_embedding
from services.llm_service import chat_completion_stream, simple_chat
from services.memory_service import compress_history
from loguru import logger

_chroma_executor = ThreadPoolExecutor(max_workers=10)

# In-memory LRU cache: keyed by (kb_id, context_hash, question) -> (response_text, sources)
# context_hash = hash of retrieved chunks so semantically same context = cache hit
_response_cache: OrderedDict[tuple[int, str, str], tuple[str, list[dict]]] = OrderedDict()
_CACHE_MAX_SIZE = 500

SYSTEM_PROMPT = """你是一个知识库问答助手。请根据以下参考资料回答用户的问题。
回答时必须在末尾列出引用来源（格式：[来源：文件名，第X段]）。
如果参考资料中没有相关内容，请明确告知用户"知识库中暂无相关信息"，不要编造答案。

参考资料：
{context}"""

MAX_HISTORY_ROUNDS = 10
KEEP_RECENT_ROUNDS = 3


def _make_context_hash(chunks: list[dict]) -> str:
    """Hash of retrieved chunk IDs + texts for cache key."""
    key_parts = [f"{c.get('document_id', '')}:{c.get('chunk_index', 0)}:{c.get('text', '')[:50]}" for c in chunks]
    return hashlib.sha256("|".join(key_parts).encode()).hexdigest()[:16]


def _cache_get(kb_id: int, question: str, context_hash: str) -> tuple[str, list[dict]] | None:
    key = (kb_id, context_hash, question)
    if key in _response_cache:
        _response_cache.move_to_end(key)
        return _response_cache[key]
    return None


def _cache_set(kb_id: int, question: str, context_hash: str, response: str, sources: list[dict]) -> None:
    key = (kb_id, context_hash, question)
    _response_cache[key] = (response, sources)
    _response_cache.move_to_end(key)
    while len(_response_cache) > _CACHE_MAX_SIZE:
        _response_cache.popitem(last=False)


async def retrieve_chunks(kb_id: int, query: str, top_k: int = 5) -> list[dict]:
    """从 Chroma 检索最相关的文本片段（运行在受限线程池避免阻塞事件循环）"""
    query_embedding = await get_embedding(query)
    collection = get_collection(kb_id)

    def _query():
        return collection.query(
            query_embeddings=[query_embedding],
            n_results=top_k,
            include=["documents", "metadatas", "distances"],
        )

    results = await asyncio.run_in_executor(_chroma_executor, _query)

    chunks = []
    if results and results["documents"]:
        for doc, meta, dist in zip(
            results["documents"][0],
            results["metadatas"][0],
            results["distances"][0],
        ):
            chunks.append({
                "text": doc,
                "filename": meta.get("filename", "未知文件"),
                "chunk_index": meta.get("chunk_index", 0),
                "document_id": meta.get("document_id"),
                "score": 1 - dist,  # cosine distance -> similarity
            })
    return chunks


async def rag_chat_stream(
    kb_id: int,
    session_summary: str | None,
    history_messages: list[dict],
    user_question: str,
) -> AsyncGenerator[tuple[str, list[dict]], None]:
    """
    RAG 问答流式生成器
    yields: (text_chunk, sources_if_final)
    最后一次 yield 包含 sources 列表
    """
    # 处理历史记忆
    messages_for_llm = []

    if session_summary:
        messages_for_llm.append({
            "role": "system",
            "content": f"以下是之前对话的摘要：\n{session_summary}",
        })

    # 只保留最近 KEEP_RECENT_ROUNDS 轮原文
    recent = history_messages[-(KEEP_RECENT_ROUNDS * 2):]
    messages_for_llm.extend(recent)

    # 检索
    chunks = await retrieve_chunks(kb_id, user_question, top_k=5)

    context_parts = []
    sources = []
    for i, chunk in enumerate(chunks):
        context_parts.append(
            f"[来源：{chunk['filename']}，第{chunk['chunk_index']+1}段]\n{chunk['text']}"
        )
        sources.append({
            "filename": chunk["filename"],
            "chunk_index": chunk["chunk_index"],
            "text": chunk["text"],
            "score": chunk["score"],
            "document_id": chunk.get("document_id"),
        })

    context = "\n\n---\n\n".join(context_parts) if context_parts else "（暂无相关参考资料）"

    # Check cache (cache key includes context hash so same Q + same docs = hit)
    context_hash = _make_context_hash(chunks)
    cached = _cache_get(kb_id, user_question, context_hash)
    if cached:
        logger.debug(f"Cache hit for kb={kb_id} question={user_question[:30]}")
        cached_response, cached_sources = cached
        for i in range(0, len(cached_response), 50):
            yield cached_response[i:i+50], []
        yield "", cached_sources
        return

    system_message = {"role": "system", "content": SYSTEM_PROMPT.format(context=context)}
    user_message = {"role": "user", "content": user_question}

    final_messages = [system_message] + messages_for_llm + [user_message]

    # Collect full response for caching
    full_response = []

    # 流式生成
    async for text_chunk in chat_completion_stream(final_messages):
        full_response.append(text_chunk)
        yield text_chunk, []

    # Cache the complete response
    final_response = "".join(full_response)
    _cache_set(kb_id, user_question, context_hash, final_response, sources)

    # 最后 yield sources
    yield "", sources


async def should_compress_history(history_messages: list[dict]) -> bool:
    """判断是否需要压缩历史（超过 10 轮）"""
    rounds = len(history_messages) // 2
    return rounds > MAX_HISTORY_ROUNDS


async def get_new_summary(
    existing_summary: str | None,
    old_messages: list[dict],
) -> str:
    """生成新摘要（保留最近 3 轮外的消息）"""
    messages_to_summarize = old_messages[:-(KEEP_RECENT_ROUNDS * 2)]
    if not messages_to_summarize:
        return existing_summary or ""

    if existing_summary:
        messages_to_summarize = [
            {"role": "system", "content": f"[之前摘要] {existing_summary}"},
            *messages_to_summarize,
        ]

    return await compress_history(messages_to_summarize)
