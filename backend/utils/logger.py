from loguru import logger
import sys
import contextvars


_request_id_ctx: contextvars.ContextVar[str] = contextvars.ContextVar("_request_id_ctx", default="")


def set_request_id(rid: str):
    _request_id_ctx.set(rid)


def setup_logger():
    logger.remove()

    def format_with_request_id(record):
        rid = _request_id_ctx.get()
        record["extra"]["request_id"] = rid[:8] if rid else "-"
        return (
            "<green>{time:YYYY-MM-DD HH:mm:ss}</green> | "
            "<level>{level: <8}</level> | "
            "<cyan>{extra[request_id]}</cyan> | "
            "<cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - "
            "<level>{message}</level>"
        )

    logger.add(
        sys.stdout,
        format=format_with_request_id,
        level="INFO",
    )
    logger.add(
        "/tmp/ai_assistant.log",
        rotation="50 MB",
        retention="7 days",
        level="DEBUG",
        format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {extra[request_id]} | {name}:{function}:{line} - {message}",
        extra={"request_id": ""},
    )
    return logger
