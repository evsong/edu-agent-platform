"""Knowledge API — document upload, RAG search, and knowledge graph endpoints."""

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.services.knowledge import KnowledgeService
from app.services.llm import LLMClient

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])

# Module-level singleton; initialised lazily on first request.
_knowledge_service: KnowledgeService | None = None


def _get_service() -> KnowledgeService:
    global _knowledge_service
    if _knowledge_service is None:
        _knowledge_service = KnowledgeService(llm=LLMClient())
    return _knowledge_service


# ── Upload ───────────────────────────────────────────────────────

@router.post("/upload")
async def upload_document(
    course_id: str = Form(...),
    file: UploadFile = File(...),
):
    """Upload a document (txt/md/pdf/docx/pptx), chunk & embed into Milvus."""
    raw_bytes = await file.read()
    filename = file.filename or "untitled.txt"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "txt"

    if ext == "pdf":
        # PDF: convert pages to images via pdftoppm, then OCR with DeepSeek-OCR via Ollama
        import tempfile
        import os
        import subprocess
        import base64
        import httpx
        import logging

        logger = logging.getLogger(__name__)
        OLLAMA_URL = "http://host.docker.internal:11434"

        with tempfile.TemporaryDirectory() as tmpdir:
            pdf_path = os.path.join(tmpdir, "input.pdf")
            with open(pdf_path, "wb") as f:
                f.write(raw_bytes)

            # Convert PDF to images (max 20 pages for demo, 150 DPI for speed)
            subprocess.run(
                ["pdftoppm", "-png", "-r", "150", "-l", "20", pdf_path, os.path.join(tmpdir, "page")],
                check=True, timeout=120,
            )

            page_images = sorted(
                [os.path.join(tmpdir, f) for f in os.listdir(tmpdir) if f.startswith("page") and f.endswith(".png")]
            )
            logger.info(f"PDF converted to {len(page_images)} page images")

            # OCR each page with DeepSeek-OCR via Ollama
            all_text = []
            async with httpx.AsyncClient(timeout=120.0) as client:
                for i, img_path in enumerate(page_images):
                    with open(img_path, "rb") as img_f:
                        img_b64 = base64.b64encode(img_f.read()).decode("utf-8")

                    try:
                        resp = await client.post(
                            f"{OLLAMA_URL}/api/generate",
                            json={
                                "model": "deepseek-ocr",
                                "prompt": "Convert this document page to markdown text. Preserve all text content, headings, and structure.",
                                "images": [img_b64],
                                "stream": False,
                            },
                        )
                        if resp.status_code == 200:
                            page_text = resp.json().get("response", "")
                            all_text.append(f"<!-- Page {i+1} -->\n{page_text}")
                            logger.info(f"OCR page {i+1}/{len(page_images)}: {len(page_text)} chars")
                        else:
                            logger.warning(f"OCR page {i+1} failed: {resp.status_code}")
                    except Exception as e:
                        logger.warning(f"OCR page {i+1} error: {e}")

            content = "\n\n".join(all_text)

    elif ext in ("docx", "doc", "pptx", "ppt"):
        # Word/PPT: try unstructured, fallback to raw text extraction
        import tempfile
        import os
        try:
            from unstructured.partition.auto import partition
            with tempfile.NamedTemporaryFile(delete=False, suffix=f".{ext}") as tmp:
                tmp.write(raw_bytes)
                tmp_path = tmp.name
            try:
                elements = partition(filename=tmp_path)
                content = "\n\n".join(str(el) for el in elements if str(el).strip())
            finally:
                os.unlink(tmp_path)
        except Exception:
            content = raw_bytes.decode("utf-8", errors="ignore")
    else:
        # Plain text (txt, md, etc.)
        content = raw_bytes.decode("utf-8")

    if not content.strip():
        return {"document_id": None, "chunk_count": 0, "knowledge_points_extracted": 0, "message": "文件内容为空"}

    svc = _get_service()
    result = await svc.upload_document(course_id, filename, content)
    return result


# ── RAG Search ───────────────────────────────────────────────────

@router.get("/search")
async def search(q: str, course_id: str, top_k: int = 3):
    """Semantic search within a course's documents, with LLM reranking."""
    svc = _get_service()
    results = await svc.search(q, course_id, top_k)
    return {"results": results}


# ── Knowledge Graph ──────────────────────────────────────────────

@router.get("/graph/{course_id}")
async def get_graph(course_id: str):
    """Return the knowledge graph for a specific course."""
    svc = _get_service()
    return await svc.get_graph(course_id)


@router.get("/graph")
async def get_full_graph():
    """Return the full knowledge graph across all courses."""
    svc = _get_service()
    return await svc.get_graph()


# ── Knowledge Point Detail ───────────────────────────────────────

@router.get("/points/{point_id}")
async def get_point(point_id: str):
    """Return a single knowledge point with its relations."""
    svc = _get_service()
    point = await svc.get_point(point_id)
    if point is None:
        raise HTTPException(status_code=404, detail="Knowledge point not found")
    return point


# ── Cross-Course Relations ───────────────────────────────────────

@router.get("/cross-course/{point_id}")
async def get_cross_course(point_id: str):
    """Return knowledge points in other courses related to this one."""
    svc = _get_service()
    return await svc.get_cross_course(point_id)
