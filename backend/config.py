from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # 数据库
    database_url: str = "postgresql://ai_user:ai_password@postgres:5432/ai_assistant"

    # Redis
    redis_url: str = "redis://redis:6379/0"

    # LLM
    llm_base_url: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    llm_api_key: str = ""
    llm_model: str = "qwen3.6-plus-2026-04-02"

    # Embedding
    embedding_base_url: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    embedding_api_key: str = ""
    embedding_model: str = "text-embedding-v3"

    # 语音
    dashscope_api_key: str = ""
    stt_model: str = "qwen3-asr-flash-2026-02-10"
    tts_model: str = "cosyvoice-v3-flash"
    tts_voice: str = "longanyang"

    # JWT
    jwt_secret: str = "changeme"
    jwt_expire_days: int = 7

    # 限流
    rate_limit_per_minute: int = 30

    # Chroma
    chroma_host: str = "chroma"
    chroma_port: int = 8001

    # 文件存储
    file_storage_path: str = "/data/files"

    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
