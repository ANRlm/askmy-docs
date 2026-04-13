import asyncio
import json
import secrets
import time
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from pydantic import BaseModel
from database import get_db
from models.user import User
from models.knowledge_base import KnowledgeBase
from models.session import Session
from models.message import Message
from middleware.auth import get_current_user
from middleware.rate_limit import check_rate_limit
from services.rag_service import (
    rag_chat_stream, get_new_summary, log_retrieval
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
    cursor: int | None = Query(None, description="上次返回的最后一个会话 ID"),
    limit: int = Query(50, ge=1, le=100, description="每页数量"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_rate_limit(request, current_user.id)
    result = await db.execute(
        select(KnowledgeBase).where(KnowledgeBase.id == kb_id, KnowledgeBase.user_id == current_user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="知识库不存在")

    query = select(Session).where(
        Session.kb_id == kb_id,
        Session.user_id == current_user.id,
    )
    if cursor is not None:
        query = query.where(Session.id < cursor)
    query = query.order_by(Session.id.desc()).limit(limit)

    result = await db.execute(query)
    sessions = result.scalars().all()
    return [
        {"id": s.id, "title": s.title, "kb_id": s.kb_id, "created_at": s.created_at, "updated_at": s.updated_at}
        for s in sessions
    ]


@router.post("/api/sessions/{session_id}/share", summary="生成分享链接")
async def create_share_link(
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

    if not session.share_token:
        session.share_token = secrets.token_urlsafe(32)
        await db.commit()

    return {"share_url": f"/api/share/{session.share_token}"}


@router.get("/api/share/{token}", summary="公开只读访问分享会话")
async def get_shared_session(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Session).where(Session.share_token == token)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="分享链接无效或已失效")

    result = await db.execute(
        select(Message).where(Message.session_id == session.id).order_by(Message.created_at)
    )
    messages = result.scalars().all()
    return {
        "id": session.id,
        "title": session.title,
        "kb_id": session.kb_id,
        "messages": [
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "sources": m.sources,
                "created_at": m.created_at,
            }
            for m in messages
        ],
    }


@router.get("/api/sessions/{session_id}/messages", summary="获取历史消息")
async def get_messages(
    session_id: int,
    request: Request,
    cursor: int | None = Query(None, description="上一页最后一条消息的 ID"),
    limit: int = Query(50, ge=1, le=200, description="每页数量"),
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

    query = select(Message).where(Message.session_id == session_id)
    if cursor is not None:
        cursor_result = await db.execute(
            select(Message.created_at).where(Message.id == cursor, Message.session_id == session_id)
        )
        cursor_row = cursor_result.scalar_one_or_none()
        if cursor_row is None:
            raise HTTPException(status_code=400, detail="无效的 cursor")
        query = query.where(Message.created_at < cursor_row)

    query = query.order_by(Message.created_at.desc()).limit(limit)
    result = await db.execute(query)
    messages = list(result.scalars().all())

    has_more = len(messages) == limit
    next_cursor = messages[-1].id if has_more and messages else None

    messages_serialized = [
        {
            "id": m.id,
            "role": m.role,
            "content": m.content,
            "sources": m.sources,
            "created_at": m.created_at,
        }
        for m in reversed(messages)
    ]
    return {
        "messages": messages_serialized,
        "next_cursor": next_cursor,
        "has_more": has_more,
    }


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

    # Fetch KB-level RAG params
    kb_result = await db.execute(
        select(KnowledgeBase.top_k, KnowledgeBase.score_threshold).where(KnowledgeBase.id == session.kb_id)
    )
    kb_row = kb_result.first()
    top_k = kb_row.top_k if kb_row else 5
    score_threshold = kb_row.score_threshold if kb_row else 0.5

    # 获取历史消息（只取最近 20 条用于上下文，压缩判断用计数）
    from sqlalchemy import func
    msg_count_result = await db.execute(
        select(func.count()).select_from(Message).where(Message.session_id == session_id)
    )
    total_msg_count = msg_count_result.scalar() or 0

    # Only load last 20 messages for LLM context
    recent_result = await db.execute(
        select(Message)
        .where(Message.session_id == session_id)
        .order_by(Message.created_at.desc())
        .limit(20)
    )
    recent_messages = recent_result.scalars().all()
    # Preserve chronological order for the LLM
    history = [{"role": m.role, "content": m.content} for m in reversed(list(recent_messages))]

    # 保存用户消息
    user_msg = Message(session_id=session_id, role="user", content=body.message)
    db.add(user_msg)
    await db.commit()
    await db.refresh(user_msg)

    start_time = time.time()

    # 记忆压缩改为后台异步执行，不阻塞流式响应
    # total_msg_count includes new user msg, subtract 1 to get rounds before new message
    rounds_before_new = (total_msg_count - 1) // 2
    should_compress = rounds_before_new > 10
    if should_compress:
        logger.info(f"会话 {session_id} 触发记忆压缩（后台异步执行）")

        async def compress_and_save():
            from database import AsyncSessionLocal
            from sqlalchemy import update, select
            from models.session import Session as SessionModel
            from models.message import Message
            # Cancel any prior compression task for this session
            if session_id in _active_compression_tasks:
                _active_compression_tasks[session_id].cancel()
            task = asyncio.current_task()
            _active_compression_tasks[session_id] = task
            try:
                async with AsyncSessionLocal() as db_compress:
                    # Load full history lazily — only when compression is triggered
                    result = await db_compress.execute(
                        select(Message).where(Message.session_id == session_id).order_by(Message.created_at)
                    )
                    all_messages = result.scalars().all()
                    full_history = [{"role": m.role, "content": m.content} for m in all_messages]
                    new_summary = await get_new_summary(session.summary, full_history)
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
        assistant_msg_id = None

        try:
            async for text_chunk, chunk_sources in rag_chat_stream(
                kb_id=session.kb_id,
                session_summary=session.summary,
                history_messages=history,
                user_question=body.message,
                top_k=top_k,
                score_threshold=score_threshold,
            ):
                if text_chunk:
                    full_response.append(text_chunk)
                    yield f"data: {json.dumps({'type': 'text', 'content': text_chunk}, ensure_ascii=False)}\n\n"
                if chunk_sources:
                    sources = chunk_sources

        except Exception as e:
            logger.error(f"RAG 流式生成失败: {e}", exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'content': '生成回答时发生错误'}, ensure_ascii=False)}\n\n"

        # finally 确保 done 一定发送（即使中间抛异常也不例外）
        finally:
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

            try:
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
                    await log_retrieval(db, assistant_msg.id, sources)
                assistant_msg_id = assistant_msg.id
            except Exception as e:
                logger.error(f"保存 assistant 消息失败: {e}")

            if sources_data:
                yield f"data: {json.dumps({'type': 'sources', 'content': sources_data}, ensure_ascii=False)}\n\n"
            if assistant_msg_id is not None:
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


@router.delete("/api/messages/{message_id}", status_code=204, summary="删除消息")
async def delete_message(
    message_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_rate_limit(request, current_user.id)

    result = await db.execute(
        select(Message).where(Message.id == message_id)
    )
    message = result.scalar_one_or_none()
    if not message:
        raise HTTPException(status_code=404, detail="消息不存在")

    # IDOR check: verify the message's session belongs to the current user
    session_result = await db.execute(
        select(Session).where(Session.id == message.session_id, Session.user_id == current_user.id)
    )
    if not session_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="消息不存在")

    # Cascade delete RetrievalLog records (Feedback via CASCADE)
    from models.feedback import RetrievalLog
    await db.execute(
        delete(RetrievalLog).where(RetrievalLog.message_id == message_id)
    )

    await db.delete(message)
    await db.commit()


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

    # Fetch KB-level RAG params
    kb_result = await db.execute(
        select(KnowledgeBase.top_k, KnowledgeBase.score_threshold).where(KnowledgeBase.id == session.kb_id)
    )
    kb_row = kb_result.first()
    top_k = kb_row.top_k if kb_row else 5
    score_threshold = kb_row.score_threshold if kb_row else 0.5

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
        assistant_msg_id = None

        try:
            async for text_chunk, chunk_sources in rag_chat_stream(
                kb_id=session.kb_id,
                session_summary=None,
                history_messages=history,
                user_question=new_content,
                top_k=top_k,
                score_threshold=score_threshold,
            ):
                if text_chunk:
                    full_response.append(text_chunk)
                    yield f"data: {json.dumps({'type': 'text', 'content': text_chunk}, ensure_ascii=False)}\n\n"
                if chunk_sources:
                    sources = chunk_sources

        except Exception as e:
            logger.error(f"回溯 RAG 流式生成失败: {e}", exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'content': '生成回答时发生错误'}, ensure_ascii=False)}\n\n"

        finally:
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

            try:
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
                    await log_retrieval(db, assistant_msg.id, sources)
                assistant_msg_id = assistant_msg.id
            except Exception as e:
                logger.error(f"保存回溯消息失败: {e}")

            yield f"data: {json.dumps({'type': 'user_msg_id', 'message_id': user_msg.id}, ensure_ascii=False)}\n\n"
            if sources_data:
                yield f"data: {json.dumps({'type': 'sources', 'content': sources_data}, ensure_ascii=False)}\n\n"
            if assistant_msg_id is not None:
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
