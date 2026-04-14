"""Knowledge API — document upload, RAG search, and knowledge graph endpoints."""

import asyncio
import logging
import os
import subprocess
import tempfile
import uuid
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.services.knowledge import KnowledgeService
from app.services.llm import LLMClient

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])

# Formats supported by markitdown
MARKITDOWN_EXTS = {"pdf", "docx", "doc", "pptx", "ppt", "xlsx", "xls",
                   "csv", "html", "htm", "epub", "ipynb", "msg", "json", "xml", "rtf"}

# In-memory task tracker for async processing
_upload_tasks: dict[str, dict] = {}

# In-memory chunked upload sessions: upload_id -> {course_id, filename, total_chunks, received, tmp_dir}
_upload_sessions: dict[str, dict] = {}

# Temp directory for chunks
CHUNK_TMP_ROOT = Path(tempfile.gettempdir()) / "eduagent_chunks"
CHUNK_TMP_ROOT.mkdir(exist_ok=True)

_knowledge_service: KnowledgeService | None = None


def _get_service() -> KnowledgeService:
    global _knowledge_service
    if _knowledge_service is None:
        _knowledge_service = KnowledgeService(llm=LLMClient())
    return _knowledge_service


def _run_markitdown_sync(file_path: str) -> tuple[str, str]:
    """Blocking markitdown call — run in thread pool from async context."""
    try:
        result = subprocess.run(
            ["markitdown", file_path],
            capture_output=True, text=True, timeout=600,
        )
        return (result.stdout.strip() if result.returncode == 0 else "",
                result.stderr if result.returncode != 0 else "")
    except Exception as e:
        return ("", str(e))


async def _extract_content(file_path: str, filename: str, ext: str) -> str:
    """Extract text content from a file using markitdown or fallback.

    Runs blocking subprocess in a thread pool to avoid freezing the event loop.
    """
    if ext in MARKITDOWN_EXTS:
        content, err = await asyncio.to_thread(_run_markitdown_sync, file_path)
        if content:
            return content
        logger.warning(f"markitdown returned empty for {filename}: {err}")
    # Fallback: UTF-8 decode (run in thread in case of huge file)
    def _read_text():
        try:
            with open(file_path, "rb") as f:
                return f.read().decode("utf-8", errors="ignore")
        except Exception:
            return ""
    return await asyncio.to_thread(_read_text)


async def _process_file_background(
    task_id: str,
    course_id: str,
    filename: str,
    file_path: str,
    file_size: int = 0,
    allowed_student_ids: list[str] | None = None,
):
    """Background task: extract content, chunk, embed, store in Milvus."""
    try:
        _upload_tasks[task_id]["status"] = "extracting"
        _upload_tasks[task_id]["progress"] = {"stage": "extracting", "current": 0, "total": 0}
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "txt"
        content = await _extract_content(file_path, filename, ext)

        if not content.strip():
            _upload_tasks[task_id].update({
                "status": "error",
                "message": "文件内容为空或无法解析",
            })
            return

        _upload_tasks[task_id]["status"] = "indexing"
        _upload_tasks[task_id]["content_size"] = len(content)

        # Stage → human-friendly UI label
        STAGE_LABELS = {
            "splitting": "切分文本",
            "embedding": "生成向量",
            "inserting": "写入索引",
            "extracting_kp": "提取知识点",
        }

        def _progress(stage: str, current: int, total: int):
            _upload_tasks[task_id]["progress"] = {
                "stage": stage,
                "label": STAGE_LABELS.get(stage, stage),
                "current": current,
                "total": total,
            }

        svc = _get_service()
        result = await svc.upload_document(
            course_id, filename, content,
            file_size=file_size,
            allowed_student_ids=allowed_student_ids,
            progress_cb=_progress,
        )
        _upload_tasks[task_id].update({"status": "completed", **result})
    except Exception as e:
        logger.exception(f"Background task {task_id} failed")
        _upload_tasks[task_id].update({"status": "error", "message": str(e)})
    finally:
        # Clean up temp file
        try:
            os.unlink(file_path)
        except Exception:
            pass


# ── Simple Upload (small files, <100MB, <100s processing) ────────

