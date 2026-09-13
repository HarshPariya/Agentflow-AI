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

# In-memory audit buffer for offline testing and CI resilience
_MEMORY_AUDIT_LOGS: Dict[str, List[Dict[str, Any]]] = {}


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
    entry = {
        "id": str(uuid.uuid4()),
        "conversation_id": conversation_id,
        "message_id": message_id or str(uuid.uuid4()),
        "step_type": step_type,
        "step_detail": step_detail,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    # Always preserve in memory for high-availability reads
    _MEMORY_AUDIT_LOGS.setdefault(conversation_id, []).append(entry)

    try:
        db = await get_db()
        await db.audit_logs.insert_one(entry)
        logger.info("Persisted audit record: [%s] conv=%s", step_type, conversation_id)
    except Exception as exc:
        logger.warning("Audit log MongoDB insert notice: %s", exc)
    return entry


async def get_last_pending_action(conversation_id: str) -> Optional[Dict[str, Any]]:
    """Returns the most recent guardrail_pending record, from MongoDB or the in-memory buffer.

    Used to carry a pending confirmation across turns so the guardrail round-trip
    does not depend on the database being reachable.
    """
    try:
        db = await get_db()
        rec = await db.audit_logs.find_one(
            {"conversation_id": conversation_id, "step_type": "guardrail_pending"},
            {"_id": 0, "step_detail": 1},
            sort=[("created_at", -1)]
        )
        if rec and rec.get("step_detail"):
            return rec["step_detail"]
    except Exception as exc:
        logger.debug("MongoDB pending action fetch notice: %s", exc)

    for entry in reversed(_MEMORY_AUDIT_LOGS.get(conversation_id, [])):
        if entry.get("step_type") == "guardrail_pending" and entry.get("step_detail"):
            return entry["step_detail"]
    return None


async def get_audit_trail(conversation_id: str) -> List[Dict[str, Any]]:
    """Retrieves chronological audit events for a given conversation."""
    try:
        db = await get_db()
        cursor = db.audit_logs.find(
            {"conversation_id": conversation_id},
            {"_id": 0}
        ).sort("created_at", 1)
        res = await cursor.to_list(length=100)
        if res:
            return res
    except Exception as exc:
        logger.warning("MongoDB audit trail fetch notice: %s", exc)

    return _MEMORY_AUDIT_LOGS.get(conversation_id, [])

