"""
Retriever Node
Queries vector store via RAG pipeline and marks threshold status.
"""
from __future__ import annotations
import asyncio
import logging
from typing import Any, Dict

from rag.retrieve import retrieve_chunks
from agent_types.agent import AgentState

logger = logging.getLogger("retriever_node")


async def retriever_node(state: AgentState) -> Dict[str, Any]:
    """
    Executes knowledge base retrieval for the query.
    Writes retrieved_chunks and relevance_threshold_cleared into state.
    """
    query = state.get("user_query", "")
    attached_doc = state.get("attached_doc")
    logger.info("Retriever searching knowledge base for: '%s' (attached_doc: %s)", query[:40], attached_doc)

    retrieval_res = await retrieve_chunks(query, attached_doc=attached_doc)
    chunks = retrieval_res.get("chunks", [])
    cleared = retrieval_res.get("threshold_cleared", False)

    logger.info("Retriever found %d chunks (threshold cleared: %s)", len(chunks), cleared)

    return {
        "retrieved_chunks": chunks,
        "relevance_threshold_cleared": cleared,
        "needs_clarification": not cleared and not state.get("tool_results")
    }