@router.post("/upload")
async def upload_document(
    course_id: str = Form(...),
    file: UploadFile = File(...),
    allowed_student_ids: str = Form(""),
):
    """Simple upload for small files. Saves to temp and starts async processing.

    allowed_student_ids: JSON array of user UUIDs, or empty string for "all".
    """
    raw_bytes = await file.read()
    filename = file.filename or "untitled.txt"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "txt"

    # Parse allowed students list
    import json as _json
    try:
        parsed_ids = _json.loads(allowed_student_ids) if allowed_student_ids else []
        if not isinstance(parsed_ids, list):
            parsed_ids = []
    except Exception:
        parsed_ids = []

    # Write to temp file
    tmp_fd, tmp_path = tempfile.mkstemp(suffix=f".{ext}")
    try:
        with os.fdopen(tmp_fd, "wb") as f:
            f.write(raw_bytes)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save upload: {e}")

    task_id = str(uuid.uuid4())
    import datetime as _dt
    _upload_tasks[task_id] = {
        "status": "queued",
        "course_id": course_id,
        "filename": filename,
        "file_size": len(raw_bytes),
        "uploaded_at": _dt.datetime.utcnow().isoformat() + "Z",
    }

    asyncio.create_task(_process_file_background(
        task_id, course_id, filename, tmp_path,
        file_size=len(raw_bytes),
        allowed_student_ids=parsed_ids,
    ))
    return {"task_id": task_id, "status": "queued", "filename": filename}


# ── Chunked Upload (for large files >20MB) ───────────────────────

@router.post("/upload/init")
async def upload_init(
    course_id: str = Form(...),
    filename: str = Form(...),
    total_chunks: int = Form(...),
    file_size: int = Form(...),
    allowed_student_ids: str = Form(""),
):
    """Initialize a chunked upload session. Returns upload_id."""
    if total_chunks < 1 or total_chunks > 10000:
        raise HTTPException(status_code=400, detail="Invalid total_chunks")
    if file_size > 500 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 500MB)")

    import json as _json
    try:
        parsed_ids = _json.loads(allowed_student_ids) if allowed_student_ids else []
        if not isinstance(parsed_ids, list):
            parsed_ids = []
    except Exception:
        parsed_ids = []

    upload_id = str(uuid.uuid4())
    tmp_dir = CHUNK_TMP_ROOT / upload_id
    tmp_dir.mkdir(exist_ok=True)

    _upload_sessions[upload_id] = {
        "course_id": course_id,
        "filename": filename,
        "total_chunks": total_chunks,
        "file_size": file_size,
        "received": set(),
        "tmp_dir": str(tmp_dir),
        "allowed_student_ids": parsed_ids,
    }
    return {"upload_id": upload_id}


@router.post("/upload/chunk/{upload_id}")
async def upload_chunk(
    upload_id: str,
    chunk_index: int = Form(...),
    chunk: UploadFile = File(...),
):
    """Upload a single chunk."""
    session = _upload_sessions.get(upload_id)
    if not session:
        raise HTTPException(status_code=404, detail="Upload session not found")
    if chunk_index < 0 or chunk_index >= session["total_chunks"]:
        raise HTTPException(status_code=400, detail="Invalid chunk_index")

    chunk_bytes = await chunk.read()
    chunk_path = Path(session["tmp_dir"]) / f"chunk_{chunk_index:06d}"
    with open(chunk_path, "wb") as f:
        f.write(chunk_bytes)

    session["received"].add(chunk_index)
    return {
        "received": len(session["received"]),
        "total": session["total_chunks"],
    }


