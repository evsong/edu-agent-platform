"""Shared OpenAI-compatible LLM client for chat, streaming, and embeddings."""

from __future__ import annotations

import logging
from collections.abc import AsyncGenerator

import openai

from app.config import settings

logger = logging.getLogger(__name__)

# Default embedding model and dimension
_EMBED_MODEL = "text-embedding-3-large"
_EMBED_DIM = 3072


class LLMClient:
    """Thin async wrapper around an OpenAI-compatible API (CLIProxyAPI)."""

    def __init__(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
        default_model: str | None = None,
    ) -> None:
        self._client = openai.AsyncOpenAI(
            base_url=base_url or settings.LLM_BASE_URL,
            api_key=api_key or settings.LLM_API_KEY,
        )
        self.default_model = default_model or settings.LLM_MODEL

    # ── Chat completion ──────────────────────────────────────────

    async def chat(
        self,
        messages: list[dict],
        *,
        json_mode: bool = False,
        model: str | None = None,
    ) -> str:
        """Single (non-streaming) chat completion. Returns the assistant text."""
        kwargs: dict = {
            "model": model or self.default_model,
            "messages": messages,
        }
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}

        resp = await self._client.chat.completions.create(**kwargs)
        return resp.choices[0].message.content or ""

    # ── Streaming ────────────────────────────────────────────────

    async def stream(
        self,
        messages: list[dict],
        *,
        model: str | None = None,
    ) -> AsyncGenerator[str, None]:
        """Yield text chunks from a streaming chat completion."""
        resp = await self._client.chat.completions.create(
            model=model or self.default_model,
            messages=messages,
            stream=True,
        )
        async for chunk in resp:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta

    # ── Embeddings ───────────────────────────────────────────────

    async def embed(
        self,
        texts: list[str],
        *,
        model: str | None = None,
    ) -> list[list[float]]:
        """Batch-embed *texts* and return a list of float vectors (3072-d)."""
        if not texts:
            return []
        resp = await self._client.embeddings.create(
            model=model or _EMBED_MODEL,
            input=texts,
        )
        # Sort by index to guarantee order matches input
        sorted_data = sorted(resp.data, key=lambda d: d.index)
        return [d.embedding for d in sorted_data]
