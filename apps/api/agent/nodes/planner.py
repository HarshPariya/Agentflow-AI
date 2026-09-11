"""
Planner Node
Reasoning LLM call to classify query into:
- retrieve_only
- tool_only
- retrieve_and_tool (chained)
- answer_directly
- insufficient_info
"""
from __future__ import annotations
import json
import logging
import re
from typing import Any, Dict

from llm_client import call_llm
from agent_types.agent import AgentState, PlanDecision

logger = logging.getLogger("planner_node")

PLANNER_PROMPT = """You are the Lead Planning Agent for Agentflow-AI.
Your job is to analyze the user query and choose the optimal execution strategy.

Active Attached Document: {attached_doc}

Available execution decisions:
1. 'retrieve_and_tool': User inquiry requires BOTH consulting policy/knowledge base AND interacting with a tool (e.g. asking about refund rules while providing an order ID to check eligibility).
2. 'retrieve_only': Query asks about policies, rules, FAQs, procedures, documentation, or asks to explain, summarize, or query an attached document or PDF (e.g. "what is this pdf about?", "summarize this document in 5 lines", "tell me in short about the attached file").
3. 'tool_only': Query only asks to look up an order/ticket status, or create a ticket.
4. 'answer_directly': Friendly greetings, introductions, or basic conversational queries.
5. 'insufficient_info': Query is completely vague, incoherent, or missing essential context to act. Note: If an attached document is present or the user asks about the document/PDF, do NOT choose 'insufficient_info'; choose 'retrieve_only'.

Return ONLY a valid JSON object in this exact format:
{
  "decision": "<one of: retrieve_and_tool, retrieve_only, tool_only, answer_directly, insufficient_info>",
  "reasoning": "<concise explanation of why this path was chosen>"
}

User Query: "{query}"
"""


def extract_json_plan(raw_text: str) -> Dict[str, str]:
    """Parses JSON response using regex extraction without fragile string splitting."""
    match = re.search(r"\{.*\}", raw_text, re.DOTALL)
    if match:
        try:
            parsed = json.loads(match.group(0))
            # Validate decision key against enum values
            valid_decisions = {d.value: d.value for d in PlanDecision}
            decision = valid_decisions.get(parsed.get("decision", ""), PlanDecision.ANSWER_DIRECTLY.value)
            return {
                "decision": decision,
                "reasoning": parsed.get("reasoning", "Parsed from LLM plan.")
            }
        except json.JSONDecodeError:
            pass

    return {
        "decision": PlanDecision.ANSWER_DIRECTLY.value,
        "reasoning": "Standard direct response path."
    }


def planner_node(state: AgentState) -> Dict[str, Any]:
    """
    Executes Planner node. Writes plan into state.
    """
    query = state.get("user_query", "")
    attached_doc = state.get("attached_doc")
    logger.info("Planner classifying query: '%s' (attached_doc: %s)", query[:40], attached_doc)

    # Check if there is an active pending action awaiting confirmation (Guardrail flow)
    pending = state.get("pending_action")
    affirmative = {"yes", "confirm", "proceed", "sure", "yep", "do it", "approved", "ok"}
    is_affirmative = any(word in query.lower().split() for word in affirmative)
    if pending and is_affirmative:
        logger.info("Planner recognized confirmation for pending action: %s", pending.get("tool"))
        return {
            "plan": {
                "decision": PlanDecision.TOOL_ONLY.value,
                "reasoning": f"User explicitly confirmed pending action: {pending.get('tool')}."
            }
        }

    # Fast-path for attached document or explicit PDF/document summary/overview inquiry
    query_lower = query.lower()
    doc_keywords = ["pdf", "document", "doc", "file", "attachment", "attached", "paper"]
    has_doc_reference = any(k in query_lower for k in doc_keywords) or bool(attached_doc)
    summary_indicators = ["what is", "about", "aboute", "tell me", "summarize", "summary", "explain", "short", "lines", "overview", "review"]
    is_summary_request = any(k in query_lower for k in summary_indicators)

    # Ensure we don't treat order/ticket lookups as doc summaries
    tool_keywords = ["order", "ticket", "create", "status", "lookup", "check"]
    is_pure_tool = any(k in query_lower for k in tool_keywords) and not ("policy" in query_lower or "refund" in query_lower)

    if has_doc_reference and is_summary_request and not is_pure_tool:
        doc_label = attached_doc or "the referenced PDF / knowledge document"
        logger.info("Planner recognized document summary request for: %s", doc_label)
        return {
            "plan": {
                "decision": PlanDecision.RETRIEVE_ONLY.value,
                "reasoning": f"User requested an overview or summary of {doc_label}."
            }
        }

    prompt = (
        PLANNER_PROMPT
        .replace("{attached_doc}", attached_doc or "None (standard knowledge base)")
        .replace("{query}", query)
    )
    llm_output = call_llm(prompt)
    plan = extract_json_plan(llm_output)

    logger.info("Planner decision: %s | reasoning: %s", plan["decision"], plan["reasoning"])
    return {"plan": plan}
