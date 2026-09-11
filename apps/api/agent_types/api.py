"""
API Request and Response Models
"""
from __future__ import annotations
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    conversation_id: Optional[str] = Field(default=None, description="UUID of existing conversation or null for new")
    message: str = Field(..., min_length=1, description="User message text")
    attached_doc: Optional[str] = Field(default=None, description="Filename or identifier of attached document")
    user_id: Optional[str] = Field(default="user-default", description="ID of logged in user")
    user_name: Optional[str] = Field(default="Guest User", description="Display name of logged in user")


class UserProfile(BaseModel):
    user_id: str
    name: str
    email: str
    role: str = "Enterprise User"
    avatar: Optional[str] = None


class ConversationSummary(BaseModel):
    id: str
    user_id: str
    title: str
    last_message: Optional[str] = None
    message_count: int = 0
    created_at: str
    updated_at: str


class HealthResponse(BaseModel):
    status: str
    db: str
    redis: str
    vector_store: str


class AdminReindexResponse(BaseModel):
    status: str
    message: str
    documents_indexed: int
