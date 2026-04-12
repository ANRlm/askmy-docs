from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from loguru import logger

from utils.logger import setup_logger
from database import init_db
from config import settings
from clients import init_clients, close_clients
from api.auth import router as auth_router
from api.knowledge_base import router as kb_router
from api.documents import router as doc_router
from api.sessions import router as session_router
from api.voice import router as voice_router
from api.stats import router as stats_router
from middleware.request_id import RequestIDMiddleware

setup_logger()

_INSECURE_SECRETS = {"changeme", "change-me", "change-me-use-openssl-rand-hex-32", "secret", ""}


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("启动 AI 知识助手后端服务...")

    # 生产安全检查
    if settings.jwt_secret in _INSECURE_SECRETS:
        logger.warning(
            "⚠️  JWT_SECRET 使用了不安全的默认值！"
            " 请在 .env 中设置随机密钥：openssl rand -hex 32"
        )

    init_clients()
    logger.info("外部服务客户端初始化完成")

    await init_db()
    logger.info("数据库初始化完成")
    yield
    close_clients()
    logger.info("服务关闭")


app = FastAPI(
    title="AI 知识助手 API",
    description="企业级 AI 知识问答系统，支持私有知识库创建、文档上传、多轮对话问答和语音交互。",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RequestIDMiddleware)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"未处理异常: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"code": 500, "message": "服务器内部错误", "detail": str(exc)},
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"code": exc.status_code, "message": exc.detail, "detail": None},
    )


# 注册路由
app.include_router(auth_router)
app.include_router(kb_router)
app.include_router(doc_router)
app.include_router(session_router)
app.include_router(voice_router)
app.include_router(stats_router)


@app.get("/health", tags=["健康检查"])
async def health():
    return {"status": "ok"}
