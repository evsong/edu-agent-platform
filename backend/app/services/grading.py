"""Grading service — 4-stage position-level annotation pipeline."""

from __future__ import annotations

import json
import logging
import uuid
from difflib import SequenceMatcher

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.assignment import Assignment, Submission
from app.services.grading_prompts import build_grading_prompt, _detect_content_type
from app.services.llm import LLMClient

logger = logging.getLogger(__name__)


class GradingService:
    """Four-stage grading pipeline:

    1. preprocess_document  — split into numbered paragraphs
    2. LLM grading          — prompt + JSON-mode call
    3. validate_annotations — fuzzy position verification
    4. persist              — save results to DB
    """

    def __init__(self, llm: LLMClient) -> None:
        self.llm = llm

    # ── Stage 1: Preprocessing ──────────────────────────────────────

    # Patterns that start a new logical code block
    _CODE_BLOCK_STARTERS = ("def ", "class ", "async def ", "function ", "#include")

    @staticmethod
    def preprocess_document(content: str) -> tuple[list[dict], str]:
        """Split *content* into numbered paragraphs and detect content type.

        For **code** content the split happens at logical block boundaries
        (functions, classes) rather than every newline, keeping related lines
        together so the LLM can reason about whole functions.

        Returns
        -------
        tuple[list[dict], str]
            A 2-tuple of:
            - paragraphs: list of ``{"id": "P1", "text": "...", "char_offset": <int>}``
            - content_type: one of ``"text"``, ``"code"``, ``"mixed"``
        """
        content_type = _detect_content_type(content)

        if content_type == "code":
            return GradingService._split_code_blocks(content), content_type

        # For text and mixed: original line-by-line splitting
        paragraphs: list[dict] = []
        idx = 1
        offset = 0
        for line in content.split("\n"):
            if line.strip():
                paragraphs.append(
                    {"id": f"P{idx}", "text": line.strip(), "char_offset": offset}
                )
                idx += 1
            offset += len(line) + 1  # +1 for the newline character
        return paragraphs, content_type

    @staticmethod
    def _split_code_blocks(content: str) -> list[dict]:
        """Split code content by logical blocks (functions/classes).

        Lines before the first block starter are grouped together, and each
        function/class definition starts a new paragraph.
        """
        lines = content.split("\n")
        blocks: list[dict] = []
        current_lines: list[str] = []
        current_offset = 0
        block_start_offset = 0
        idx = 1

        for line in lines:
            stripped = line.strip()
            # Check if this line starts a new logical block
            is_block_start = any(
                stripped.startswith(s)
                for s in GradingService._CODE_BLOCK_STARTERS
            )

            if is_block_start and current_lines:
                # Flush the accumulated lines as a paragraph
                text = "\n".join(current_lines)
                if text.strip():
                    blocks.append(
                        {"id": f"P{idx}", "text": text.strip(), "char_offset": block_start_offset}
                    )
                    idx += 1
                current_lines = []
                block_start_offset = current_offset

            current_lines.append(line)
            current_offset += len(line) + 1

        # Flush the last block
        if current_lines:
            text = "\n".join(current_lines)
            if text.strip():
                blocks.append(
                    {"id": f"P{idx}", "text": text.strip(), "char_offset": block_start_offset}
                )

        return blocks

    # ── Stage 2: LLM Grading ───────────────────────────────────────

    async def grade_submission(
        self,
        submission_id: str,
        content: str,
        course_id: str,
        db: AsyncSession,
        rules: dict | None = None,
    ) -> dict:
        """Run the full 4-stage pipeline and persist results.

        Parameters
        ----------
        submission_id : str
            UUID of the submission record.
        content : str
            The raw student submission text.
        course_id : str
            Used to look up course-specific grading rules if *rules* is None.
        db : AsyncSession
            Database session for persistence.
        rules : dict, optional
            Override grading rules. If None, fetched from the assignment.

        Returns
        -------
        dict
            Complete grading result with annotations, score, and summary.
        """
        # Stage 1 — preprocess
        paragraphs, content_type = self.preprocess_document(content)
        if not paragraphs:
            return {
                "annotations": [],
                "overall_score": 0,
                "summary": "提交内容为空，无法批改。",
                "strengths": [],
                "improvements": [],
            }

        # Fetch rules from DB if not provided. If the course has a per-course
        # grader Agent, its grading_rules text takes precedence over the
        # assignment-level rules.
        from app.api.agents import get_active_agent

        agent_cfg = await get_active_agent(db, course_id, "grader")
        if agent_cfg and agent_cfg.status == "stopped":
            return {
                "annotations": [],
                "overall_score": 0,
                "summary": "该课程的批改 Agent 已停用，请教师启用后重试。",
                "strengths": [],
                "improvements": [],
            }
        if agent_cfg and agent_cfg.grading_rules:
            rules = {"text": agent_cfg.grading_rules}
        elif rules is None:
            rules = await self.get_grading_rules(course_id, db)

        # Stage 2 — LLM call (per-course model + temperature if configured)
        messages = build_grading_prompt(paragraphs, rules, content_type=content_type)
        raw_response = await self.llm.chat(
            messages,
            json_mode=True,
            model=agent_cfg.model if agent_cfg else None,
            temperature=agent_cfg.temperature if agent_cfg else None,
        )

        try:
            result = json.loads(raw_response)
        except json.JSONDecodeError:
            logger.error("LLM returned invalid JSON for submission %s", submission_id)
            result = {
                "annotations": [],
                "overall_score": 0,
                "summary": "批改失败：无法解析LLM返回结果。",
                "strengths": [],
                "improvements": [],
            }

        # Stage 3 — validate annotations
        annotations = result.get("annotations", [])
        validated = self.validate_annotations(annotations, paragraphs)
        result["annotations"] = validated

        # Stage 4 — persist to DB
        await self._save_result(submission_id, result, db)

        return result

    # ── Stage 3: Validation ─────────────────────────────────────────

    @staticmethod
    def validate_annotations(
        annotations: list[dict],
        paragraphs: list[dict],
    ) -> list[dict]:
        """Validate and fix annotation positions against actual paragraph text.

        For each annotation:
        - Check paragraph_id exists.
        - Check char_start / char_end within bounds.
        - Check original_text matches text[char_start:char_end]; on mismatch,
          attempt fuzzy find and correct positions.
        - Set ``confidence`` to ``"high"`` or ``"low"`` accordingly.
        """
        para_map: dict[str, dict] = {p["id"]: p for p in paragraphs}
        validated: list[dict] = []

        for ann in annotations:
            confidence = "high"
            pid = ann.get("paragraph_id", "")
            para = para_map.get(pid)

            # Check 1: paragraph exists
            if para is None:
                ann["confidence"] = "low"
                validated.append(ann)
                continue

            text = para["text"]
            char_start = ann.get("char_start", 0)
            char_end = ann.get("char_end", 0)
            original = ann.get("original_text", "")

            # Check 2: bounds
            if char_start < 0 or char_end > len(text) or char_start >= char_end:
                confidence = "low"

            # Check 3: original_text echo-back
            if confidence == "high" and text[char_start:char_end] != original:
                confidence = "low"

            # Attempt fuzzy recovery when confidence is low
            if confidence == "low" and original and para is not None:
                best_ratio = 0.0
                best_start = 0
                best_end = 0
                search_len = len(original)
                # Sliding window fuzzy match
                for i in range(max(1, len(text) - search_len + 1)):
                    candidate = text[i : i + search_len]
                    ratio = SequenceMatcher(None, original, candidate).ratio()
                    if ratio > best_ratio:
                        best_ratio = ratio
                        best_start = i
                        best_end = i + search_len

                if best_ratio >= 0.6:
                    ann["char_start"] = best_start
                    ann["char_end"] = best_end
                    ann["original_text"] = text[best_start:best_end]
                    confidence = "high" if best_ratio >= 0.85 else "low"

            ann["confidence"] = confidence
            validated.append(ann)

        return validated

    # ── DB helpers ──────────────────────────────────────────────────

    @staticmethod
    async def get_grading_rules(course_id: str, db: AsyncSession) -> dict | None:
        """Query the first assignment's grading_rules JSONB for a course."""
        try:
            course_uuid = uuid.UUID(course_id)
        except ValueError:
            return None

        stmt = (
            select(Assignment.grading_rules)
            .where(Assignment.course_id == course_uuid)
            .limit(1)
        )
        result = await db.execute(stmt)
        row = result.scalar_one_or_none()
        return row if isinstance(row, dict) else None

    @staticmethod
    async def save_grading_rules(
        course_id: str, rules: dict, db: AsyncSession
    ) -> None:
        """Update grading_rules on all assignments for a course."""
        try:
            course_uuid = uuid.UUID(course_id)
        except ValueError:
            return

        stmt = (
            update(Assignment)
            .where(Assignment.course_id == course_uuid)
            .values(grading_rules=rules)
        )
        await db.execute(stmt)

    @staticmethod
    async def _save_result(
        submission_id: str, result: dict, db: AsyncSession
    ) -> None:
        """Persist grading result to the submission record."""
        try:
            sub_uuid = uuid.UUID(submission_id)
        except ValueError:
            logger.error("Invalid submission UUID: %s", submission_id)
            return

        stmt = (
            update(Submission)
            .where(Submission.id == sub_uuid)
            .values(
                annotations=result,
                score=result.get("overall_score"),
                status="graded",
            )
        )
        await db.execute(stmt)
