"""
Clarify Node
Generates specific, contextual clarifying questions.
Never returns a generic 'can you rephrase?'.
"""
from __future__ import annotations
import logging
from typing import Any, Dict

from llm_client import call_llm
from agent_types.agent import AgentState

logger = logging.getLogger("clarify_node")

CLARIFY_PROMPT = """You are the Clarification Assistant for Agentflow-AI.
The user asked a query that is ambiguous, missing key identifiers, or returned no matching records:
"{query}"

Generate ONE targeted, polite, and specific clarifying question.
Do NOT use generic phrases like 'can you rephrase?' or 'could you elaborate?'.
Instead, ask for the specific missing item (such as an order number, ticket identifier, or exact policy area).
"""


def clarify_node(state: AgentState) -> Dict[str, Any]:
    """
    Produces a targeted clarifying question based on state context.
    """
    # If a specific clarifying question was already set by responder or retriever, preserve it
    existing_question = state.get("clarification_question")
    if existing_question:
        return {
            "needs_clarification": True,
            "clarification_question": existing_question,
            "final_answer": existing_question
        }

    query = state.get("user_query", "")
    question = call_llm(CLARIFY_PROMPT.format(query=query))
    if not question or len(question.strip()) < 5:
        question = f"Could you specify the exact order ID or policy topic you would like me to check regarding '{query}'?"

    logger.info("Clarify node generated specific question: '%s'", question)

    return {
        "needs_clarification": True,
        "clarification_question": question,
        "final_answer": question
    }
