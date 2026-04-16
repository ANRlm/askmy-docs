from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, func, Text, Index
from database import Base


class Session(Base):
    __table_args__ = (
        Index("ix_sessions_kb_updated", "kb_id", "updated_at"),
    )
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    kb_id = Column(Integer, ForeignKey("knowledge_bases.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(500), nullable=False, default="新会话")
    summary = Column(Text, nullable=True)
    share_token = Column(String(64), nullable=True, unique=True, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
