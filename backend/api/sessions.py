import json
import time
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from database import get_db
from models.user import User
from models.knowledge_base import KnowledgeBase
from models.session import Session
from models.message import Message
from models.feedback import RetrievalLog
from middleware.auth import get_current_user
from middleware.rate_limit import check_rate_limit
from services.rag_service import (
    rag_chat_stream, should_compress_history, get_new_summary
)
from loguru import logger

router = APIRouter(tags=["对话与问答"])


class CreateSessionRequest(BaseModel):
    title: str = "新会话"


class RenameSessionRequest(BaseModel):
    title: str


class ChatRequest(BaseModel):
    message: str


@router.post("/api/kb/{kb_id}/sessions", summary="创建会话")
async def create_session(
    kb_id: int,
    body: CreateSessionRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_rate_limit(request, current_user.id)
    result = await db.execute(
        select(KnowledgeBase).where(KnowledgeBase.id == kb_id, KnowledgeBase.user_id == current_user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="知识库不存在")

    session = Session(user_id=current_user.id, kb_id=kb_id, title=body.title)
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return {"id": session.id, "title": session.title, "kb_id": session.kb_id, "created_at": session.created_at}


@router.get("/api/kb/{kb_id}/sessions", summary="列出会话")
async def list_sessions(
    kb_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_rate_limit(request, current_user.id)
    result = await db.execute(
        select(KnowledgeBase).where(KnowledgeBase.id == kb_id, KnowledgeBase.user_id == current_user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="知识库不存在")

    result = await db.execute(
        select(Session).where(Session.kb_id == kb_id, Session.user_id == current_user.id)
    )
    sessions = result.scalars().all()
    return [
        {"id": s.id, "title": s.title, "kb_id": s.kb_id, "created_at": s.created_at, "updated_at": s.updated_at}
        for s in sessions
    ]


@router.get("/api/sessions/{session_id}/messages", summary="获取历史消息")
async def get_messages(
    session_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_rate_limit(request, current_user.id)
    result = await db.execute(
        select(Session).where(Session.id == session_id, Session.user_id == current_user.id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")

    result = await db.execute(
        select(Message).where(Message.session_id == session_id).order_by(Message.created_at)
    )
    messages = result.scalars().all()
    return [
        {
            "id": m.id,
            "role": m.role,
            "content": m.content,
            "sources": m.sources,
            "created_at": m.created_at,
        }
        for m in messages
    ]


@router.post("/api/sessions/{session_id}/chat", summary="发送消息（流式）")
async def chat(
    session_id: int,
    body: ChatRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_rate_limit(request, current_user.id)

    result = await db.execute(
        select(Session).where(Session.id == session_id, Session.user_id == current_user.id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")

    # 获取历史消息
    result = await db.execute(
        select(Message).where(Message.session_id == session_id).order_by(Message.created_at)
    )
    all_messages = result.scalars().all()
    history = [{"role": m.role, "content": m.content} for m in all_messages]

    # 判断是否需要记忆压缩
    if await should_compress_history(history):
        logger.info(f"会话 {session_id} 触发记忆压缩")
        new_summary = await get_new_summary(session.summary, history)
        session.summary = new_summary
        await db.commit()

    # 保存用户消息
    user_msg = Message(session_id=session_id, role="user", content=body.message)
    db.add(user_msg)
    await db.commit()
    await db.refresh(user_msg)

    start_time = time.time()

    async def event_generator():
        full_response = []
        sources = []

        try:
            async for text_chunk, chunk_sources in rag_chat_stream(
                kb_id=session.kb_id,
                session_summary=session.summary,
                history_messages=history,
                user_question=body.message,
            ):
                if text_chunk:
                    full_response.append(text_chunk)
                    yield f"data: {json.dumps({'type': 'text', 'content': text_chunk}, ensure_ascii=False)}\n\n"
                if chunk_sources:
                    sources = chunk_sources

        except Exception as e:
            logger.error(f"RAG 流式生成失败: {e}", exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'content': '生成回答时发生错误'}, ensure_ascii=False)}\n\n"
            return

        # 保存 assistant 回答
        response_time = time.time() - start_time
        assistant_content = "".join(full_response)

        # 格式化 sources
        sources_data = [
            {
                "filename": s["filename"],
                "chunk_index": s["chunk_index"],
                "text": s["text"][:300],
                "score": round(s["score"], 4),
            }
            for s in sources
        ]

        async with db.begin():
            assistant_msg = Message(
                session_id=session_id,
                role="assistant",
                content=assistant_content,
                sources=sources_data,
                response_time=response_time,
            )
            db.add(assistant_msg)

        await db.commit()
        await db.refresh(assistant_msg)

        # 保存检索日志
        for s in sources:
            log = RetrievalLog(
                message_id=assistant_msg.id,
                document_id=int(s["document_id"]) if s.get("document_id") else None,
                chunk_index=s["chunk_index"],
                chunk_text=s["text"][:1000],
                score=s["score"],
            )
            db.add(log)
        await db.commit()

        # 发送 sources 事件
        yield f"data: {json.dumps({'type': 'sources', 'content': sources_data}, ensure_ascii=False)}\n\n"
        yield f"data: {json.dumps({'type': 'done', 'message_id': assistant_msg.id}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.delete("/api/sessions/{session_id}", summary="删除会话")
async def delete_session(
    session_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_rate_limit(request, current_user.id)
    result = await db.execute(
        select(Session).where(Session.id == session_id, Session.user_id == current_user.id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")

    await db.delete(session)
    await db.commit()
    return {"message": "会话已删除"}


@router.patch("/api/sessions/{session_id}", summary="重命名会话")
async def rename_session(
    session_id: int,
    body: RenameSessionRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_rate_limit(request, current_user.id)
    result = await db.execute(
        select(Session).where(Session.id == session_id, Session.user_id == current_user.id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")

    title = body.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="标题不能为空")

    session.title = title
    await db.commit()
    return {"id": session.id, "title": session.title, "kb_id": session.kb_id}
