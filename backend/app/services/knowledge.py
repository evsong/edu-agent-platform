"""Knowledge service — RAG retrieval (Milvus) + knowledge graph (Neo4j)."""

from __future__ import annotations

import json
import logging
import re
import uuid
from typing import Any

from langchain_text_splitters import RecursiveCharacterTextSplitter
from neo4j import AsyncGraphDatabase
from pymilvus import CollectionSchema, DataType, FieldSchema, MilvusClient

from app.config import settings
from app.services.llm import LLMClient, _EMBED_DIM

logger = logging.getLogger(__name__)
_CHUNK_SIZE = 1000
_CHUNK_OVERLAP = 200


def _neo4j_auth() -> tuple[str, str]:
    """Parse NEO4J_AUTH ('user/password') into a (user, password) tuple."""
    parts = settings.NEO4J_AUTH.split("/", 1)
    if len(parts) != 2:
        raise ValueError(
            f"NEO4J_AUTH must be in 'user/password' format, got: {settings.NEO4J_AUTH!r}"
        )
    return parts[0], parts[1]


class KnowledgeService:
    """Combines Milvus vector search with Neo4j knowledge graph."""

    def __init__(self, llm: LLMClient) -> None:
        self.llm = llm
        self.milvus = MilvusClient(uri=f"http://{settings.MILVUS_HOST}:{settings.MILVUS_PORT}")
        neo4j_user, neo4j_pass = _neo4j_auth()
        self.neo4j = AsyncGraphDatabase.driver(
            settings.NEO4J_URI,
            auth=(neo4j_user, neo4j_pass),
        )
        self._splitter = RecursiveCharacterTextSplitter(
            chunk_size=_CHUNK_SIZE,
            chunk_overlap=_CHUNK_OVERLAP,
        )

    # ── helpers ──────────────────────────────────────────────────

    @staticmethod
    def _collection_name(course_id: str) -> str:
        return f"course_{course_id.replace('-', '_')}"

    def _ensure_collection(self, collection_name: str) -> None:
        """Create the Milvus collection if it does not already exist."""
        if self.milvus.has_collection(collection_name):
            return

        fields = [
            FieldSchema(name="id", dtype=DataType.VARCHAR, is_primary=True, max_length=64),
            FieldSchema(name="vector", dtype=DataType.FLOAT_VECTOR, dim=_EMBED_DIM),
            FieldSchema(name="text", dtype=DataType.VARCHAR, max_length=65535),
            FieldSchema(name="metadata", dtype=DataType.JSON),
        ]
        schema = CollectionSchema(fields=fields, description="Course document chunks")
        index_params = MilvusClient.prepare_index_params()
        index_params.add_index(
            field_name="vector",
            index_type="IVF_FLAT",
            metric_type="COSINE",
            params={"nlist": 128},
        )
        self.milvus.create_collection(
            collection_name=collection_name,
            schema=schema,
            index_params=index_params,
        )

    # ── upload_document ──────────────────────────────────────────

    async def upload_document(
        self,
        course_id: str,
        filename: str,
        content: str,
        file_size: int = 0,
        allowed_student_ids: list[str] | None = None,
        progress_cb: Any = None,
    ) -> dict[str, Any]:
        """Chunk, embed, store in Milvus, then extract KPs into Neo4j.

        If allowed_student_ids is provided (non-empty list), only those
        students will be able to access this document. Empty list or
        None means all students in the course can access.

        progress_cb(stage: str, current: int, total: int) is called at
        each major step so the caller can update an external task log.
        """

        import asyncio

        def _report(stage: str, current: int, total: int):
            if progress_cb:
                try:
                    progress_cb(stage, current, total)
                except Exception:
                    pass

        # 1. Split content into chunks (run in thread - can be slow for huge files)
        _report("splitting", 0, 1)
        chunks = await asyncio.to_thread(self._splitter.create_documents, [content])
        chunk_texts = [c.page_content for c in chunks]
        if not chunk_texts:
            return {"document_id": None, "chunk_count": 0, "knowledge_points_extracted": 0}
        _report("splitting", 1, 1)

        # 2. Embed all chunks (already async with to_thread inside)
        total_chunks = len(chunk_texts)
        _report("embedding", 0, total_chunks)
        vectors = await self.llm.embed(chunk_texts)
        _report("embedding", total_chunks, total_chunks)

        # 3. Ensure Milvus collection exists (sync call in thread)
        col_name = self._collection_name(course_id)
        await asyncio.to_thread(self._ensure_collection, col_name)

        # 4. Create Document record in PostgreSQL first (need its UUID for KP links)
        from app.database import async_session as AsyncSessionLocal
        from app.models.document import Document as DocumentModel
        import uuid as _uuid

        try:
            course_uuid = _uuid.UUID(course_id)
        except ValueError:
            course_uuid = None

        document_uuid = _uuid.uuid4()
        doc_id = document_uuid.hex  # for Milvus chunk metadata

        if course_uuid:
            async with AsyncSessionLocal() as db:
                try:
                    pg_doc = DocumentModel(
                        id=document_uuid,
                        course_id=course_uuid,
                        filename=filename,
                        file_size=file_size,
                        chunk_count=len(chunk_texts),
                        status="indexed",
                        allowed_student_ids={"ids": allowed_student_ids or []},
                    )
                    db.add(pg_doc)
                    await db.commit()
                except Exception as e:
                    logger.warning(f"Failed to create Document row: {e}")
                    await db.rollback()

        # 5. Insert chunks + vectors into Milvus (batch for progress reports)
        rows = [
            {
                "id": f"{doc_id}_{i}",
                "vector": vectors[i],
                "text": chunk_texts[i],
                "metadata": {"document_id": doc_id, "filename": filename, "chunk_index": i},
            }
            for i in range(len(chunk_texts))
        ]
        _report("inserting", 0, total_chunks)
        # Insert in batches of 500 so we can report progress
        BATCH = 500
        for start in range(0, len(rows), BATCH):
            batch = rows[start:start + BATCH]
            await asyncio.to_thread(
                self.milvus.insert, collection_name=col_name, data=batch
            )
            _report("inserting", min(start + BATCH, total_chunks), total_chunks)

        # 6. Extract knowledge points via LLM (best effort)
        _report("extracting_kp", 0, 1)

        # Skip front-matter (TOC, copyright, acknowledgments) by sampling from
        # the MIDDLE of the document. Take evenly-spaced chunks and concat.
        def _sample_chunks() -> str:
            if len(chunk_texts) < 6:
                return "\n\n".join(chunk_texts)
            # Skip first 10% (TOC/copyright) and last 5% (index/bibliography)
            lo = max(1, int(len(chunk_texts) * 0.10))
            hi = max(lo + 1, int(len(chunk_texts) * 0.95))
            # Sample 8 chunks across the body
            step = max(1, (hi - lo) // 8)
            picked = [chunk_texts[i] for i in range(lo, hi, step)][:8]
            return "\n\n---\n\n".join(picked)

        sampled_content = _sample_chunks()
        extraction_prompt = (
            "You are extracting the main KNOWLEDGE POINTS (topics/concepts) that "
            "appear in these excerpts from an educational textbook. Return STRICT "
            "JSON ONLY, no prose, no markdown fences. Schema:\n"
            '{"knowledge_points": [{"name": string, "difficulty": 1-5, "tags": [string]}]}\n'
            "Generate 5-12 concrete topics actually discussed in the text. "
            "Name should be a noun phrase under 24 characters, in English or Chinese "
            "matching the textbook language. difficulty 1=intro, 5=advanced. "
            "If the excerpts are too sparse to tell, return at least 3 broad topics "
            "based on the visible keywords."
        )
        kp_list: list[dict] = []
        kp_raw = ""
        try:
            kp_raw = await self.llm.chat(
                messages=[
                    {"role": "system", "content": extraction_prompt},
                    {"role": "user", "content": sampled_content[:12000]},
                ],
            )
            logger.info(
                f"KP raw (first 300 chars) for {filename}: {kp_raw[:300]!r}"
            )
            # Strip common wrappers: markdown code fences, prose before/after
            cleaned = kp_raw.strip()
            if cleaned.startswith("```"):
                cleaned = cleaned.split("```", 2)[1]
                if cleaned.startswith("json"):
                    cleaned = cleaned[4:]
                cleaned = cleaned.strip()
                if cleaned.endswith("```"):
                    cleaned = cleaned[:-3].strip()
            # Locate JSON boundaries — try object first, then array
            obj_start = cleaned.find("{")
            arr_start = cleaned.find("[")
            if obj_start >= 0 and (arr_start < 0 or obj_start < arr_start):
                cleaned = cleaned[obj_start:]
                end = cleaned.rfind("}")
                if end >= 0:
                    cleaned = cleaned[:end + 1]
            elif arr_start >= 0:
                cleaned = cleaned[arr_start:]
                end = cleaned.rfind("]")
                if end >= 0:
                    cleaned = cleaned[:end + 1]
            if not cleaned:
                raise ValueError("LLM returned empty content")
            parsed = json.loads(cleaned)
            if isinstance(parsed, dict):
                if "knowledge_points" in parsed and isinstance(parsed["knowledge_points"], list):
                    kp_list = parsed["knowledge_points"]
                else:
                    for v in parsed.values():
                        if isinstance(v, list):
                            kp_list = v
                            break
            elif isinstance(parsed, list):
                kp_list = parsed
        except Exception as e:
            logger.warning(
                f"KP extraction failed for {filename}: {e} | raw={kp_raw[:200]!r}"
            )

        # Fallback: extract most frequent meaningful words as KP names
        if not kp_list:
            from collections import Counter
            # Pick words 4+ chars, lowercase, ignore stopwords
            stop = {
                "the", "and", "for", "that", "this", "with", "are", "from",
                "have", "has", "not", "will", "can", "may", "which", "these",
                "those", "some", "more", "when", "also", "other", "such",
                "than", "then", "they", "their", "them", "there", "been",
                "each", "what", "its", "was", "were", "will", "how", "you",
                "your", "our", "use", "used", "using", "chapter", "section",
                "figure", "table", "example",
            }
            words = re.findall(r"[a-zA-Z]{4,}", sampled_content.lower())
            counter = Counter(w for w in words if w not in stop)
            top = counter.most_common(10)
            if top:
                kp_list = [
                    {"name": w.title(), "difficulty": 2, "tags": [f"freq={c}"]}
                    for w, c in top
                ]
            else:
                # No real KPs to extract — don't fabricate one from the
                # filename. A document with nothing extractable shouldn't
                # pollute the graph with a pseudo-KP named after the file.
                logger.warning(
                    f"KP extraction produced no results for {filename}; "
                    "skipping KP creation"
                )
                kp_list = []
        _report("extracting_kp", 1, 1)

        # 7. Create knowledge points in PostgreSQL (linked to document) + Neo4j
        from app.models.knowledge_point import KnowledgePoint as KPModel

        # Guard against junk KP names: UUIDs, filenames, pure punctuation.
        _uuid_re = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE)

        created_count = 0
        if course_uuid:
            async with AsyncSessionLocal() as db:
                for kp in kp_list:
                    name = str(kp.get("name", "")).strip()
                    if not name:
                        continue
                    if _uuid_re.match(name) or name.endswith("教材") or name.endswith(".pdf"):
                        logger.warning(f"Skipping junk KP name: {name!r}")
                        continue
                    pg_kp = KPModel(
                        id=_uuid.uuid4(),
                        name=name[:500],
                        course_id=course_uuid,
                        document_id=document_uuid,
                        difficulty=int(kp.get("difficulty", 1) or 1),
                        tags={"tags": kp.get("tags", []), "source": filename},
                    )
                    db.add(pg_kp)
                    created_count += 1
                try:
                    await db.commit()
                except Exception as e:
                    logger.warning(f"Failed to commit KPs to PostgreSQL: {e}")
                    await db.rollback()

        # Best-effort Neo4j mirror (non-fatal)
        try:
            async with self.neo4j.session() as session:
                for kp in kp_list:
                    name = str(kp.get("name", "")).strip()
                    if not name:
                        continue
                    kp_id = _uuid.uuid4().hex
                    await session.run(
                        """
                        CREATE (kp:KP {
                            id: $id, name: $name, course_id: $course_id,
                            difficulty: $difficulty, tags: $tags
                        })
                        """,
                        id=kp_id,
                        name=name,
                        course_id=course_id,
                        difficulty=int(kp.get("difficulty", 1) or 1),
                        tags=json.dumps(kp.get("tags", [])),
                    )
        except Exception as e:
            logger.warning(f"Neo4j KP mirror failed: {e}")

        return {
            "document_id": doc_id,
            "chunk_count": len(chunk_texts),
            "knowledge_points_extracted": created_count,
        }

    # ── search ───────────────────────────────────────────────────

    async def search(
        self,
        query: str,
        course_id: str,
        top_k: int = 3,
    ) -> list[dict[str, Any]]:
        """RAG search: vector recall + LLM rerank + Neo4j cross-course hints."""

        # 1. Embed query
        q_vec = (await self.llm.embed([query]))[0]

        # 2. Milvus search — recall top 10
        col_name = self._collection_name(course_id)
        if not self.milvus.has_collection(col_name):
            return []

        hits = self.milvus.search(
            collection_name=col_name,
            data=[q_vec],
            limit=10,
            output_fields=["text", "metadata"],
        )
        if not hits or not hits[0]:
            return []

        candidates = [
            {
                "index": i,
                "text": h["entity"]["text"],
                "score": h["distance"],
                "metadata": h["entity"]["metadata"],
            }
            for i, h in enumerate(hits[0])
        ]

        # 3. Rerank via LLM — ask for top-k indices
        rerank_prompt = (
            f"Given the query: \"{query}\"\n\n"
            "Rank the following passages by relevance. "
            f"Return a JSON array of the top {top_k} passage indices (0-based).\n\n"
        )
        for c in candidates:
            rerank_prompt += f"[{c['index']}] {c['text'][:300]}\n\n"
        rerank_prompt += f"Return only a JSON array of {top_k} integers, most relevant first."

        rerank_raw = await self.llm.chat(
            messages=[{"role": "user", "content": rerank_prompt}],
            json_mode=True,
        )
        try:
            parsed = json.loads(rerank_raw)
            # Handle wrapping object
            if isinstance(parsed, dict):
                parsed = next(iter(parsed.values()))
            top_indices: list[int] = [int(x) for x in parsed[:top_k]]
        except (json.JSONDecodeError, ValueError, StopIteration):
            logger.warning("Rerank parse failed, using vector score order")
            top_indices = list(range(min(top_k, len(candidates))))

        # 4. Neo4j cross-course enhancement
        results: list[dict[str, Any]] = []
        async with self.neo4j.session() as session:
            for idx in top_indices:
                if idx < 0 or idx >= len(candidates):
                    continue
                cand = candidates[idx]

                # Simple keyword extraction: first 5 words of text
                keywords = cand["text"].split()[:5]
                cross_hints: list[dict] = []
                for kw in keywords:
                    if len(kw) < 3:
                        continue
                    res = await session.run(
                        """
                        MATCH (n:KP)-[:CROSS_COURSE]->(m)
                        WHERE n.name CONTAINS $keyword AND n.course_id = $cid
                        RETURN m.id AS id, m.name AS name, m.course_id AS course_id
                        LIMIT 3
                        """,
                        keyword=kw,
                        cid=course_id,
                    )
                    records = await res.data()
                    for r in records:
                        if r not in cross_hints:
                            cross_hints.append(r)

                results.append(
                    {
                        "text": cand["text"],
                        "score": cand["score"],
                        "source": cand["metadata"].get("filename", "unknown"),
                        "cross_course_hints": cross_hints,
                    }
                )

        return results

    # ── get_graph ────────────────────────────────────────────────

    async def list_documents(
        self,
        course_id: str,
        user_id: str | None = None,
    ) -> list[dict[str, Any]]:
        """List documents for a course, optionally filtered by student access.

        If user_id is provided and a document has non-empty allowed_student_ids,
        the document is only returned when user_id is in that list.
        """
        from sqlalchemy import select
        from app.database import async_session as AsyncSessionLocal
        from app.models.document import Document as DocumentModel
        import uuid as _uuid

        try:
            course_uuid = _uuid.UUID(course_id)
        except ValueError:
            return []

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(DocumentModel)
                .where(DocumentModel.course_id == course_uuid)
                .order_by(DocumentModel.uploaded_at.desc())
            )
            docs = result.scalars().all()

        output = []
        for d in docs:
            allowed = (d.allowed_student_ids or {}).get("ids", []) if isinstance(d.allowed_student_ids, dict) else []
            # If allowed list is non-empty and user_id not in it, skip
            if user_id and allowed and user_id not in allowed:
                continue
            output.append({
                "id": str(d.id),
                "filename": d.filename,
                "size": d.file_size,
                "chunk_count": d.chunk_count,
                "uploaded_at": d.uploaded_at.isoformat() + "Z" if d.uploaded_at else None,
                "status": d.status,
                "allowed_student_ids": allowed,
            })
        return output

    async def get_graph(
        self,
        course_id: str | None = None,
        document_id: str | None = None,
    ) -> dict[str, Any]:
        """Return knowledge graph as {nodes, edges} for visualization.

        Filters:
          - course_id: limit to a single course
          - document_id: limit to a single uploaded textbook (takes priority
            over course_id). When set, only KPs linked to that document
            are returned.

        Primary source: PostgreSQL `knowledge_points` table. Neo4j is used
        to enrich with relationship edges when available.
        """
        from sqlalchemy import select
        from app.database import async_session as AsyncSessionLocal
        from app.models.knowledge_point import KnowledgePoint as KPModel

        nodes_map: dict[str, dict] = {}
        edges: list[dict] = []

        # 1. Load KP nodes from PostgreSQL (authoritative)
        kp_by_group: dict[str, list[dict]] = {}
        async with AsyncSessionLocal() as db:
            stmt = select(KPModel)
            import uuid as _uuid
            if document_id:
                try:
                    doc_uuid = _uuid.UUID(document_id)
                    stmt = stmt.where(KPModel.document_id == doc_uuid)
                except ValueError:
                    pass
            elif course_id:
                try:
                    course_uuid = _uuid.UUID(course_id)
                    stmt = stmt.where(KPModel.course_id == course_uuid)
                except ValueError:
                    pass
            result = await db.execute(stmt)
            for kp in result.scalars().all():
                nid = str(kp.id)
                group_key = str(kp.document_id) if kp.document_id else str(kp.course_id)
                node = {
                    "id": nid,
                    "name": kp.name,
                    "course_id": str(kp.course_id),
                    "document_id": str(kp.document_id) if kp.document_id else None,
                    "difficulty": kp.difficulty,
                    "group": group_key,
                }
                nodes_map[nid] = node
                kp_by_group.setdefault(group_key, []).append(node)

        # 1b. Generate synthetic "curriculum path" edges so the graph is not
        # just floating dots. Chain KPs within each group (document or
        # course) by ascending difficulty, skipping self-loops.
        for group_key, kps in kp_by_group.items():
            ordered = sorted(kps, key=lambda n: (n["difficulty"], n["name"]))
            for a, b in zip(ordered, ordered[1:]):
                edges.append({
                    "source": a["id"],
                    "target": b["id"],
                    "type": "prerequisite",
                })

        # 2. Enrich with Neo4j edges if the KPs also exist there
        try:
            if course_id:
                neo_query = (
                    "MATCH (n:KP {course_id: $cid})-[r]->(m:KP) "
                    "RETURN n.id AS source, m.id AS target, type(r) AS type"
                )
                params: dict = {"cid": course_id}
            else:
                neo_query = (
                    "MATCH (n:KP)-[r]->(m:KP) "
                    "RETURN n.id AS source, m.id AS target, type(r) AS type"
                )
                params = {}
            async with self.neo4j.session() as session:
                res = await session.run(neo_query, **params)
                async for rec in res:
                    source = rec.get("source")
                    target = rec.get("target")
                    if source and target:
                        edges.append({
                            "source": source,
                            "target": target,
                            "type": rec.get("type") or "RELATED",
                        })
        except Exception as e:
            logger.warning(f"Neo4j enrichment failed: {e}")

        return {"nodes": list(nodes_map.values()), "edges": edges}

    # ── get_cross_course ─────────────────────────────────────────

    async def get_cross_course(self, point_id: str) -> list[dict[str, Any]]:
        """Return cross-course related knowledge points for a given KP id."""
        async with self.neo4j.session() as session:
            result = await session.run(
                """
                MATCH (n:KP {id: $pid})-[:CROSS_COURSE]->(m)
                RETURN m.id AS id, m.name AS name, m.course_id AS course_id,
                       m.difficulty AS difficulty, m.tags AS tags
                """,
                pid=point_id,
            )
            records = await result.data()
        return records

    # ── get_point ────────────────────────────────────────────────

    async def get_point(self, point_id: str) -> dict[str, Any] | None:
        """Return a single knowledge point with its relations."""
        async with self.neo4j.session() as session:
            # Fetch the node
            result = await session.run(
                "MATCH (n:KP {id: $pid}) RETURN n",
                pid=point_id,
            )
            records = await result.data()
            if not records:
                return None

            node = records[0]["n"]

            # Fetch relations
            rel_result = await session.run(
                """
                MATCH (n:KP {id: $pid})-[r]->(m:KP)
                RETURN type(r) AS rel_type, m.id AS target_id, m.name AS target_name,
                       m.course_id AS target_course_id
                """,
                pid=point_id,
            )
            relations = await rel_result.data()

        return {
            "id": node.get("id", ""),
            "name": node.get("name", ""),
            "course_id": node.get("course_id", ""),
            "difficulty": node.get("difficulty", 1),
            "tags": node.get("tags", "[]"),
            "relations": relations,
        }

    # ── cleanup ──────────────────────────────────────────────────

    async def close(self) -> None:
        """Close external connections."""
        await self.neo4j.close()
