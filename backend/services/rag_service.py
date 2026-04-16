import asyncio
import hashlib
import json
from typing import AsyncGenerator

from chroma_client import get_collection_async
from redis_client import redis_client
from services.embedding_service import get_embedding
from services.llm_service import chat_completion_stream
from services.memory_service import compress_history
from loguru import logger


async def log_retrieval(db, message_id: int, sources: list[dict]) -> None:
    """将检索到的 chunks 写入 RetrievalLog 表"""
    from models.feedback import RetrievalLog

    if not sources:
        return

    db.add_all([
        RetrievalLog(
            message_id=message_id,
            document_id=int(s["document_id"]) if s.get("document_id") else None,
            chunk_index=s["chunk_index"],
            chunk_text=s["text"][:1000],
            score=s["score"],
        )
        for s in sources
    ])

# Redis cache key prefix
_CACHE_KEY_PREFIX = "rag_cache"
_CACHE_TTL_SECONDS = 3600  # 1 hour

SYSTEM_PROMPT = """你是一个知识库问答助手。请根据以下参考资料回答用户的问题。
回答时必须在末尾列出引用来源（格式：[来源：文件名，第X段]）。
如果参考资料中没有相关内容，请明确告知用户"知识库中暂无相关信息"，不要编造答案。

参考资料：
{context}"""

MAX_HISTORY_ROUNDS = 10
KEEP_RECENT_ROUNDS = 3


def _make_context_hash(chunks: list[dict]) -> str:
    """Hash of retrieved chunk IDs + texts for cache key."""
    key_parts = [
        f"{c.get('document_id', '')}:{c.get('chunk_index', 0)}:{c.get('text', '')[:50]}"
        for c in chunks
    ]
    return hashlib.sha256("|".join(key_parts).encode()).hexdigest()[:16]


def _make_history_hash(
    history_messages: list[dict], session_summary: str | None
) -> str:
    """Hash of conversation history — same Q in different contexts should not share cache."""
    parts = []
    if session_summary:
        parts.append(f"summary:{session_summary[:100]}")
    # Include last 2 rounds of history to differentiate context
    for m in history_messages[-4:]:
        parts.append(f"{m.get('role', '')}:{m.get('content', '')[:80]}")
    return hashlib.sha256("|".join(parts).encode()).hexdigest()[:16]


def _make_cache_key(
    kb_id: int, question: str, context_hash: str, history_hash: str
) -> str:
    """Build Redis key: rag_cache:{kb_id}:{history_hash}:{context_hash}:{question_hash}"""
    question_hash = hashlib.sha256(question.encode()).hexdigest()[:24]
    return f"{_CACHE_KEY_PREFIX}:{kb_id}:{history_hash}:{context_hash}:{question_hash}"


async def _cache_get(
    kb_id: int, question: str, context_hash: str, history_hash: str
) -> tuple[str, list[dict]] | None:
    key = _make_cache_key(kb_id, question, context_hash, history_hash)
    data = await redis_client.get(key)
    if data:
        # Move to end (LRU behavior) by touching the key's TTL
        await redis_client.expire(key, _CACHE_TTL_SECONDS)
        parsed = json.loads(data)
        return parsed["response"], parsed["sources"]
    return None


async def _cache_set(
    kb_id: int,
    question: str,
    context_hash: str,
    history_hash: str,
    response: str,
    sources: list[dict],
) -> None:
    key = _make_cache_key(kb_id, question, context_hash, history_hash)
    data = json.dumps({"response": response, "sources": sources})
    await redis_client.setex(key, _CACHE_TTL_SECONDS, data)


