from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Float, func, Text
from database import Base


class KnowledgeBase(Base):
    __tablename__ = "knowledge_bases"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    description = Column(String(1000), nullable=True)
    top_k = Column(Integer, nullable=False, default=5)
    score_threshold = Column(Float, nullable=False, default=0.5)
    system_prompt = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