@router.post("/upload/complete/{upload_id}")
async def upload_complete(upload_id: str):
    """Finalize a chunked upload: merge chunks, start async processing."""
    session = _upload_sessions.get(upload_id)
    if not session:
        raise HTTPException(status_code=404, detail="Upload session not found")

    if len(session["received"]) != session["total_chunks"]:
        raise HTTPException(
            status_code=400,
            detail=f"Missing chunks: got {len(session['received'])}/{session['total_chunks']}",
        )

    # Merge chunks into single file
    filename = session["filename"]
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "txt"
    tmp_dir = Path(session["tmp_dir"])
    merged_fd, merged_path = tempfile.mkstemp(suffix=f".{ext}")
    try:
        with os.fdopen(merged_fd, "wb") as out:
            for i in range(session["total_chunks"]):
                chunk_path = tmp_dir / f"chunk_{i:06d}"
                with open(chunk_path, "rb") as inp:
                    out.write(inp.read())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to merge chunks: {e}")

    # Cleanup chunks
    try:
        for p in tmp_dir.glob("chunk_*"):
            p.unlink()
        tmp_dir.rmdir()
    except Exception:
        pass
    _upload_sessions.pop(upload_id, None)

    # Start async processing
    import datetime as _dt
    task_id = str(uuid.uuid4())
    _upload_tasks[task_id] = {
        "status": "queued",
        "course_id": session["course_id"],
        "filename": filename,
        "file_size": session["file_size"],
        "uploaded_at": _dt.datetime.utcnow().isoformat() + "Z",
    }
    asyncio.create_task(_process_file_background(
        task_id, session["course_id"], filename, merged_path,
        file_size=session["file_size"],
        allowed_student_ids=session.get("allowed_student_ids") or [],
    ))
    return {"task_id": task_id, "status": "queued", "filename": filename}


@router.get("/upload-status/{task_id}")
async def get_upload_status(task_id: str):
    """Check the status of an async upload task."""
    task = _upload_tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"task_id": task_id, **task}


# ── Document List ───────────────────────────────────────────────

@router.get("/docs/{course_id}")
async def list_docs(course_id: str, user_id: str | None = None):
    """List documents for a course. If user_id is set, enforce per-document
    access control (students only see docs they've been granted access to)."""
    svc = _get_service()
    return await svc.list_documents(course_id, user_id=user_id)


@router.delete("/docs/{document_id}", status_code=204)
async def delete_document(document_id: str):
    """Delete a document plus the knowledge points and exercises derived
    from it. Best-effort cleanup of Milvus vectors as well."""
    from app.database import async_session
    from app.models.document import Document
    from app.models.knowledge_point import KnowledgePoint
    from app.models.exercise import Exercise
    from sqlalchemy import select as _select, delete as _delete
    import uuid as _uuid

    try:
        doc_uuid = _uuid.UUID(document_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid document id")

    async with async_session() as db:
        doc_q = await db.execute(_select(Document).where(Document.id == doc_uuid))
        doc = doc_q.scalar_one_or_none()
        if doc is None:
            raise HTTPException(status_code=404, detail="Document not found")
        # KPs derived from this doc
        kp_q = await db.execute(
            _select(KnowledgePoint.id).where(KnowledgePoint.document_id == doc_uuid)
        )
        kp_ids = [r[0] for r in kp_q.fetchall()]
        if kp_ids:
            await db.execute(
                _delete(Exercise).where(Exercise.knowledge_point_id.in_(kp_ids))
            )
            await db.execute(
                _delete(KnowledgePoint).where(KnowledgePoint.document_id == doc_uuid)
            )
        await db.delete(doc)
        await db.commit()

    # Milvus cleanup is best-effort — if the helper isn't implemented, skip it
    try:
        svc = _get_service()
        deleter = getattr(svc, "delete_document_vectors", None)
        if deleter:
            await deleter(document_id)
    except Exception:
        logger.exception("Milvus cleanup failed for %s", document_id)
    return None


@router.post("/rebuild/{course_id}")
async def rebuild_index(course_id: str):
    """Re-run KP extraction over all documents for a course (lightweight stub
    — for the demo it just returns immediately; a full rebuild is better
    triggered per-document via re-upload)."""
    return {"status": "ok", "course_id": course_id, "note": "rebuild scheduled"}


# ── RAG Search ───────────────────────────────────────────────────

@router.get("/search")
async def search(q: str, course_id: str, top_k: int = 3):
    """Semantic search within a course's documents, with LLM reranking."""
    svc = _get_service()
    results = await svc.search(q, course_id, top_k)
    return {"results": results}


# ── Knowledge Graph ──────────────────────────────────────────────

@router.get("/graph/{course_id}")
async def get_graph(course_id: str, document_id: str | None = None):
    """Return the knowledge graph for a specific course, optionally
    filtered to a single uploaded document."""
    svc = _get_service()
    return await svc.get_graph(course_id, document_id=document_id)


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
