from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel
from database import get_db
from models.user import User
from models.message import Message
from models.feedback import Feedback, RetrievalLog
from models.session import Session
from models.document import Document
from middleware.auth import get_current_user
from middleware.rate_limit import check_rate_limit

router = APIRouter(tags=["评测系统"])


class FeedbackRequest(BaseModel):
    rating: int  # 1 = 点赞, -1 = 踩


@router.post("/api/messages/{message_id}/feedback", summary="提交点赞/踩")
async def submit_feedback(
    message_id: int,
    body: FeedbackRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_rate_limit(request, current_user.id)

    if body.rating not in (1, -1):
        raise HTTPException(status_code=400, detail="rating 只能是 1（点赞）或 -1（踩）")

    result = await db.execute(select(Message).where(Message.id == message_id))
    msg = result.scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=404, detail="消息不存在")

    # IDOR 校验：验证消息所属的会话属于当前用户
    result = await db.execute(
        select(Session).where(Session.id == msg.session_id, Session.user_id == current_user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="消息不存在")

    # 检查是否已评价，若有则更新
    result = await db.execute(
        select(Feedback).where(Feedback.message_id == message_id, Feedback.user_id == current_user.id)
    )
    existing = result.scalar_one_or_none()

    if existing:
        existing.rating = body.rating
    else:
        feedback = Feedback(message_id=message_id, user_id=current_user.id, rating=body.rating)
        db.add(feedback)

    await db.commit()
    return {"message": "评价已提交"}


@router.get("/api/kb/{kb_id}/stats", summary="获取知识库统计")
async def get_stats(
    kb_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_rate_limit(request, current_user.id)

    # 获取该 KB 的所有会话 ID
    result = await db.execute(
        select(Session.id).where(Session.kb_id == kb_id, Session.user_id == current_user.id)
    )
    session_ids = [row[0] for row in result.all()]

    if not session_ids:
        return {
            "total_messages": 0,
            "total_feedbacks": 0,
            "positive_rate": None,
            "avg_response_time": None,
        }

    # 统计 assistant 消息数
    result = await db.execute(
        select(func.count(Message.id)).where(
            Message.session_id.in_(session_ids),
            Message.role == "assistant",
        )
    )
    total_messages = result.scalar() or 0

    # 获取所有 assistant 消息 ID
    result = await db.execute(
        select(Message.id).where(
            Message.session_id.in_(session_ids),
            Message.role == "assistant",
        )
    )
    message_ids = [row[0] for row in result.all()]

    positive_rate = None
    total_feedbacks = 0
    if message_ids:
        result = await db.execute(
            select(func.count(Feedback.id)).where(Feedback.message_id.in_(message_ids))
        )
        total_feedbacks = result.scalar() or 0

        result = await db.execute(
            select(func.count(Feedback.id)).where(
                Feedback.message_id.in_(message_ids),
                Feedback.rating == 1,
            )
        )
        positive_count = result.scalar() or 0

        if total_feedbacks > 0:
            positive_rate = round(positive_count / total_feedbacks, 4)

    # 平均响应时间
    result = await db.execute(
        select(func.avg(Message.response_time)).where(
            Message.session_id.in_(session_ids),
            Message.role == "assistant",
            Message.response_time.isnot(None),
        )
    )
    avg_time = result.scalar()

    return {
        "total_messages": total_messages,
        "total_feedbacks": total_feedbacks,
        "positive_rate": positive_rate,
        "avg_response_time": round(float(avg_time), 3) if avg_time else None,
    }


@router.get("/api/messages/{message_id}/sources", summary="查看检索来源")
async def get_message_sources(
    message_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_rate_limit(request, current_user.id)

    result = await db.execute(select(Message).where(Message.id == message_id))
    msg = result.scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=404, detail="消息不存在")

    # IDOR 校验：验证消息所属的会话属于当前用户
    result = await db.execute(
        select(Session).where(Session.id == msg.session_id, Session.user_id == current_user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="消息不存在")

    result = await db.execute(
        select(RetrievalLog).where(RetrievalLog.message_id == message_id)
    )
    logs = result.scalars().all()

    return [
        {
            "id": log.id,
            "document_id": log.document_id,
            "chunk_index": log.chunk_index,
            "chunk_text": log.chunk_text,
            "score": log.score,
            "created_at": log.created_at,
        }
        for log in logs
    ]
