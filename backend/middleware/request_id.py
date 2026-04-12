"""
请求链路追踪中间件 — 为每个请求生成唯一 ID，注入 response header 并写入日志上下文。
"""
import uuid
import contextvars
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from utils.logger import set_request_id

# Context variable holding the current request ID for use in logging
request_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="")


class RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Prefer client-provided ID, otherwise generate one
        req_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        request_id_var.set(req_id)
        set_request_id(req_id)

        response = await call_next(request)
        response.headers["X-Request-ID"] = req_id
        return response


def get_request_id() -> str:
    """Get the current request ID from context."""
    return request_id_var.get()
