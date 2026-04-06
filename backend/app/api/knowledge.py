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
    """Upload a text document, chunk & embed into Milvus, extract KPs to Neo4j."""
    content = (await file.read()).decode("utf-8")
    svc = _get_service()
    result = await svc.upload_document(course_id, file.filename or "untitled.txt", content)
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
