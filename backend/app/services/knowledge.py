"""Knowledge service — RAG retrieval (Milvus) + knowledge graph (Neo4j)."""

from __future__ import annotations

import json
import logging
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
        self.milvus.create_collection(
            collection_name=collection_name,
            schema=schema,
        )
        # Create vector index for search
        self.milvus.create_index(
            collection_name=collection_name,
            field_name="vector",
            index_params={"index_type": "IVF_FLAT", "metric_type": "COSINE", "params": {"nlist": 128}},
        )

    # ── upload_document ──────────────────────────────────────────

    async def upload_document(
        self,
        course_id: str,
        filename: str,
        content: str,
    ) -> dict[str, Any]:
        """Chunk, embed, store in Milvus, then extract KPs into Neo4j."""

        # 1. Split content into chunks
        chunks = self._splitter.create_documents([content])
        chunk_texts = [c.page_content for c in chunks]
        if not chunk_texts:
            return {"document_id": None, "chunk_count": 0, "knowledge_points_extracted": 0}

        # 2. Embed all chunks
        vectors = await self.llm.embed(chunk_texts)

        # 3. Ensure Milvus collection exists
        col_name = self._collection_name(course_id)
        self._ensure_collection(col_name)

        # 4. Insert chunks + vectors
        doc_id = uuid.uuid4().hex
        rows = [
            {
                "id": f"{doc_id}_{i}",
                "vector": vectors[i],
                "text": chunk_texts[i],
                "metadata": {"document_id": doc_id, "filename": filename, "chunk_index": i},
            }
            for i in range(len(chunk_texts))
        ]
        self.milvus.insert(collection_name=col_name, data=rows)

        # 5. Extract knowledge points via LLM
        extraction_prompt = (
            "Extract knowledge point names from this educational document. "
            "Return a JSON array of objects, each with keys: "
            '"name" (string), "difficulty" (integer 1-5), "tags" (string array). '
            "Only return the JSON array, no other text."
        )
        kp_raw = await self.llm.chat(
            messages=[
                {"role": "system", "content": extraction_prompt},
                {"role": "user", "content": content[:8000]},  # truncate for token safety
            ],
            json_mode=True,
        )
        try:
            kp_list: list[dict] = json.loads(kp_raw)
            # Handle LLM wrapping the array in an object like {"knowledge_points": [...]}
            if isinstance(kp_list, dict):
                kp_list = next(iter(kp_list.values()))  # type: ignore[assignment]
        except (json.JSONDecodeError, StopIteration):
            logger.warning("Failed to parse KP extraction result: %s", kp_raw[:200])
            kp_list = []

        # 6. Create knowledge point nodes in Neo4j
        async with self.neo4j.session() as session:
            for kp in kp_list:
                kp_id = uuid.uuid4().hex
                await session.run(
                    """
                    CREATE (kp:KP {
                        id: $id,
                        name: $name,
                        course_id: $course_id,
                        difficulty: $difficulty,
                        tags: $tags
                    })
                    """,
                    id=kp_id,
                    name=kp.get("name", ""),
                    course_id=course_id,
                    difficulty=kp.get("difficulty", 1),
                    tags=json.dumps(kp.get("tags", [])),
                )

        return {
            "document_id": doc_id,
            "chunk_count": len(chunk_texts),
            "knowledge_points_extracted": len(kp_list),
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

    async def get_graph(
        self,
        course_id: str | None = None,
    ) -> dict[str, Any]:
        """Return knowledge graph as {nodes, edges} for visualization."""
        if course_id:
            query = (
                "MATCH (n:KP {course_id: $cid}) "
                "OPTIONAL MATCH (n)-[r]->(m) "
                "RETURN n, r, m"
            )
            params: dict = {"cid": course_id}
        else:
            query = "MATCH (n:KP) OPTIONAL MATCH (n)-[r]->(m) RETURN n, r, m"
            params = {}

        nodes_map: dict[str, dict] = {}
        edges: list[dict] = []

        async with self.neo4j.session() as session:
            result = await session.run(query, **params)
            records = await result.data()

            for record in records:
                n = record.get("n")
                r = record.get("r")
                m = record.get("m")

                if n and isinstance(n, dict):
                    nid = n.get("id", "")
                    if nid and nid not in nodes_map:
                        nodes_map[nid] = {
                            "id": nid,
                            "name": n.get("name", ""),
                            "course_id": n.get("course_id", ""),
                            "difficulty": n.get("difficulty", 1),
                            "group": n.get("course_id", "default"),
                        }

                if m and isinstance(m, dict):
                    mid = m.get("id", "")
                    if mid and mid not in nodes_map:
                        nodes_map[mid] = {
                            "id": mid,
                            "name": m.get("name", ""),
                            "course_id": m.get("course_id", ""),
                            "difficulty": m.get("difficulty", 1),
                            "group": m.get("course_id", "default"),
                        }

                if r is not None and n and m:
                    # r is returned as a list [start_id, type, props, end_id] or dict
                    edge_type = "RELATED"
                    if isinstance(r, tuple) and len(r) >= 2:
                        edge_type = str(r[1])
                    elif isinstance(r, dict) and "type" in r:
                        edge_type = r["type"]
                    edges.append(
                        {
                            "source": n.get("id", ""),
                            "target": m.get("id", ""),
                            "type": edge_type,
                        }
                    )

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
