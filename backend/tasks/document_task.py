"""
文档异步处理任务（RQ Worker 执行）
"""
import asyncio
import os
from loguru import logger


def process_document(document_id: int):
    """RQ 任务入口（同步函数，内部使用 asyncio.run）"""
    asyncio.run(_process_document_async(document_id))


async def _process_document_async(document_id: int):
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
    from sqlalchemy import select
    from config import settings
    from models.document import Document
    from services.document_service import extract_text_from_file, split_into_chunks
    from services.embedding_service import get_embeddings
    from chroma_client import get_collection

    DATABASE_URL = settings.database_url.replace("postgresql://", "postgresql+asyncpg://")
    engine = create_async_engine(DATABASE_URL)
    SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with SessionLocal() as db:
        try:
            result = await db.execute(select(Document).where(Document.id == document_id))
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

            # 批量生成 Embedding（每批最多 20 条）
            batch_size = 20
            all_embeddings = []
            for i in range(0, len(chunks), batch_size):
                batch = chunks[i:i + batch_size]
                embeddings = await get_embeddings(batch)
                all_embeddings.extend(embeddings)

            # 写入 Chroma
            collection = get_collection(doc.kb_id)
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
                collection.delete(where={"document_id": str(document_id)})
            except Exception:
                pass

            collection.add(
                ids=ids,
                embeddings=all_embeddings,
                documents=chunks,
                metadatas=metadatas,
            )

            # 更新文档状态
            doc.status = "ready"
            doc.chunk_count = len(chunks)
            await db.commit()
            logger.info(f"文档 {doc.filename} 处理完成，写入 {len(chunks)} 个向量")

        except Exception as e:
            logger.error(f"文档 {document_id} 处理失败: {e}", exc_info=True)
            try:
                result = await db.execute(select(Document).where(Document.id == document_id))
                doc = result.scalar_one_or_none()
                if doc:
                    doc.status = "failed"
                    doc.error_msg = str(e)[:500]
                    await db.commit()
            except Exception:
                pass
        finally:
            await engine.dispose()
