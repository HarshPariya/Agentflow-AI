"""
Knowledge Base Document Ingestion Pipeline
Loads markdown, text, and PDF documents, chunks at 300-500 tokens with ~15% overlap,
extracts metadata, and indexes them into the vector store.
"""
from __future__ import annotations
import logging
from pathlib import Path
import re
from typing import Any, Dict, List

from rag.embed import store

logger = logging.getLogger("rag_ingest")

DATA_DIR = Path(__file__).resolve().parent.parent.parent.parent / "data" / "knowledge_base"


def extract_text_from_pdf(file_path: Path) -> str:
    """Extracts text from all pages of a PDF file using pypdf."""
    try:
        import pypdf
        reader = pypdf.PdfReader(str(file_path))
        pages_text = []
        for i, page in enumerate(reader.pages):
            text = page.extract_text() or ""
            if text.strip():
                pages_text.append(f"--- Page {i+1} ---\n{text}")
        return "\n\n".join(pages_text)
    except Exception as exc:
        logger.error("Failed to extract PDF text from %s: %s", file_path, exc)
        return ""


def chunk_text(text: str, chunk_size: int = 350, overlap: int = 50) -> List[str]:
    """
    Chunks text into ~300-500 token windows with ~15% overlap.
    Preserves sentence boundaries.
    """
    words = text.split()
    if len(words) <= chunk_size:
        return [text]

    chunks = []
    step = max(1, chunk_size - overlap)
    for i in range(0, len(words), step):
        chunk_words = words[i:i + chunk_size]
        chunks.append(" ".join(chunk_words))
        if i + chunk_size >= len(words):
            break
    return chunks


def extract_metadata(content: str, filename: str) -> Dict[str, str]:
    """Extracts title, document ID, and category metadata from document headers or filenames."""
    doc_id_match = re.search(r"\*\*Document ID\*\*:\s*([^\n\r]+)", content)
    doc_id = doc_id_match.group(1).strip() if doc_id_match else filename.rsplit(".", 1)[0]

    title_match = re.search(r"^#\s+(.+)$", content, re.MULTILINE)
    title = title_match.group(1).strip() if title_match else filename.rsplit(".", 1)[0].replace("-", " ").replace("_", " ").title()

    category_match = re.search(r"\*\*Category\*\*:\s*([^\n\r]+)", content)
    category = category_match.group(1).strip() if category_match else "Uploaded Documentation"

    return {"docId": doc_id, "title": title, "category": category}


def ingest_documents() -> Dict[str, Any]:
    """Loads all markdown, txt, and PDF documents, chunks them, and indexes them."""
    indexed_chunks: List[Dict[str, Any]] = []
    
    # Match markdown, text, and PDF files
    md_files = list(DATA_DIR.glob("*.md"))
    txt_files = list(DATA_DIR.glob("*.txt"))
    pdf_files = list(DATA_DIR.glob("*.pdf"))
    all_files = md_files + txt_files + pdf_files

    for file_path in all_files:
        if file_path.suffix.lower() == ".pdf":
            raw_content = extract_text_from_pdf(file_path)
        else:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                raw_content = f.read()

        if not raw_content.strip():
            continue

        meta = extract_metadata(raw_content, file_path.name)
        chunks = chunk_text(raw_content)

        for idx, chunk in enumerate(chunks):
            indexed_chunks.append({
                "docId": meta["docId"],
                "title": meta["title"],
                "section": f"{meta['category']} - Part {idx+1}",
                "text": chunk,
                "source_url": f"https://knowledge.agentflow.internal/docs/{meta['docId']}"
            })

    store.fit_and_index(indexed_chunks)
    logger.info("Ingested %d documents (%d chunks)", len(all_files), len(indexed_chunks))

    return {
        "status": "success",
        "documents_indexed": len(all_files),
        "chunks_indexed": len(indexed_chunks),
        "message": f"Successfully chunked and indexed {len(all_files)} documents ({len(indexed_chunks)} chunks)."
    }


def ingest_uploaded_file(filename: str, content_bytes: bytes) -> Dict[str, Any]:
    """
    Saves an uploaded file (PDF, MD, TXT) to the knowledge base directory and re-indexes.
    """
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    target_path = DATA_DIR / filename
    with open(target_path, "wb") as f:
        f.write(content_bytes)

    # Re-index all documents including newly saved file
    res = ingest_documents()
    
    # Calculate how many chunks this specific doc produced
    doc_id = filename.rsplit(".", 1)[0]
    matching_chunks = [c for c in store.chunks if c.get("docId") == doc_id or filename in c.get("docId", "")]

    return {
        "status": "success",
        "filename": filename,
        "docId": doc_id,
        "chunks_indexed": len(matching_chunks) or 1,
        "total_documents": res["documents_indexed"],
        "message": f"Successfully uploaded and indexed '{filename}' into knowledge base."
    }


# Automatically index on module load
ingest_documents()
