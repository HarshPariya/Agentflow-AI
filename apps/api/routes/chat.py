"""
Streaming Chat Route with SSE Events and MongoDB Audit Logging
Implements Section 8, 9, and 12 of Capstone Technical Documentation.
"""
from __future__ import annotations
import asyncio
from datetime import datetime, timezone
import json
import logging
import uuid
from typing import AsyncGenerator
from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from agent.graph import create_graph
from agent.nodes.planner import planner_node
from agent.nodes.retriever import retriever_node
from agent.nodes.tool_executor import tool_executor_node
from agent.nodes.responder import responder_node
from agent.nodes.clarify import clarify_node
from db.audit_logger import record_audit_step
from db.mongo import get_db
from agent_types.api import ChatRequest

logger = logging.getLogger("chat_route")
router = APIRouter(tags=["Chat"])

# Initialize compiled graph
graph = create_graph()


@router.post("/chat")
async def chat_endpoint(req: ChatRequest):
    """
    Handles streaming chat requests.
    Streams intermediate step events (plan, retrieval, tool_call) and final answer.
    Persists complete audit trail in MongoDB Atlas.
    """
    conversation_id = req.conversation_id or str(uuid.uuid4())
    user_message_id = str(uuid.uuid4())
    assistant_message_id = str(uuid.uuid4())
    user_id = req.user_id or "user-default"
    user_name = req.user_name or "Guest User"
    now_iso = datetime.now(timezone.utc).isoformat()

    db = await get_db()

    # 1. Record incoming user message in MongoDB and update conversation
    try:
        await db.messages.insert_one({
            "id": user_message_id,
            "conversation_id": conversation_id,
            "user_id": user_id,
            "role": "user",
            "content": req.message,
            "created_at": now_iso
        })

        # Generate concise conversation title if not yet existing
        title = req.message.strip()[:40]
        if len(req.message.strip()) > 40:
            title += "..."

        await db.conversations.update_one(
            {"id": conversation_id},
            {
                "$setOnInsert": {
                    "id": conversation_id,
                    "user_id": user_id,
                    "user_name": user_name,
                    "title": title,
                    "created_at": now_iso
                },
                "$set": {
                    "updated_at": now_iso,
                    "last_message": req.message
                },
                "$inc": {"message_count": 1}
            },
            upsert=True
        )
    except Exception as exc:
        logger.warning("MongoDB message/conversation insert notice: %s", exc)

    # 2. Fetch recent conversation history from MongoDB
    history = []
    try:
        cursor = db.messages.find(
            {"conversation_id": conversation_id},
            {"_id": 0}
        ).sort("created_at", 1).limit(10)
        history = await cursor.to_list(length=10)
    except Exception as exc:
        logger.debug("History query notice: %s", exc)

    # 3. Check for any pending action from previous turn (for Guardrail confirmation)
    pending_action = None
    try:
        last_guardrail_log = await db.audit_logs.find_one(
            {"conversation_id": conversation_id, "step_type": "guardrail_pending"},
            sort=[("created_at", -1)]
        )
        if last_guardrail_log:
            pending_action = last_guardrail_log.get("step_detail")
    except Exception:
        pass

    async def event_stream() -> AsyncGenerator[str, None]:
        state = {
            "conversation_id": conversation_id,
            "user_query": req.message,
            "chat_history": history,
            "plan": None,
            "retrieved_chunks": None,
            "tool_results": None,
            "final_answer": None,
            "sources_used": [],
            "tools_used": [],
            "needs_clarification": False,
            "clarification_question": None,
            "pending_action": pending_action,
            "relevance_threshold_cleared": True,
            "attached_doc": req.attached_doc
        }

        # Step 1: Planner Node
        plan_output = planner_node(state)
        state.update(plan_output)
        plan_detail = state["plan"]

        # Persist Plan audit step (Section 6 format)
        await record_audit_step(
            conversation_id=conversation_id,
            message_id=assistant_message_id,
            step_type="plan",
            step_detail={
                "decision": plan_detail.get("decision"),
                "reasoning": plan_detail.get("reasoning")
            }
        )

        yield f"data: {json.dumps({'type': 'step', 'step': 'plan', 'detail': plan_detail})}\n\n"
        await asyncio.sleep(0.05)

        decision = plan_detail.get("decision", "")

        # Step 2: Retriever Node (if plan includes retrieval)
        if decision in ["retrieve_only", "retrieve_and_tool"]:
            retriever_output = await retriever_node(state)
            state.update(retriever_output)

            retrieval_chunks = state.get("retrieved_chunks") or []
            retrieval_audit = {
                "query": req.message,
                "chunks": [
                    {"docId": c.get("docId"), "text": c.get("text", "")[:120] + "...", "score": c.get("score")}
                    for c in retrieval_chunks
                ]
            }

            await record_audit_step(
                conversation_id=conversation_id,
                message_id=assistant_message_id,
                step_type="retrieval",
                step_detail=retrieval_audit
            )

            yield f"data: {json.dumps({'type': 'step', 'step': 'retrieval', 'detail': retrieval_audit})}\n\n"
            await asyncio.sleep(0.05)

        # Step 3: Tool-Executor Node (if plan includes tools or affirmative reply)
        if decision in ["tool_only", "retrieve_and_tool"] or state.get("pending_action"):
            tool_output = await tool_executor_node(state)
            state.update(tool_output)

            # If guardrail paused execution to prompt confirmation:
            if state.get("pending_action"):
                await record_audit_step(
                    conversation_id=conversation_id,
                    message_id=assistant_message_id,
                    step_type="guardrail_pending",
                    step_detail=state["pending_action"]
                )
            elif pending_action and state.get("pending_action") is None:
                try:
                    await db.audit_logs.delete_many({
                        "conversation_id": conversation_id,
                        "step_type": "guardrail_pending"
                    })
                except Exception:
                    pass

            tool_results = state.get("tool_results") or []
            for tr in tool_results:
                tool_audit = {
                    "tool": tr.get("tool"),
                    "input": tr.get("input", {}),
                    "output": tr.get("output", {})
                }
                await record_audit_step(
                    conversation_id=conversation_id,
                    message_id=assistant_message_id,
                    step_type="tool_call",
                    step_detail=tool_audit
                )
                yield f"data: {json.dumps({'type': 'step', 'step': 'tool_call', 'detail': tool_audit})}\n\n"
                await asyncio.sleep(0.05)

        # Step 4: Responder / Clarify Node
        if state.get("needs_clarification"):
            clarify_output = clarify_node(state)
            state.update(clarify_output)

            clarify_audit = {
                "reason": "Missing parameters, ambiguous request, or low relevance retrieval",
                "question_asked": state.get("clarification_question", "")
            }
            await record_audit_step(
                conversation_id=conversation_id,
                message_id=assistant_message_id,
                step_type="clarify",
                step_detail=clarify_audit
            )

            yield f"data: {json.dumps({'type': 'step', 'step': 'clarify', 'detail': clarify_audit})}\n\n"
            await asyncio.sleep(0.05)

        responder_output = responder_node(state)
        state.update(responder_output)

        # Check if clarification was initiated by responder
        if state.get("needs_clarification") and not state.get("clarification_question"):
            clarify_output = clarify_node(state)
            state.update(clarify_output)

        final_content = state.get("final_answer") or state.get("clarification_question") or ""
        if not final_content.strip():
            final_content = "I have processed your request in accordance with our operations guidelines and policy database."

        sources_used = state.get("sources_used", [])
        tools_used = state.get("tools_used", [])

        # Persist Final Answer audit record (Section 6 format)
        await record_audit_step(
            conversation_id=conversation_id,
            message_id=assistant_message_id,
            step_type="final_answer",
            step_detail={
                "sources_used": sources_used,
                "tools_used": tools_used
            }
        )

        # Record assistant reply message in MongoDB
        try:
            reply_now = datetime.now(timezone.utc).isoformat()
            await db.messages.insert_one({
                "id": assistant_message_id,
                "conversation_id": conversation_id,
                "user_id": user_id,
                "role": "assistant",
                "content": final_content,
                "sources_used": sources_used,
                "tools_used": tools_used,
                "created_at": reply_now
            })
            await db.conversations.update_one(
                {"id": conversation_id},
                {
                    "$set": {
                        "updated_at": reply_now,
                        "last_message": final_content[:80] + "..." if len(final_content) > 80 else final_content
                    },
                    "$inc": {"message_count": 1}
                }
            )
        except Exception as exc:
            logger.warning("MongoDB message insert notice: %s", exc)

        # Stream final event to frontend
        yield f"data: {json.dumps({'type': 'final', 'conversation_id': conversation_id, 'content': final_content, 'sources_used': sources_used, 'tools_used': tools_used})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
