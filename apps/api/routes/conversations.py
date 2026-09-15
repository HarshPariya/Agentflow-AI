"""
Conversation and User Profile Management Routes
Handles multi-session history, conversation resumption, and user profile syncing in MongoDB Atlas.
"""
from __future__ import annotations
from datetime import datetime, timezone
import logging
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query

from db.mongo import get_db
from agent_types.api import UserProfile

logger = logging.getLogger("conversations_router")
router = APIRouter(tags=["Conversations & Auth"])


@router.get("/conversations")
async def list_conversations(user_id: Optional[str] = Query(default=None)) -> List[Dict[str, Any]]:
    """
    Lists conversation summaries sorted by most recent activity.
    Filters by user_id if provided.
    """
    db = await get_db()
    query: Dict[str, Any] = {}
    if user_id and user_id != "all":
        query["user_id"] = user_id

    try:
        cursor = db.conversations.find(query, {"_id": 0}).sort("updated_at", -1).limit(50)
        conversations = await cursor.to_list(length=50)

        # Fallback: if no conversations collection records yet, aggregate from messages collection
        if not conversations:
            pipeline = [
                {"$sort": {"created_at": 1}},
                {
                    "$group": {
                        "_id": "$conversation_id",
                        "first_message": {"$first": "$content"},
                        "last_message": {"$last": "$content"},
                        "message_count": {"$sum": 1},
                        "created_at": {"$first": "$created_at"},
                        "updated_at": {"$last": "$created_at"},
                    }
                },
                {"$sort": {"updated_at": -1}},
                {"$limit": 30}
            ]
            agg = await db.messages.aggregate(pipeline).to_list(length=30)
            for item in agg:
                title = item.get("first_message", "New Conversation")[:45]
                if len(item.get("first_message", "")) > 45:
                    title += "..."
                conversations.append({
                    "id": item["_id"],
                    "user_id": user_id or "user-default",
                    "title": title,
                    "last_message": item.get("last_message", ""),
                    "message_count": item.get("message_count", 1),
                    "created_at": item.get("created_at", datetime.now(timezone.utc).isoformat()),
                    "updated_at": item.get("updated_at", datetime.now(timezone.utc).isoformat())
                })

        return conversations
    except Exception as exc:
        logger.error("Failed to list conversations: %s", exc)
        return []


@router.get("/conversations/{conversation_id}")
async def get_conversation_detail(conversation_id: str) -> Dict[str, Any]:
    """
    Retrieves full conversation messages and execution audit traces.
    """
    db = await get_db()
    try:
        conv = await db.conversations.find_one({"id": conversation_id}, {"_id": 0})
        messages_cursor = db.messages.find({"conversation_id": conversation_id}, {"_id": 0}).sort("created_at", 1)
        messages = await messages_cursor.to_list(length=100)

        audit_cursor = db.audit_logs.find({"conversation_id": conversation_id}, {"_id": 0}).sort("created_at", 1)
        audit_logs = await audit_cursor.to_list(length=100)

        return {
            "conversation": conv or {
                "id": conversation_id,
                "title": messages[0].get("content", "Conversation")[:45] if messages else "Active Session",
                "message_count": len(messages)
            },
            "messages": messages,
            "steps": audit_logs
        }
    except Exception as exc:
        logger.error("Failed to fetch conversation detail: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.delete("/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str) -> Dict[str, str]:
    """
    Deletes a conversation session along with its messages and audit traces.
    """
    db = await get_db()
    try:
        await db.conversations.delete_one({"id": conversation_id})
        await db.messages.delete_many({"conversation_id": conversation_id})
        await db.audit_logs.delete_many({"conversation_id": conversation_id})
        return {"status": "success", "conversation_id": conversation_id}
    except Exception as exc:
        logger.error("Failed to delete conversation: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/auth/user")
async def sync_user_profile(profile: UserProfile) -> Dict[str, Any]:
    """
    Syncs or creates user profile in MongoDB Atlas.
    """
    db = await get_db()
    try:
        user_dict = profile.model_dump()
        user_dict["last_active"] = datetime.now(timezone.utc).isoformat()
        await db.users.update_one(
            {"user_id": profile.user_id},
            {"$set": user_dict},
            upsert=True
        )
        return {"status": "success", "profile": user_dict}
    except Exception as exc:
        logger.error("Failed to sync user profile: %s", exc)
        return {"status": "error", "message": str(exc), "profile": profile.model_dump()}


@router.get("/auth/user/{user_id}")
async def get_user_profile(user_id: str) -> Dict[str, Any]:
    """
    Retrieves user profile from MongoDB Atlas.
    """
    db = await get_db()
    try:
        user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
        if user:
            return user
        return {
            "user_id": user_id,
            "name": "Harsh Sharma",
            "email": "harsh@agentflow.internal",
            "role": "Enterprise Admin"
        }
    except Exception:
        return {
            "user_id": user_id,
            "name": "Harsh Sharma",
            "email": "harsh@agentflow.internal",
            "role": "Enterprise Admin"
        }
