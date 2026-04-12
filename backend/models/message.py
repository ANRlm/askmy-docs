from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, func, Text, Float
from sqlalchemy.dialects.postgresql import JSONB
from database import Base


class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(20), nullable=False)  # user / assistant
    content = Column(Text, nullable=False)
    sources = Column(JSONB, nullable=True)  # 引用来源列表
    response_time = Column(Float, nullable=True)  # 响应耗时（秒）
    created_at = Column(DateTime(timezone=True), server_default=func.now())
