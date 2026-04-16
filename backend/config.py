from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import List


class Settings(BaseSettings):
    # 数据库
    database_url: str = ""

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
    chroma_port: int = 8000

    # 文件存储
    file_storage_path: str = "/data/files"

    # Email
    email_smtp_host: str = ""
    email_smtp_port: int = 587
    email_username: str = ""
    email_password: str = ""
    email_from_address: str = "noreply@askmydocs.com"
    email_use_tls: bool = True

    # CORS — 多个域名用英文逗号分隔，例如：http://localhost:3000,https://example.com
    cors_origins: str = "http://localhost:3000"

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
