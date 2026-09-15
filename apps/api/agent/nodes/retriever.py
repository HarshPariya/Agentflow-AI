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

    # Fallback safety: If document is attached but raw query missed, pull the attached document's chunks directly
    if not chunks and attached_doc:
        from rag.embed import store
        clean_name = attached_doc.rsplit(".", 1)[0].lower()
        doc_chunks = [
            c for c in store.chunks
            if clean_name in c.get("docId", "").lower()
            or clean_name in c.get("title", "").lower()
            or attached_doc.lower() in c.get("filename", "").lower()
        ]
        if doc_chunks:
            chunks = [{
                "docId": c.get("docId", attached_doc),
                "text": c.get("text", ""),
                "score": 0.95,
                "title": c.get("title", attached_doc),
                "filename": c.get("filename", attached_doc),
                "section": c.get("section", "Document Overview")
            } for c in doc_chunks[:4]]
            cleared = True
            logger.info("Retriever recovered %d chunks directly for attached document %s", len(chunks), attached_doc)

    if attached_doc and chunks:
        cleared = True

    logger.info("Retriever found %d chunks (threshold cleared: %s)", len(chunks), cleared)

    return {
        "retrieved_chunks": chunks,
        "relevance_threshold_cleared": cleared,
        "needs_clarification": not cleared and not state.get("tool_results")
    }
