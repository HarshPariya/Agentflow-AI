"""
LangGraph Workflow Assembly for Agentflow-AI
Defines and compiles the autonomous agent state graph matching Section 8 of Capstone Technical Documentation:
Conditional edges: Planner -> (Retriever and/or Tool-Executor) -> Responder -> (END or Clarify -> END)
"""
from __future__ import annotations
from langgraph.graph import StateGraph, END

from agent.nodes.planner import planner_node
from agent.nodes.retriever import retriever_node
from agent.nodes.tool_executor import tool_executor_node
from agent.nodes.responder import responder_node
from agent.nodes.clarify import clarify_node
from agent.router import route_from_planner, route_from_retriever, route_from_responder
from agent_types.agent import AgentState


def create_graph():
    """
    Assembles the agent state graph using declarative conditional dispatch edges.
    """
    workflow = StateGraph(AgentState)

    # 1. Register Nodes
    workflow.add_node("planner", planner_node)
    workflow.add_node("retriever", retriever_node)
    workflow.add_node("tool_executor", tool_executor_node)
    workflow.add_node("responder", responder_node)
    workflow.add_node("clarify", clarify_node)

    # 2. Entry Point
    workflow.set_entry_point("planner")

    # 3. Conditional Edges from Planner
    workflow.add_conditional_edges(
        "planner",
        route_from_planner,
        {
            "retriever": "retriever",
            "tool_executor": "tool_executor",
            "responder": "responder",
            "clarify": "clarify"
        }
    )

    # 4. Conditional Edges from Retriever (chained to tool_executor or directly to responder)
    workflow.add_conditional_edges(
        "retriever",
        route_from_retriever,
        {
            "tool_executor": "tool_executor",
            "responder": "responder"
        }
    )

    # 5. Tool-Executor always routes to Responder to synthesize results
    workflow.add_edge("tool_executor", "responder")

    # 6. Responder routes conditionally to END or Clarify
    workflow.add_conditional_edges(
        "responder",
        route_from_responder,
        {
            "clarify": "clarify",
            END: END
        }
    )

    # 7. Clarify node always routes to END
    workflow.add_edge("clarify", END)

    return workflow.compile()
