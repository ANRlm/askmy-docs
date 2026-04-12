import redis.asyncio as aioredis
from redis import Redis
from config import settings

# 异步 Redis 客户端（用于 API 限流等）
redis_client = aioredis.from_url(settings.redis_url, decode_responses=True)

# 同步 Redis 客户端（用于 RQ worker）
sync_redis = Redis.from_url(settings.redis_url)
