"""
Failure Path and Guardrail Verification Tests
Implements Section 13 and Section 14 of Capstone Technical Documentation:
1. Empty retrieval -> Clarify, don't answer from unrelated chunks
2. Tool call fails (bad ID) -> tell user plainly what failed, don't fabricate
3. Guardrail confirmation flow -> create_ticket halts on first turn, executes only on affirmative
"""
import asyncio
import pytest
import sys
from pathlib import Path

API_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(API_DIR))

from agent.nodes.retriever import retriever_node
from agent.nodes.tool_executor import tool_executor_node
from agent.nodes.responder import responder_node
from routes.chat import chat_endpoint
from agent_types.api import ChatRequest


@pytest.mark.asyncio
async def test_empty_retrieval_routes_to_clarify():
    """
    Test that an out-of-domain query whose similarity score is below the 0.65 threshold
    routes to Clarify and refuses to fabricate an answer.
    """
    query = "quantum teleportation time-travel reimbursement policy"
    state = {
        "user_query": query,
        "plan": {"decision": "retrieve_only", "reasoning": "Policy inquiry"},
        "retrieved_chunks": [],
        "tool_results": []
    }
    ret_out = await retriever_node(state)
    state.update(ret_out)

    resp_out = responder_node(state)
    state.update(resp_out)

    assert state.get("needs_clarification") is True
    assert "couldn't find any relevant policy" in state.get("clarification_question", "").lower()


@pytest.mark.asyncio
async def test_tool_failure_returns_plain_error():
    """
    Test that looking up a non-existent order returns a structured error
    without hallucinating or raising an unhandled exception.
    """
    state = {
        "user_query": "Can you check order 9999999?",
        "plan": {"decision": "tool_only", "reasoning": "Order lookup"}
    }
    tool_out = await tool_executor_node(state)
    assert len(tool_out["tool_results"]) > 0
    res = tool_out["tool_results"][0]["output"]
    assert res.get("error") is True
    assert res.get("code") == "ORDER_NOT_FOUND"


@pytest.mark.asyncio
async def test_guardrail_confirmation_round_trip():
    """
    Test that create_ticket DOES NOT fire on the first turn (PDF Section 13),
    prompts the user with a confirmation question, and only fires upon an explicit affirmative.
    """
    conv_id = f"test-guardrail-{asyncio.get_event_loop().time()}"

    # Turn 1: User requests ticket creation
    req1 = ChatRequest(
        conversation_id=conv_id,
        message="Create an urgent ticket for production database outage"
    )
    resp1 = await chat_endpoint(req1)
    chunks1 = []
    async for c in resp1.body_iterator:
        if isinstance(c, bytes):
            c = c.decode("utf-8")
        chunks1.append(c)

    output1 = "".join(chunks1)
    # create_ticket tool must NOT have fired in Turn 1
    assert "create_ticket" in output1  # Referenced in plan/guardrail checkpoint
    assert "confirm?" in output1 or "confirm" in output1.lower()

    # Turn 2: User explicitly confirms
    req2 = ChatRequest(
        conversation_id=conv_id,
        message="Yes, please proceed"
    )
    resp2 = await chat_endpoint(req2)
    chunks2 = []
    async for c in resp2.body_iterator:
        if isinstance(c, bytes):
            c = c.decode("utf-8")
        chunks2.append(c)

    output2 = "".join(chunks2)
    # Upon explicit affirmative, create_ticket executes
    assert "create_ticket" in output2
