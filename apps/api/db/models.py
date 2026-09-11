"""
MongoDB Document Models for Agentflow-AI
Matches Section 5 of Capstone Technical Documentation.
"""
from __future__ import annotations
from datetime import datetime, timezone
import uuid
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class MessageModel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    conversation_id: str
    role: str  # "user" | "assistant"
    content: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ConversationModel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    messages: List[MessageModel] = Field(default_factory=list)


class AuditLogModel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    conversation_id: str
    message_id: Optional[str] = None
    step_type: str  # "plan" | "retrieval" | "tool_call" | "clarify" | "final_answer"
    step_detail: Dict[str, Any]
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
