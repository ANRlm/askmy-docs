import asyncio
import json
import time
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
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

# Track active compression tasks per session so they can be cancelled on session deletion
_active_compression_tasks: dict[int, asyncio.Task] = {}


class CreateSessionRequest(BaseModel):
    title: str = "新会话"


class RenameSessionRequest(BaseModel):
    title: str


class ChatRequest(BaseModel):
    message: str


class RetraceRequest(BaseModel):
    message_id: int
    content: str  # 新的用户消息内容（可与原内容相同）


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

    # 保存用户消息
    user_msg = Message(session_id=session_id, role="user", content=body.message)
    db.add(user_msg)
    await db.commit()
    await db.refresh(user_msg)

    start_time = time.time()

    # 记忆压缩改为后台异步执行，不阻塞流式响应
    if await should_compress_history(history):
        logger.info(f"会话 {session_id} 触发记忆压缩（后台异步执行）")

        async def compress_and_save():
            from database import AsyncSessionLocal
            from sqlalchemy import update
            from models.session import Session as SessionModel
            # Cancel any prior compression task for this session
            if session_id in _active_compression_tasks:
                _active_compression_tasks[session_id].cancel()
            task = asyncio.current_task()
            _active_compression_tasks[session_id] = task
            try:
                # Use a fresh DB session to avoid relying on the request-scoped one
                async with AsyncSessionLocal() as db_compress:
                    new_summary = await get_new_summary(session.summary, history)
                    await db_compress.execute(
                        update(SessionModel)
                        .where(SessionModel.id == session_id)
                        .values(summary=new_summary)
                    )
                    await db_compress.commit()
                logger.info(f"会话 {session_id} 记忆压缩完成")
            except asyncio.CancelledError:
                logger.info(f"会话 {session_id} 记忆压缩被取消")
            except Exception as e:
                logger.error(f"后台记忆压缩失败: {e}")
            finally:
                _active_compression_tasks.pop(session_id, None)

        asyncio.create_task(compress_and_save())

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

        # 保存 assistant 回答 + 检索日志（一次事务，一次提交）
        response_time = time.time() - start_time
        assistant_content = "".join(full_response)

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
            await db.flush()  # 获取 assistant_msg.id（不提交事务）
            # 批量保存检索日志
            db.add_all([
                RetrievalLog(
                    message_id=assistant_msg.id,
                    document_id=int(s["document_id"]) if s.get("document_id") else None,
                    chunk_index=s["chunk_index"],
                    chunk_text=s["text"][:1000],
                    score=s["score"],
                )
                for s in sources
            ])
        # 事务自动提交

        assistant_msg_id = assistant_msg.id

        # 发送 sources 事件
        yield f"data: {json.dumps({'type': 'sources', 'content': sources_data}, ensure_ascii=False)}\n\n"
        yield f"data: {json.dumps({'type': 'done', 'message_id': assistant_msg_id}, ensure_ascii=False)}\n\n"

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

    # Cancel any in-flight compression task before deleting the session
    if session_id in _active_compression_tasks:
        _active_compression_tasks[session_id].cancel()
        del _active_compression_tasks[session_id]

    await db.delete(session)
    await db.commit()
    return {"message": "会话已删除"}


@router.post("/api/sessions/{session_id}/retrace", summary="回溯并重新生成（修改历史消息）")
async def retrace_chat(
    session_id: int,
    body: RetraceRequest,
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

    # 找到目标用户消息，确认它属于该会话且 role=user
    result = await db.execute(
        select(Message).where(Message.id == body.message_id, Message.session_id == session_id)
    )
    target_msg = result.scalar_one_or_none()
    if not target_msg:
        raise HTTPException(status_code=404, detail="消息不存在")
    if target_msg.role != "user":
        raise HTTPException(status_code=400, detail="只能回溯用户消息")

    # 删除目标消息及其之后的所有消息（Feedback/RetrievalLog 通过 CASCADE 自动删除）
    await db.execute(
        delete(Message).where(
            Message.session_id == session_id,
            Message.created_at >= target_msg.created_at,
        )
    )

    # 清空记忆摘要（历史已被截断，摘要可能引用已删除的内容）
    session.summary = None
    await db.commit()

    # 获取截断后的历史消息作为新的 history
    result = await db.execute(
        select(Message).where(Message.session_id == session_id).order_by(Message.created_at)
    )
    remaining_messages = result.scalars().all()
    history = [{"role": m.role, "content": m.content} for m in remaining_messages]

    # 保存新的用户消息
    new_content = body.content.strip() or target_msg.content
    user_msg = Message(session_id=session_id, role="user", content=new_content)
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
                session_summary=None,
                history_messages=history,
                user_question=new_content,
            ):
                if text_chunk:
                    full_response.append(text_chunk)
                    yield f"data: {json.dumps({'type': 'text', 'content': text_chunk}, ensure_ascii=False)}\n\n"
                if chunk_sources:
                    sources = chunk_sources

        except Exception as e:
            logger.error(f"回溯 RAG 流式生成失败: {e}", exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'content': '生成回答时发生错误'}, ensure_ascii=False)}\n\n"
            return

        response_time = time.time() - start_time
        assistant_content = "".join(full_response)

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
            await db.flush()
            db.add_all([
                RetrievalLog(
                    message_id=assistant_msg.id,
                    document_id=int(s["document_id"]) if s.get("document_id") else None,
                    chunk_index=s["chunk_index"],
                    chunk_text=s["text"][:1000],
                    score=s["score"],
                )
                for s in sources
            ])

        assistant_msg_id = assistant_msg.id

        yield f"data: {json.dumps({'type': 'user_msg_id', 'message_id': user_msg.id}, ensure_ascii=False)}\n\n"
        yield f"data: {json.dumps({'type': 'sources', 'content': sources_data}, ensure_ascii=False)}\n\n"
        yield f"data: {json.dumps({'type': 'done', 'message_id': assistant_msg_id}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


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
