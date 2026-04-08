"""Redis cache client for response caching and rate limiting."""

import redis.asyncio as redis
from app.config import settings

_redis: redis.Redis | None = None


async def get_redis() -> redis.Redis:
    global _redis
    if _redis is None:
        _redis = redis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis


async def cache_get(key: str) -> str | None:
    r = await get_redis()
    return await r.get(key)


async def cache_set(key: str, value: str, ttl: int = 300) -> None:
    r = await get_redis()
    await r.set(key, value, ex=ttl)


async def rate_limit_check(key: str, max_requests: int = 60, window: int = 60) -> bool:
    """Simple sliding window rate limiter. Returns True if allowed."""
    r = await get_redis()
    current = await r.incr(key)
    if current == 1:
        await r.expire(key, window)
    return current <= max_requests
