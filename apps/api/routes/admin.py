"""
Admin Route for Knowledge Base Reindexing
Protected with X-API-Key header as per Section 9 of Capstone Documentation.
"""
from __future__ import annotations
from typing import Optional
from fastapi import APIRouter, Header, HTTPException, status

from config import settings
from rag.ingest import ingest_documents
from agent_types.api import AdminReindexResponse

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.post("/reindex", response_model=AdminReindexResponse)
def reindex_knowledge_base(x_api_key: Optional[str] = Header(default=None, alias="X-API-Key")):
    """
    Triggers document reindexing. Protected with X-API-Key.
    """
    if x_api_key != settings.admin_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-API-Key header"
        )

    res = ingest_documents()
    return AdminReindexResponse(
        status="success",
        message=res["message"],
        documents_indexed=res["documents_indexed"]
    )
