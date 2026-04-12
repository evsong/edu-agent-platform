"""Knowledge API — document upload, RAG search, and knowledge graph endpoints."""

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.services.knowledge import KnowledgeService
from app.services.llm import LLMClient

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])

# In-memory task tracker for async PDF processing
_upload_tasks: dict[str, dict] = {}

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

    # Formats supported by markitdown
    MARKITDOWN_EXTS = {"pdf", "docx", "doc", "pptx", "ppt", "xlsx", "xls",
                       "csv", "html", "htm", "epub", "ipynb", "msg", "json", "xml", "rtf"}

    if ext in MARKITDOWN_EXTS:
        import tempfile, os, subprocess, logging
        logger = logging.getLogger(__name__)
        with tempfile.NamedTemporaryFile(delete=False, suffix=f".{ext}") as tmp:
            tmp.write(raw_bytes)
            tmp_path = tmp.name
        try:
            result = subprocess.run(
                ["markitdown", tmp_path],
                capture_output=True, text=True, timeout=120,
            )
            content = result.stdout.strip() if result.returncode == 0 else ""
            if not content:
                logger.warning(f"markitdown failed for {filename}: {result.stderr}")
                content = raw_bytes.decode("utf-8", errors="ignore")
        except Exception as e:
            logger.warning(f"markitdown error for {filename}: {e}")
            content = raw_bytes.decode("utf-8", errors="ignore")
        finally:
            os.unlink(tmp_path)
    else:
        content = raw_bytes.decode("utf-8")

    if not content.strip():
        return {"document_id": None, "chunk_count": 0, "knowledge_points_extracted": 0, "message": "文件内容为空"}

    svc = _get_service()
    result = await svc.upload_document(course_id, filename, content)
    return result


@router.get("/upload-status/{task_id}")
async def get_upload_status(task_id: str):
    """Check the status of an async PDF upload task."""
    task = _upload_tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"task_id": task_id, **task}


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
