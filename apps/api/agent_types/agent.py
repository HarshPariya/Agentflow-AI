"""
Agent Types & Enums for Agentflow-AI
Defines strongly typed contracts for graph state, planner decisions, and execution steps.
"""
from __future__ import annotations
from enum import Enum
from typing import Any, Dict, List, Optional, TypedDict


class PlanDecision(str, Enum):
    RETRIEVE_ONLY = "retrieve_only"
    TOOL_ONLY = "tool_only"
    RETRIEVE_AND_TOOL = "retrieve_and_tool"
    ANSWER_DIRECTLY = "answer_directly"
    INSUFFICIENT_INFO = "insufficient_info"


class StepType(str, Enum):
    PLAN = "plan"
    RETRIEVAL = "retrieval"
    TOOL_CALL = "tool_call"
    CLARIFY = "clarify"
    FINAL_ANSWER = "final_answer"


class PlanDetail(TypedDict):
    decision: str
    reasoning: str


class RetrievedChunk(TypedDict):
    docId: str
    text: str
    score: float
    title: Optional[str]
    section: Optional[str]


class ToolCallDetail(TypedDict):
    tool: str
    input: Dict[str, Any]
    output: Dict[str, Any]


class PendingAction(TypedDict):
    tool: str
    arguments: Dict[str, Any]
    confirmed: bool


class AgentState(TypedDict):
    conversation_id: str
    user_query: str
    chat_history: Optional[List[Dict[str, str]]]
    plan: Optional[PlanDetail]
    retrieved_chunks: Optional[List[RetrievedChunk]]
    tool_results: Optional[List[ToolCallDetail]]
    final_answer: Optional[str]
    sources_used: Optional[List[str]]
    tools_used: Optional[List[str]]
    needs_clarification: bool
    clarification_question: Optional[str]
    pending_action: Optional[PendingAction]
    relevance_threshold_cleared: bool
    attached_doc: Optional[str]
