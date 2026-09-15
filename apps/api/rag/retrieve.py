"""
RAG Knowledge Base Retrieval
Queries vector store with Redis caching and relevance threshold verification.
"""
from __future__ import annotations
import logging
from typing import Any, Dict, List, Optional

from cache.redis_client import get_cached_retrieval, set_cached_retrieval
from config import settings
from rag.embed import store
from rag.ingest import ingest_documents

logger = logging.getLogger("rag_retrieve")


async def retrieve_chunks(query: str, top_k: int = 4, attached_doc: Optional[str] = None) -> Dict[str, Any]:
    """
    Retrieves top-k relevant knowledge chunks.
    1. Check Redis cache first
    2. Query vector store
    3. Evaluate relevance against threshold (0.65)
    4. Cache result with TTL
    """
    # 1. Check Redis Cache
    cache_key = f"{query}__doc_{attached_doc}" if attached_doc else query
    cached = await get_cached_retrieval(cache_key)
    if cached:
        return cached

    # Ensure store is populated
    if not store.chunks:
        ingest_documents()

    # 2. Vector Search
    chunks = store.search(query, top_k=top_k, attached_doc=attached_doc)

    # 3. Check relevance threshold (0.65 as per Section 6 & 7)
    threshold = settings.relevance_threshold
    threshold_cleared = bool(chunks and chunks[0]["score"] >= threshold)

    # Filter out chunks below threshold if needed, or flag
    filtered_chunks = [c for c in chunks if c["score"] >= threshold]

    result = {
        "query": query,
        "chunks": filtered_chunks,
        "raw_chunks": chunks,
        "threshold_cleared": threshold_cleared,
        "top_score": chunks[0]["score"] if chunks else 0.0
    }

    # 4. Cache in Redis (10 minutes TTL)
    await set_cached_retrieval(cache_key, result)

    logger.info(
        "Retrieved %d chunks for query '%s' (top score=%.3f, cleared=%s)",
        len(filtered_chunks),
        query[:30],
        result["top_score"],
        threshold_cleared
    )
    return result