async def retrieve_chunks(
    kb_id: int, query: str, top_k: int = 5, score_threshold: float = 0.5
) -> list[dict]:
    """从 Chroma 检索最相关的文本片段（运行在受限线程池避免阻塞事件循环）"""
    query_embedding = await get_embedding(query)
    collection = await get_collection_async(kb_id)

    def _query():
        return collection.query(
            query_embeddings=[query_embedding],
            n_results=top_k,
            include=["documents", "metadatas", "distances"],
        )

    results = await asyncio.to_thread(_query)

    chunks = []
    if results and results["documents"]:
        for doc, meta, dist in zip(
            results["documents"][0],
            results["metadatas"][0],
            results["distances"][0],
        ):
            score = 1 - dist  # cosine distance -> similarity
            if score < score_threshold:
                continue
            chunks.append(
                {
                    "text": doc,
                    "filename": meta.get("filename", "未知文件"),
                    "chunk_index": meta.get("chunk_index", 0),
                    "document_id": meta.get("document_id"),
                    "score": score,
                }
            )

    if not chunks:
        logger.warning(
            f"No chunks retrieved for kb={kb_id}, query={query!r}, top_k={top_k}, score_threshold={score_threshold}"
        )
        # Log top scores even when below threshold
        if results and results["distances"]:
            top_scores = [1 - d for d in results["distances"][0][:3]]
            logger.warning(f"Top scores below threshold: {top_scores}")

    return chunks


async def rag_chat_stream(
    kb_id: int,
    session_summary: str | None,
    history_messages: list[dict],
    user_question: str,
    top_k: int = 5,
    score_threshold: float = 0.5,
    system_prompt: str | None = None,
) -> AsyncGenerator[tuple[str, list[dict]], None]:
    """
    RAG 问答流式生成器
    yields: (text_chunk, sources_if_final)
    最后一次 yield 包含 sources 列表
    """
    # 处理历史记忆
    messages_for_llm = []

    if session_summary:
        messages_for_llm.append(
            {
                "role": "system",
                "content": f"以下是之前对话的摘要：\n{session_summary}",
            }
        )

    # 只保留最近 KEEP_RECENT_ROUNDS 轮原文
    recent = history_messages[-(KEEP_RECENT_ROUNDS * 2) :]
    messages_for_llm.extend(recent)

    # 检索
    chunks = await retrieve_chunks(
        kb_id, user_question, top_k=top_k, score_threshold=score_threshold
    )

    context_parts = []
    sources = []
    for i, chunk in enumerate(chunks):
        context_parts.append(
            f"[来源：{chunk['filename']}，第{chunk['chunk_index'] + 1}段]\n{chunk['text']}"
        )
        sources.append(
            {
                "filename": chunk["filename"],
                "chunk_index": chunk["chunk_index"],
                "text": chunk["text"],
                "score": chunk["score"],
                "document_id": chunk.get("document_id"),
            }
        )

    context = (
        "\n\n---\n\n".join(context_parts) if context_parts else "（暂无相关参考资料）"
    )

    # Short-circuit: no relevant chunks — return canned response without calling LLM
    if not chunks:
        logger.warning(
            f"RAG short-circuit: no relevant chunks for kb={kb_id}, query={user_question!r}"
        )
        no_result = "抱歉，知识库中没有找到与您问题相关的内容，建议您尝试换一种表述方式，或上传更多相关文档。"
        for i in range(0, len(no_result), 50):
            yield no_result[i : i + 50], []
        yield "", []
        return

    # Compute cache key including history context
    context_hash = _make_context_hash(chunks)
    history_hash = _make_history_hash(history_messages, session_summary)

    # Check cache (cache key includes context hash so same Q + same docs = hit)
    cached = await _cache_get(kb_id, user_question, context_hash, history_hash)
    if cached:
        logger.debug(f"Cache hit for kb={kb_id} question={user_question[:30]}")
        cached_response, cached_sources = cached
        for i in range(0, len(cached_response), 50):
            yield cached_response[i : i + 50], []
        yield "", cached_sources
        return

    system_message = {
        "role": "system",
        "content": (system_prompt or SYSTEM_PROMPT).format(context=context),
    }
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
    await _cache_set(
        kb_id, user_question, context_hash, history_hash, final_response, sources
    )

    # 最后 yield sources
    yield "", sources


async def get_new_summary(
    existing_summary: str | None,
    old_messages: list[dict],
) -> str:
    """生成新摘要（保留最近 3 轮外的消息）"""
    messages_to_summarize = old_messages[: -(KEEP_RECENT_ROUNDS * 2)]
    if not messages_to_summarize:
        return existing_summary or ""

    if existing_summary:
        messages_to_summarize = [
            {"role": "system", "content": f"[之前摘要] {existing_summary}"},
            *messages_to_summarize,
        ]

    return await compress_history(messages_to_summarize)
