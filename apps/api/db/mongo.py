"""
MongoDB Atlas Async Client & Index Manager
Ties connection to active asyncio event loop to ensure safety in test runners and async streaming.
"""
from __future__ import annotations
import asyncio
import logging
from typing import Optional
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from config import settings

logger = logging.getLogger("mongo_client")

_client: Optional[AsyncIOMotorClient] = None
_db: Optional[AsyncIOMotorDatabase] = None
_client_loop = None


async def get_db() -> AsyncIOMotorDatabase:
    """Returns the singleton AsyncIOMotorDatabase connection tied to current event loop."""
    global _client, _db, _client_loop
    try:
        current_loop = asyncio.get_running_loop()
    except RuntimeError:
        current_loop = None

    if _db is None or _client_loop != current_loop:
        try:
            clean_url = (settings.mongo_url or "").strip("\"' \t\r\n")
            _client = AsyncIOMotorClient(
                clean_url,
                serverSelectionTimeoutMS=2500,
                connectTimeoutMS=2500,
                socketTimeoutMS=2500,
                maxPoolSize=25,
                minPoolSize=1
            )
            _db = _client[settings.mongo_db_name]
            _client_loop = current_loop
            logger.info("Connected to MongoDB Atlas: %s", settings.mongo_db_name)
        except Exception as exc:
            logger.error("Failed to connect to MongoDB Atlas: %s", exc)
            raise exc
    return _db


async def ensure_indexes(db: AsyncIOMotorDatabase) -> None:
    """Creates performance and query indexes for conversation history and audit trails."""
    try:
        await db.conversations.create_index("id", unique=True)
        await db.messages.create_index([("conversation_id", 1), ("created_at", 1)])
        await db.audit_logs.create_index([("conversation_id", 1), ("step_type", 1)])
        await db.audit_logs.create_index("created_at")
    except Exception as exc:
        logger.warning("MongoDB index initialization notice: %s", exc)


async def check_mongo_health() -> bool:
    """Pings MongoDB Atlas cluster for /health endpoint."""
    try:
        db = await get_db()
        res = await db.command("ping")
        return bool(res.get("ok", 0) == 1)
    except Exception:
        return False
