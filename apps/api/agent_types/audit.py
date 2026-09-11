"""
Audit Log Schemas for Agentflow-AI
Strictly matches Section 6 of Capstone Technical Documentation.
"""
from __future__ import annotations
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class PlanAuditDetail(BaseModel):
    decision: str
    reasoning: str


class RetrievalChunkDetail(BaseModel):
    docId: str
    text: str
    score: float


class RetrievalAuditDetail(BaseModel):
    query: str
    chunks: List[RetrievalChunkDetail]


class ToolCallAuditDetail(BaseModel):
    tool: str
    input: Dict[str, Any]
    output: Dict[str, Any]


class ClarifyAuditDetail(BaseModel):
    reason: str
    question_asked: str


class FinalAnswerAuditDetail(BaseModel):
    sources_used: List[str] = Field(default_factory=list)
    tools_used: List[str] = Field(default_factory=list)


class AuditLogEntry(BaseModel):
    id: Optional[str] = None
    conversation_id: str
    message_id: Optional[str] = None
    step_type: str
    step_detail: Dict[str, Any]
    created_at: datetime
