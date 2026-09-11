"""
Redis Cache Layer for RAG Retrieval Acceleration
Implements Section 11 of Capstone Technical Documentation.
Caches normalized retrieval query hash -> {query, chunks} with 10m TTL.
Tool results are strictly NEVER cached.
Includes in-memory LRU/TTL fallback when external Redis cluster is not reachable.
"""
from __future__ import annotations
import hashlib
import json
import logging
import time
from typing import Any, Dict, Optional
import redis.asyncio as aioredis

from config import settings

logger = logging.getLogger("redis_cache")

_redis_client: Optional[aioredis.Redis] = None
_in_memory_cache: Dict[str, tuple[float, str]] = {}


async def get_redis_client() -> Optional[aioredis.Redis]:
    """Returns async Redis client singleton or None if offline."""
    global _redis_client
    if _redis_client is None:
        try:
            _redis_client = aioredis.from_url(
                settings.redis_url,
                encoding="utf-8",
                decode_responses=True,
                socket_timeout=1.5,
                socket_connect_timeout=1.5
            )
        except Exception as exc:
            logger.warning("Redis initialization failed, falling back to memory: %s", exc)
            _redis_client = None
    return _redis_client


def hash_query(query: str) -> str:
    """Generates deterministic cache key from normalized query string."""
    normalized = " ".join(query.strip().lower().split())
    digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest()
    return f"rag:cache:{digest}"


async def get_cached_retrieval(query: str) -> Optional[Dict[str, Any]]:
    """Retrieves cached vector search results."""
    key = hash_query(query)
    client = await get_redis_client()
    if client:
        try:
            val = await client.get(key)
            if val:
                logger.info("Redis cache HIT for query: '%s'", query[:30])
                return json.loads(val)
        except Exception as exc:
            logger.debug("Redis get error: %s", exc)

    # In-memory fallback
    now = time.time()
    if key in _in_memory_cache:
        expire_at, data = _in_memory_cache[key]
        if now < expire_at:
            logger.info("Memory cache HIT for query: '%s'", query[:30])
            return json.loads(data)
        else:
            del _in_memory_cache[key]

    return None


async def set_cached_retrieval(query: str, data: Dict[str, Any], ttl: Optional[int] = None) -> None:
    """Caches vector search results for retrieval only."""
    key = hash_query(query)
    ttl_seconds = ttl or settings.cache_ttl_seconds
    payload_str = json.dumps(data)

    client = await get_redis_client()
    if client:
        try:
            await client.set(key, payload_str, ex=ttl_seconds)
            return
        except Exception as exc:
            logger.debug("Redis set error: %s", exc)

    # In-memory fallback
    _in_memory_cache[key] = (time.time() + ttl_seconds, payload_str)


async def check_redis_health() -> bool:
    """Pings Redis for the /health check endpoint."""
    client = await get_redis_client()
    if client:
        try:
            res = await client.ping()
            return bool(res is True)
        except Exception:
            return False
    return False
