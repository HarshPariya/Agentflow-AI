"""
Core Unit and Integration Test Suite
Implements Section 14 of Capstone Technical Documentation.
Tests individual nodes in isolation, plus full multi-step chained query
asserting both retrieval and tool-call steps appear in the MongoDB audit log.
"""
import asyncio
import pytest
import sys
from pathlib import Path

# Add apps/api to Python path
API_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(API_DIR))

from agent.nodes.planner import planner_node
from agent.nodes.retriever import retriever_node
from agent.nodes.tool_executor import tool_executor_node
from agent.nodes.responder import responder_node
from agent.nodes.clarify import clarify_node
from db.audit_logger import get_audit_trail
from routes.chat import chat_endpoint
from agent_types.api import ChatRequest


def test_planner_node_isolation():
    """Unit test for planner node in isolation."""
    state = {
        "user_query": "What's our refund policy, and is order 4521 eligible?",
        "chat_history": []
    }
    res = planner_node(state)
    assert "plan" in res
    assert res["plan"]["decision"] == "retrieve_and_tool"
    assert len(res["plan"]["reasoning"]) > 0


@pytest.mark.asyncio
async def test_retriever_node_isolation():
    """Unit test for retriever node in isolation."""
    state = {
        "user_query": "refund policy eligibility 30 days",
        "plan": {"decision": "retrieve_only"}
    }
    res = await retriever_node(state)
    assert "retrieved_chunks" in res
    chunks = res["retrieved_chunks"]
    assert len(chunks) > 0
    assert any("policy-042" in c.get("docId", "") for c in chunks)
    assert res["relevance_threshold_cleared"] is True


@pytest.mark.asyncio
async def test_tool_executor_isolation():
    """Unit test for tool executor node in isolation."""
    state = {
        "user_query": "Please check status for order 4521",
        "plan": {"decision": "tool_only"}
    }
    res = await tool_executor_node(state)
    assert "tool_results" in res
    assert len(res["tool_results"]) > 0
    tool_out = res["tool_results"][0]
    assert tool_out["tool"] == "order_lookup"
    assert tool_out["output"]["eligible"] is True
    assert tool_out["output"]["days_since_purchase"] == 12


def test_responder_node_isolation():
    """Unit test for responder node synthesis and citation extraction."""
    state = {
        "user_query": "Is order 4521 eligible for refund?",
        "retrieved_chunks": [
            {"docId": "policy-042", "title": "Refund Policy", "text": "Refunds allowed within 30 days.", "score": 0.88}
        ],
        "tool_results": [
            {"tool": "order_lookup", "input": {"order_id": "4521"}, "output": {"status": "eligible", "days_since_purchase": 12}}
        ]
    }
    res = responder_node(state)
    assert "final_answer" in res
    assert "policy-042" in res.get("sources_used", [])
    assert "order_lookup" in res.get("tools_used", [])


def test_clarify_node_isolation():
    """Unit test for clarify node generating specific questions."""
    state = {
        "user_query": "I want something done with my stuff"
    }
    res = clarify_node(state)
    assert res["needs_clarification"] is True
    assert "can you rephrase?" not in res["clarification_question"].lower()


@pytest.mark.asyncio
async def test_chained_retrieval_and_tool_integration():
    """
    Required Integration Test (Section 14):
    Full multi-step query 'What's our refund policy, and is order 4521 eligible?'
    run end-to-end, asserting both a retrieval step and a tool-call step appear in the audit log.
    """
    conv_id = f"test-chained-{asyncio.get_event_loop().time()}"
    req = ChatRequest(
        conversation_id=conv_id,
        message="What's our refund policy, and is order 4521 eligible?"
    )

    # Call streaming chat endpoint and consume stream
    stream_response = await chat_endpoint(req)
    events = []
    async for chunk in stream_response.body_iterator:
        if isinstance(chunk, bytes):
            chunk = chunk.decode("utf-8")
        events.append(chunk)

    full_output = "".join(events)

    # Verify stream yielded intermediate step events
    assert "step" in full_output
    assert "retrieval" in full_output
    assert "order_lookup" in full_output
    assert "final" in full_output

    # Query MongoDB Atlas audit trail
    audit_trail = await get_audit_trail(conv_id)
    step_types = [entry.get("step_type") for entry in audit_trail]

    # Assert both a retrieval step and a tool-call step appear in the audit log
    assert "plan" in step_types, f"Expected 'plan' in audit steps, got {step_types}"
    assert "retrieval" in step_types, f"Expected 'retrieval' in audit steps, got {step_types}"
    assert "tool_call" in step_types, f"Expected 'tool_call' in audit steps, got {step_types}"
    assert "final_answer" in step_types, f"Expected 'final_answer' in audit steps, got {step_types}"

    # Verify audit payload shapes match Section 6 specifications
    plan_entry = next(e for e in audit_trail if e["step_type"] == "plan")
    assert "decision" in plan_entry["step_detail"]
    assert "reasoning" in plan_entry["step_detail"]

    retrieval_entry = next(e for e in audit_trail if e["step_type"] == "retrieval")
    assert "query" in retrieval_entry["step_detail"]
    assert "chunks" in retrieval_entry["step_detail"]

    tool_entry = next(e for e in audit_trail if e["step_type"] == "tool_call")
    assert tool_entry["step_detail"]["tool"] == "order_lookup"
    assert "input" in tool_entry["step_detail"]
    assert "output" in tool_entry["step_detail"]


@pytest.mark.asyncio
async def test_attached_doc_summary_flow():
    """Verify that an attached PDF summary request routes to retrieve_only and clears threshold."""
    state = {
        "user_query": "what is this pdf aboute tell me in short",
        "attached_doc": "capstone-technical-documentation.pdf",
        "chat_history": []
    }
    # 1. Planner routing
    plan_res = planner_node(state)
    assert plan_res["plan"]["decision"] == "retrieve_only"

    # 2. Retriever ranking
    state.update(plan_res)
    ret_res = await retriever_node(state)
    assert ret_res["relevance_threshold_cleared"] is True
    chunks = ret_res["retrieved_chunks"]
    assert len(chunks) > 0
    assert chunks[0]["docId"] == "capstone-technical-documentation"
    assert "Part 1" in chunks[0]["section"]
    assert chunks[0]["score"] >= 0.85
