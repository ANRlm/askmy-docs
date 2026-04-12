from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from database import get_db
from models.user import User
from models.knowledge_base import KnowledgeBase
from models.document import Document
from middleware.auth import get_current_user
from middleware.rate_limit import check_rate_limit
from chroma_client import delete_collection

router = APIRouter(prefix="/api/kb", tags=["知识库管理"])


class CreateKBRequest(BaseModel):
    name: str
    description: str = ""


class UpdateKBRequest(BaseModel):
    name: str | None = None
    description: str | None = None


@router.post("", summary="创建知识库")
async def create_knowledge_base(
    body: CreateKBRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_rate_limit(request, current_user.id)
    kb = KnowledgeBase(user_id=current_user.id, name=body.name, description=body.description)
    db.add(kb)
    await db.commit()
    await db.refresh(kb)
    return {"id": kb.id, "name": kb.name, "description": kb.description, "created_at": kb.created_at}


@router.get("", summary="列出知识库")
async def list_knowledge_bases(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_rate_limit(request, current_user.id)
    result = await db.execute(
        select(KnowledgeBase).where(KnowledgeBase.user_id == current_user.id)
    )
    kbs = result.scalars().all()
    return [{"id": k.id, "name": k.name, "description": k.description, "created_at": k.created_at} for k in kbs]


@router.patch("/{kb_id}", summary="更新知识库")
async def update_knowledge_base(
    kb_id: int,
    body: UpdateKBRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_rate_limit(request, current_user.id)
    result = await db.execute(
        select(KnowledgeBase).where(KnowledgeBase.id == kb_id, KnowledgeBase.user_id == current_user.id)
    )
    kb = result.scalar_one_or_none()
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在")

    if body.name is not None:
        kb.name = body.name
    if body.description is not None:
        kb.description = body.description
    await db.commit()
    await db.refresh(kb)
    return {"id": kb.id, "name": kb.name, "description": kb.description, "created_at": kb.created_at}


@router.delete("/{kb_id}", summary="删除知识库")
async def delete_knowledge_base(
    kb_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_rate_limit(request, current_user.id)
    result = await db.execute(
        select(KnowledgeBase).where(KnowledgeBase.id == kb_id, KnowledgeBase.user_id == current_user.id)
    )
    kb = result.scalar_one_or_none()
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在")

    # 删除 Chroma Collection
    await delete_collection(kb_id)

    await db.delete(kb)
    await db.commit()
    return {"message": "知识库已删除"}
