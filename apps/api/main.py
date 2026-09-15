"""
FastAPI Gateway Main Application
"""
from __future__ import annotations
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from db.mongo import get_db
from rag.ingest import ingest_documents, ingest_uploaded_file
from routes.admin import router as admin_router
from routes.chat import router as chat_router
from routes.health import router as health_router
from routes.conversations import router as conversations_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("main_api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize knowledge base ingestion on startup
    logger.info("Initializing Agentflow-AI Knowledge Base...")
    ingest_documents()
    try:
        await get_db()
        logger.info("MongoDB Atlas database initialized.")
    except Exception as exc:
        logger.warning("MongoDB init warning: %s", exc)
    yield
    logger.info("Shutting down Agentflow-AI Gateway.")


app = FastAPI(
    title="Agentflow-AI Gateway",
    version="1.0.0",
    description="Autonomous Agent Gateway implementing Ask, Retrieve, Act architecture",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https://.*\.vercel\.app|http://localhost:\d+|https://.*\.loca\.lt|https://.*\.ngrok-free\.app|https://.*\.onrender\.com|https://.*\.railway\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(chat_router)
app.include_router(conversations_router)
app.include_router(health_router)
app.include_router(admin_router)


@app.get("/")
def root():
    return {
        "name": "Agentflow-AI Autonomous Gateway",
        "version": "1.0.0",
        "status": "operational",
        "architecture": "Ask, Retrieve, Act",
        "docs_url": "/docs",
        "health_url": "/health",
        "chat_url": "/chat",
        "admin_url": "/admin/reindex",
        "upload_url": "/rag/upload"
    }


@app.post("/rag/upload")
async def upload_document(file: UploadFile = File(...)):
    """
    Accepts PDF, MD, or TXT file upload, extracts text, chunks, and indexes it into the vector store.
    """
    content = await file.read()
    result = ingest_uploaded_file(file.filename, content)
    return result

if __name__ == "__main__":
    import os
    import sys
    api_dir = os.path.dirname(os.path.abspath(__file__))
    if api_dir not in sys.path:
        sys.path.insert(0, api_dir)
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
