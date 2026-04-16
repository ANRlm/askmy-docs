import os
import uuid
import asyncio
from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models.user import User
from models.knowledge_base import KnowledgeBase
from models.document import Document
from middleware.auth import get_current_user
from middleware.rate_limit import check_rate_limit
from config import settings
from chroma_client import get_collection_async
from loguru import logger

router = APIRouter(tags=["文档管理"])

ALLOWED_EXTENSIONS = {
    ".pdf",
    ".md",
    ".txt",
    ".docx",
    ".xlsx",
    ".xls",
    ".csv",
    ".html",
    ".htm",
}
MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB


def _write_file(path: str, content: bytes) -> None:
    with open(path, "wb") as f:
        f.write(content)


def get_rq_queue():
    from rq import Queue
    from redis_client import sync_redis

    return Queue("document-processing", connection=sync_redis)


@router.post("/api/kb/{kb_id}/documents", summary="上传文档")
async def upload_document(
    kb_id: int,
    file: UploadFile = File(...),
    request: Request = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_rate_limit(request, current_user.id)

    # 验证知识库归属
    result = await db.execute(
        select(KnowledgeBase).where(
            KnowledgeBase.id == kb_id, KnowledgeBase.user_id == current_user.id
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="知识库不存在")

    # 验证文件类型
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的文件类型，仅支持: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    # 读取内容并检查大小
    content = await file.read()
    if len(content) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"文件大小超过 {MAX_FILE_SIZE_BYTES // (1024 * 1024)} MB 限制",
        )

    # 存储文件
    os.makedirs(settings.file_storage_path, exist_ok=True)
    unique_name = f"{uuid.uuid4()}{ext}"
    file_path = os.path.join(settings.file_storage_path, unique_name)

    await asyncio.to_thread(_write_file, file_path, content)

    # 创建文档记录
    doc = Document(
        kb_id=kb_id,
        user_id=current_user.id,
        filename=file.filename,
        file_path=file_path,
        status="pending",
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    # 提交异步任务
    try:
        queue = get_rq_queue()
        queue.enqueue(
            "tasks.document_task.process_document",
            doc.id,
            job_timeout=600,
        )
    except Exception as e:
        logger.error(f"任务队列提交失败: {e}")
        doc.status = "failed"
        doc.error_msg = "任务队列不可用"
        await db.commit()

    return {
        "id": doc.id,
        "filename": doc.filename,
        "status": doc.status,
        "created_at": doc.created_at,
    }


@router.get("/api/kb/{kb_id}/documents", summary="列出文档")
async def list_documents(
    kb_id: int,
    request: Request,
    cursor: int | None = Query(None, description="上次返回的最后一个文档 ID"),
    limit: int = Query(50, ge=1, le=100, description="每页数量"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_rate_limit(request, current_user.id)

    result = await db.execute(
        select(KnowledgeBase).where(
            KnowledgeBase.id == kb_id, KnowledgeBase.user_id == current_user.id
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="知识库不存在")

    query = select(Document).where(
        Document.kb_id == kb_id,
        Document.user_id == current_user.id,
    )
    if cursor is not None:
        query = query.where(Document.id < cursor)
    query = query.order_by(Document.id.desc()).limit(limit)

    result = await db.execute(query)
    docs = result.scalars().all()
    return [
        {
            "id": d.id,
            "filename": d.filename,
            "status": d.status,
            "chunk_count": d.chunk_count,
            "error_msg": d.error_msg,
            "created_at": d.created_at,
        }
        for d in docs
    ]


@router.get("/api/kb/{kb_id}/documents/{doc_id}", summary="查询文档状态")
async def get_document(
    kb_id: int,
    doc_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_rate_limit(request, current_user.id)
    result = await db.execute(
        select(Document).where(
            Document.id == doc_id,
            Document.kb_id == kb_id,
            Document.user_id == current_user.id,
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")

    return {
        "id": doc.id,
        "filename": doc.filename,
        "status": doc.status,
        "chunk_count": doc.chunk_count,
        "error_msg": doc.error_msg,
        "created_at": doc.created_at,
    }


@router.post("/api/kb/{kb_id}/documents/{doc_id}/retry", summary="重新处理文档")
async def retry_document(
    kb_id: int,
    doc_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_rate_limit(request, current_user.id)
    result = await db.execute(
        select(Document).where(
            Document.id == doc_id,
            Document.kb_id == kb_id,
            Document.user_id == current_user.id,
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")

    if doc.status != "failed":
        raise HTTPException(status_code=400, detail="只能重试处理失败的文档")

    doc.status = "pending"
    doc.error_msg = None
    await db.commit()

    try:
        queue = get_rq_queue()
        queue.enqueue(
            "tasks.document_task.process_document",
            doc.id,
            job_timeout=600,
        )
    except Exception as e:
        logger.error(f"任务队列提交失败: {e}")
        doc.status = "failed"
        doc.error_msg = "任务队列不可用"
        await db.commit()

    return {
        "id": doc.id,
        "filename": doc.filename,
        "status": doc.status,
        "chunk_count": doc.chunk_count,
        "error_msg": doc.error_msg,
        "created_at": doc.created_at,
    }


@router.delete("/api/kb/{kb_id}/documents/{doc_id}", summary="删除文档")
async def delete_document(
    kb_id: int,
    doc_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_rate_limit(request, current_user.id)
    result = await db.execute(
        select(Document).where(
            Document.id == doc_id,
            Document.kb_id == kb_id,
            Document.user_id == current_user.id,
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")

    # 删除 Chroma 中的向量
    try:
        collection = await get_collection_async(kb_id)
        await asyncio.to_thread(collection.delete, where={"document_id": str(doc_id)})
    except Exception as e:
        logger.warning(f"删除 Chroma 向量失败: {e}")

    # 删除文件
    try:
        os.remove(doc.file_path)
    except Exception:
        pass

    await db.delete(doc)
    await db.commit()
    return {"message": "文档已删除"}


class SearchChunk(BaseModel):
    document_id: int
    chunk_index: int
    text: str
    filename: str


class SearchRequest(BaseModel):
    query: str
    limit: int = 20


@router.post("/api/kb/{kb_id}/documents/search", summary="搜索文档内容")
async def search_documents(
    kb_id: int,
    body: SearchRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_rate_limit(request, current_user.id)

    result = await db.execute(
        select(KnowledgeBase).where(
            KnowledgeBase.id == kb_id, KnowledgeBase.user_id == current_user.id
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="知识库不存在")

    try:
        collection = await get_collection_async(kb_id)
        query_lower = body.query.lower()

        results = await asyncio.to_thread(
            collection.get,
            include=["documents", "metadatas"],
        )

        matches: list[SearchChunk] = []
        for i, doc_text in enumerate(results.get("documents", [])):
            if doc_text and query_lower in doc_text.lower():
                meta = (
                    results.get("metadatas", [])[i]
                    if i < len(results.get("metadatas", []))
                    else {}
                )
                doc_id = int(meta.get("document_id", 0))
                chunk_idx = int(meta.get("chunk_index", 0))
                filename = meta.get("filename", "unknown")

                doc_result = await db.execute(
                    select(Document.filename).where(
                        Document.id == doc_id, Document.kb_id == kb_id
                    )
                )
                row = doc_result.scalar_one_or_none()
                if row:
                    filename = row

                matches.append(
                    SearchChunk(
                        document_id=doc_id,
                        chunk_index=chunk_idx,
                        text=doc_text[:500],
                        filename=filename,
                    )
                )

                if len(matches) >= body.limit:
                    break

        return {"results": [m.model_dump() for m in matches]}

    except Exception as e:
        logger.error(f"文档搜索失败: {e}")
        raise HTTPException(status_code=500, detail="搜索失败")
