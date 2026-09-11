"""
Audit Logging Service for Agentflow-AI
Records and queries structured audit trails in MongoDB Atlas.
"""
from __future__ import annotations
from datetime import datetime, timezone
import logging
import uuid
from typing import Any, Dict, List, Optional

from db.mongo import get_db

logger = logging.getLogger("audit_logger")


async def record_audit_step(
    conversation_id: str,
    step_type: str,
    step_detail: Dict[str, Any],
    message_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Persists an immutable audit log record to MongoDB Atlas.
    Matches exact shapes defined in Section 6 of Capstone Technical Documentation.
    """
    db = await get_db()
    entry = {
        "id": str(uuid.uuid4()),
        "conversation_id": conversation_id,
        "message_id": message_id or str(uuid.uuid4()),
        "step_type": step_type,
        "step_detail": step_detail,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    try:
        await db.audit_logs.insert_one(entry)
        logger.info("Persisted audit record: [%s] conv=%s", step_type, conversation_id)
    except Exception as exc:
        logger.error("Audit log persistence failed: %s", exc)
    return entry


async def get_audit_trail(conversation_id: str) -> List[Dict[str, Any]]:
    """Retrieves chronological audit events for a given conversation."""
    db = await get_db()
    cursor = db.audit_logs.find(
        {"conversation_id": conversation_id},
        {"_id": 0}
    ).sort("created_at", 1)
    return await cursor.to_list(length=100)
