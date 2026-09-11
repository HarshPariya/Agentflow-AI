"""
Health Check Route
Verifies connectivity to MongoDB Atlas, Redis, and Vector Store.
Section 9: Returns { status, db, redis, vector_store } - does not unconditionally return 200.
"""
from __future__ import annotations
import logging
from fastapi import APIRouter

from cache.redis_client import check_redis_health
from db.mongo import check_mongo_health
from rag.embed import store

logger = logging.getLogger("health_route")
router = APIRouter(tags=["Health"])


@router.get("/health")
async def health_check():
    """
    Checks each dependency and returns individual status.
    """
    # 1. MongoDB Atlas check
    db_ok = await check_mongo_health()
    db_status = "ok" if db_ok else "degraded"

    # 2. Redis check
    redis_ok = await check_redis_health()
    redis_status = "ok" if redis_ok else "fallback_memory"

    # 3. Vector Store check
    vector_ok = bool(len(store.chunks) > 0)
    vector_status = "ok" if vector_ok else "empty"

    overall = "ok" if db_ok and vector_ok else "degraded"

    return {
        "status": overall,
        "db": db_status,
        "redis": redis_status,
        "vector_store": vector_status
    }
