from fastapi import Request, HTTPException
from redis_client import redis_client
from config import settings
import time


async def check_rate_limit(request: Request, user_id: int):
    """滑动窗口限流：每用户每分钟最多 N 次请求"""
    key = f"rate_limit:{user_id}"
    now = time.time()
    window = 60  # 1 分钟窗口
    limit = settings.rate_limit_per_minute

    pipe = redis_client.pipeline()
    # 移除窗口外的记录
    await pipe.zremrangebyscore(key, 0, now - window)
    # 添加当前请求时间戳
    await pipe.zadd(key, {str(now): now})
    # 计算当前窗口内请求数
    await pipe.zcard(key)
    # 设置过期时间
    await pipe.expire(key, window)
    results = await pipe.execute()

    count = results[2]
    if count > limit:
        raise HTTPException(
            status_code=429,
            detail=f"请求过于频繁，每分钟最多 {limit} 次请求",
        )


def get_client_ip(request: Request) -> str:
    """获取客户端真实 IP，优先从 X-Forwarded-For 取"""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def check_ip_rate_limit(request: Request, limit: int = 10, window: int = 60):
    """IP 级别限流：每 IP 每分钟最多 N 次请求（用于登录/注册等无用户态端点）"""
    ip = get_client_ip(request)
    key = f"ip_rate_limit:{ip}"
    now = time.time()

    pipe = redis_client.pipeline()
    await pipe.zremrangebyscore(key, 0, now - window)
    await pipe.zadd(key, {str(now): now})
    await pipe.zcard(key)
    await pipe.expire(key, window)
    results = await pipe.execute()

    count = results[2]
    if count > limit:
        raise HTTPException(
            status_code=429,
            detail=f"请求过于频繁，请稍后再试",
        )
