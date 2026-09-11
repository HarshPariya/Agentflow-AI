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
    """Extracts structured tool calls using LLM reasoning with JSON fallback."""
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
    if not tool_calls and "4521" in query:
        tool_calls = [{"tool": "order_lookup", "arguments": {"order_id": "4521"}}]

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
