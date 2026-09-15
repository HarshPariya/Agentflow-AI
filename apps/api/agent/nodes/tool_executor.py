"""
Tool Executor Node
Extracts structured arguments from query via LLM reasoning.
Enforces the mandatory confirmation guardrail for destructive actions (create_ticket).
Dispatches calls to the MCP client.
"""
from __future__ import annotations
import json
import logging
import re
from typing import Any, Dict, List

from llm_client import call_llm
from mcp_client.client import call_mcp_tool
from agent_types.agent import AgentState

logger = logging.getLogger("tool_executor_node")

ARG_EXTRACTION_PROMPT = """You are the Tool Parameter Extractor for Agentflow-AI.
Extract tool calls and arguments for this query: "{query}"

Available tools:
1. 'order_lookup': Requires 'order_id' (string, e.g. "4521")
2. 'ticket_lookup': Requires 'ticket_id' (string, e.g. "TIK-102")
3. 'create_ticket': Requires 'subject' (string), 'description' (string), 'priority' (one of: low, normal, high, urgent)

Return ONLY a JSON list of objects:
[
  {{"tool": "order_lookup", "arguments": {{"order_id": "4521"}}}}
]
"""


def extract_tool_calls(query: str) -> List[Dict[str, Any]]:
    """Extracts structured tool calls using regex fast-paths and LLM reasoning."""
    # 1. Order ID pattern:
    order_match = re.search(r"\border(?:\s*(?:id|#|number|status)?\s*[:=]?\s*)?(\d{4,10})\b", query, re.IGNORECASE)
    if not order_match and "order" in query.lower():
        order_match = re.search(r"\b(\d{4,10})\b", query)

    if order_match and not ("ticket" in query.lower() and "tik" in query.lower()):
        return [{"tool": "order_lookup", "arguments": {"order_id": order_match.group(1)}}]

    # 2. Ticket ID lookup pattern:
    ticket_match = re.search(r"\b(TIK-[A-Za-z0-9]+)\b", query, re.IGNORECASE)
    if "ticket" in query.lower() and ticket_match and "create" not in query.lower():
        return [{"tool": "ticket_lookup", "arguments": {"ticket_id": ticket_match.group(1).upper()}}]

    # 3. Create ticket pattern:
    if "create" in query.lower() and "ticket" in query.lower():
        priority = "urgent" if "urgent" in query.lower() else "normal"
        clean_subj = re.sub(r"\b(create|an?|urgent|ticket|for|a|please)\b", "", query, flags=re.IGNORECASE).strip(" :-,")
        subject = clean_subj.capitalize() if clean_subj else "Production Support Ticket"
        return [{
            "tool": "create_ticket",
            "arguments": {
                "subject": subject,
                "description": query.strip(),
                "priority": priority
            }
        }]

    # 4. LLM reasoning fallback
    llm_out = call_llm(ARG_EXTRACTION_PROMPT.format(query=query))
    match = re.search(r"\[.*\]", llm_out, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass
    return []


async def tool_executor_node(state: AgentState) -> Dict[str, Any]:
    """
    Executes tool extraction, guardrail verification, and MCP execution.
    """
    query = state.get("user_query", "")
    pending = state.get("pending_action")
    tool_results: List[Dict[str, Any]] = []

    # Strategy Pattern for Guardrail Confirmation Checkpoint:
    # If the user is responding affirmatively to a previous pending action:
    affirmative_tokens = {"yes", "confirm", "proceed", "sure", "yep", "do it", "approved", "ok", "create"}
    query_lower = query.strip().lower()
    is_affirmative = (
        any(token in query_lower for token in ["yes", "confirm", "proceed", "approved", "sure", "do it", "go ahead"])
    )

    if pending and pending.get("tool") == "create_ticket" and is_affirmative:
        logger.info("Guardrail confirmation APPROVED for pending create_ticket")
        res = await call_mcp_tool("create_ticket", pending.get("arguments", {}))
        tool_results.append({
            "tool": "create_ticket",
            "input": pending.get("arguments", {}),
            "output": res
        })
        return {
            "tool_results": tool_results,
            "pending_action": None
        }

    # Extract new tool calls from query
    tool_calls = extract_tool_calls(query)


    for call in tool_calls:
        tool_name = call.get("tool", "")
        args = call.get("arguments", {})

        # GUARDRAIL: create_ticket MUST NOT fire on first pass (Section 10 & 13)
        if tool_name == "create_ticket":
            subject = args.get("subject", "Customer Support Issue")
            priority = args.get("priority", "normal")
            confirmation_prompt = (
                f"I'll create a ticket titled '{subject}' with priority '{priority}' — confirm?"
            )
            logger.info("Guardrail intercepted create_ticket: prompting confirmation")
            return {
                "tool_results": [],
                "pending_action": {
                    "tool": "create_ticket",
                    "arguments": args,
                    "confirmed": False
                },
                "final_answer": confirmation_prompt
            }

        # Standard non-destructive tool execution
        logger.info("Calling MCP tool: %s with args: %s", tool_name, args)
        res = await call_mcp_tool(tool_name, args)
        tool_results.append({
            "tool": tool_name,
            "input": args,
            "output": res
        })

    return {"tool_results": tool_results}
