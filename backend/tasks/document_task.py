"""
文档异步处理任务（RQ Worker 执行）
"""

import asyncio
from weakref import WeakValueDictionary
from loguru import logger

# Process-level engine cache (keyed by DATABASE_URL to handle env changes)
_engines: WeakValueDictionary[str, object] = WeakValueDictionary()


def _get_engine():
    """Get or create a process-level async engine for the current DATABASE_URL."""
    from sqlalchemy.ext.asyncio import (
        create_async_engine,
        AsyncSession,
        async_sessionmaker,
    )
    from config import settings

    DATABASE_URL = settings.database_url.replace(
        "postgresql://", "postgresql+asyncpg://"
    )
    engine = _engines.get(DATABASE_URL)
    if engine is None:
        engine = create_async_engine(DATABASE_URL, pool_size=10, max_overflow=20)
        _engines[DATABASE_URL] = engine
    return engine


def _get_session_maker(engine):
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


def process_document(document_id: int):
    """RQ 任务入口（同步函数，内部使用 asyncio.run）"""
    asyncio.run(_process_document_async(document_id))


async def _process_document_async(document_id: int):
    from sqlalchemy import select
    from config import settings
    from models.document import Document
    from models.knowledge_base import KnowledgeBase  # noqa: F401
    from models.user import User  # noqa: F401
    from services.document_service import extract_text_from_file, split_into_chunks
    from services.embedding_service import get_embeddings
    from chroma_client import get_collection_async

    engine = _get_engine()
    SessionLocal = _get_session_maker(engine)

    async with SessionLocal() as db:
        try:
            result = await db.execute(
                select(Document).where(Document.id == document_id)
            )
            doc = result.scalar_one_or_none()
            if not doc:
                logger.error(f"文档 {document_id} 不存在")
                return

            # 更新状态为 processing
            doc.status = "processing"
            await db.commit()

            # 提取文本
            logger.info(f"开始处理文档 {doc.filename} (id={document_id})")
            text = extract_text_from_file(doc.file_path, doc.filename)

            if not text.strip():
                doc.status = "failed"
                doc.error_msg = "文档内容为空，无法提取文本"
                await db.commit()
                return

            # 分块
            chunks = split_into_chunks(text, chunk_size=500, overlap=50)
            logger.info(f"文档 {doc.filename} 分块完成，共 {len(chunks)} 块")

            # 批量生成 Embedding（阿里百炼每批最多 10 条）
            batch_size = 10
            all_embeddings = []
            for i in range(0, len(chunks), batch_size):
                batch = chunks[i : i + batch_size]
                embeddings = await get_embeddings(batch)
                all_embeddings.extend(embeddings)

            # 写入 Chroma
            collection = await get_collection_async(doc.kb_id)
            ids = [f"doc_{document_id}_chunk_{i}" for i in range(len(chunks))]
            metadatas = [
                {
                    "filename": doc.filename,
                    "document_id": str(document_id),
                    "chunk_index": i,
                }
                for i in range(len(chunks))
            ]

            # 先删除该文档已有的向量（重新上传时清理）
            try:
                await asyncio.to_thread(
                    collection.delete, where={"document_id": str(document_id)}
                )
            except Exception:
                pass

            await asyncio.to_thread(
                lambda: collection.add(
                    ids=ids,
                    embeddings=all_embeddings,
                    documents=chunks,
                    metadatas=metadatas,
                )
            )

            # 更新文档状态
            doc.status = "done"
            doc.chunk_count = len(chunks)
            await db.commit()
            logger.info(f"文档 {doc.filename} 处理完成，写入 {len(chunks)} 个向量")

        except Exception as e:
            logger.error("文档 {} 处理失败: {}", document_id, e, exc_info=True)
            try:
                result = await db.execute(
                    select(Document).where(Document.id == document_id)
                )
                doc = result.scalar_one_or_none()
                if doc:
                    doc.status = "failed"
                    doc.error_msg = str(e)[:500]
                    await db.commit()
            except Exception:
                pass
