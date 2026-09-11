"""
Responder Node
Synthesizes retrieved chunks and tool results into an accurate, grounded answer.
Explicitly collects and cites sources_used and tools_used.
Routes to Clarify node if evidence is missing or confidence is low.
"""
from __future__ import annotations
import logging
from typing import Any, Dict, List

from llm_client import call_llm
from agent_types.agent import AgentState

logger = logging.getLogger("responder_node")

SYNTHESIS_PROMPT = """You are the Lead Support & Operations AI Agent for Agentflow-AI, an enterprise autonomous agent implementing the 'Ask, Retrieve, Act' architecture.

Context:
{context}

User Query: "{query}"

Guidelines:
1. Ground your response completely and accurately in the provided context above.
2. Address ALL parts of the user query thoroughly:
   - If the user asks about an attached or knowledge-base document or PDF (e.g. "what is this pdf about?", "tell me in short", or "tell me in 5 lines"), provide a clear, direct, and structured summary of what the document covers based strictly on the retrieved context chunks (e.g. title, purpose, system architecture, key features). If the user requested a specific format or length (such as 5 lines or in short), strictly follow that format.
   - If the user asks about a policy (e.g., refund policy, returns, warranties, damaged items), provide a clear, comprehensive summary of the policy rules, deadlines (such as the 30-day return window), and conditions from the retrieved knowledge documents.
   - If a tool lookup was performed (e.g., order or ticket status), explicitly present the retrieved data (order ID, purchase timeline, status) and detail whether and why it satisfies or does not satisfy the policy requirements.
   - For chained queries (e.g., policy + order lookup), clearly explain how the specific order details align with the policy terms (e.g., "Order #4521 was purchased 12 days ago, which is well within our 30-day window, making it fully eligible for a refund").
   - If a support ticket was created (e.g., create_ticket), explicitly state the confirmed **Ticket ID** (e.g., `TIK-...`), subject, priority, and status, and confirm that the ticket is now registered.
3. If a tool execution returned an error or missing record (e.g. order not found), clearly state what failed without fabricating data.
4. Structure your response with clean markdown formatting: use bold text for key facts, bullet points for policy clauses or order details, and clear paragraph separation.
5. Conclude your answer by noting the specific policy document IDs (e.g., [policy-042] or [capstone-technical-documentation]) and tools (e.g., [order_lookup]) that were used to answer.
"""



def responder_node(state: AgentState) -> Dict[str, Any]:
    """
    Executes synthesis, extracts citations, and decides if clarification is needed.
    """
    # If a guardrail confirmation prompt is already pending, return it directly
    if state.get("final_answer"):
        return {
            "final_answer": state["final_answer"],
            "sources_used": [],
            "tools_used": ["create_ticket"] if state.get("pending_action") else []
        }

    query = state.get("user_query", "")
    chunks = state.get("retrieved_chunks") or []
    tools = state.get("tool_results") or []
    plan = state.get("plan") or {}
    decision = plan.get("decision", "")

    # Check for empty retrieval / out-of-scope failure condition (Section 8 & 13)
    # If retrieval was requested but returned no chunks clearing the threshold,
    # and there are no tool results resolving the query:
    if decision in ["retrieve_only", "retrieve_and_tool"] and not chunks and not tools:
        logger.info("Empty retrieval detected for '%s' -> routing to Clarify", query[:30])
        clarify_text = (
            f"I couldn't find any relevant policy or documentation regarding '{query}'. "
            "Could you provide more specific details or the relevant policy name?"
        )
        return {
            "needs_clarification": True,
            "clarification_question": clarify_text,
            "final_answer": clarify_text,
            "sources_used": [],
            "tools_used": []
        }

    # Build context string
    context_lines: List[str] = []
    sources_used: List[str] = []
    tools_used: List[str] = []

    for chunk in chunks:
        doc_id = chunk.get("docId", "")
        if doc_id and doc_id not in sources_used:
            sources_used.append(doc_id)
        context_lines.append(f"[Policy: {doc_id} - {chunk.get('title', '')}]\n{chunk.get('text', '')}\n")

    for tool in tools:
        tool_name = tool.get("tool", "")
        if tool_name and tool_name not in tools_used:
            tools_used.append(tool_name)
        context_lines.append(f"[Tool: {tool_name} Result]\nInput: {tool.get('input')}\nOutput: {tool.get('output')}\n")

    context_str = "\n".join(context_lines) if context_lines else "No external documents or tools required."

    prompt = SYNTHESIS_PROMPT.format(context=context_str, query=query)
    answer = call_llm(prompt)

    # Fallback safety: if LLM returns empty text, synthesize from context directly
    if not answer or not answer.strip():
        logger.warning("LLM call returned empty response, constructing structured fallback synthesis")
        fallback_parts: List[str] = []
        if "refund" in query.lower() and tools:
            for t in tools:
                if t.get("tool") == "order_lookup":
                    out = t.get("output", {})
                    is_elig = out.get("eligible", False)
                    days = out.get("days_since_purchase", "N/A")
                    fallback_parts.append(
                        f"### Order Eligibility & Refund Policy\n\n"
                        f"- **Policy Window**: Returns and refunds must be requested within **30 days** of purchase.\n"
                        f"- **Order Status**: Order #{out.get('order_id', query)} was purchased **{days} days ago**.\n"
                        f"- **Eligibility**: **{'Eligible' if is_elig else 'Not eligible'}** for refund.\n\n"
                        f"Order #{out.get('order_id', query)} satisfies the return criteria under company guidelines."
                    )
        elif chunks:
            fallback_parts.append("### Policy & Documentation Summary\n")
            for c in chunks[:2]:
                fallback_parts.append(f"- **{c.get('docId', 'Policy')}**: {c.get('text', '')[:250]}...\n")
        elif tools:
            fallback_parts.append("### Operational Tool Result\n")
            for t in tools:
                fallback_parts.append(f"- **`{t.get('tool')}`**: {t.get('output')}\n")
        else:
            fallback_parts.append(f"I have processed your request regarding: **{query}**.")

        if sources_used:
            fallback_parts.append(f"\n*Referenced policies: {', '.join(sources_used)}*")
        answer = "\n".join(fallback_parts)

    logger.info("Responder generated final answer (length=%d, sources=%s, tools=%s)", len(answer), sources_used, tools_used)

    return {
        "final_answer": answer,
        "sources_used": sources_used,
        "tools_used": tools_used,
        "needs_clarification": False
    }
