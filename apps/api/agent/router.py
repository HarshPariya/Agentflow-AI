"""
Declarative Routing and Strategy Dispatch Layer
Replaces nested if-else ladders with declarative lookup tables and strategy handlers.
Implements the Conditional Edges defined in Section 8 of Capstone Technical Documentation:
Planner -> (Retriever and/or Tool-Executor) -> Responder -> (END or Clarify -> END)
"""
from __future__ import annotations
from typing import Literal
from langgraph.graph import END

from agent_types.agent import AgentState, PlanDecision

# Primary routing map from Planner decision to downstream execution node
PLAN_ROUTE_MAP: dict[str, str] = {
    PlanDecision.RETRIEVE_ONLY.value: "retriever",
    PlanDecision.TOOL_ONLY.value: "tool_executor",
    PlanDecision.RETRIEVE_AND_TOOL.value: "retriever",  # Chained flow: retriever -> tool_executor
    PlanDecision.ANSWER_DIRECTLY.value: "responder",
    PlanDecision.INSUFFICIENT_INFO.value: "clarify",
}


def route_from_planner(state: AgentState) -> str:
    """Routes execution from Planner using declarative dictionary lookup."""
    plan = state.get("plan") or {}
    decision = plan.get("decision", PlanDecision.ANSWER_DIRECTLY.value)
    # Default to clarify on unmapped or ambiguous classification
    return PLAN_ROUTE_MAP.get(decision, "clarify")


def route_from_retriever(state: AgentState) -> str:
    """
    Decides whether to route to Tool-Executor (for chained queries)
    or proceed directly to Responder.
    """
    plan = state.get("plan") or {}
    decision = plan.get("decision", "")

    # If the plan requires both retrieval and tool execution, proceed to tool_executor
    chained_route_map: dict[str, str] = {
        PlanDecision.RETRIEVE_AND_TOOL.value: "tool_executor",
    }
    return chained_route_map.get(decision, "responder")


def route_from_responder(state: AgentState) -> str:
    """
    Checks if low confidence or missing data requires clarification.
    """
    needs_clarification = state.get("needs_clarification", False)
    clarify_map: dict[bool, str] = {
        True: "clarify",
        False: END,
    }
    return clarify_map.get(needs_clarification, END)
