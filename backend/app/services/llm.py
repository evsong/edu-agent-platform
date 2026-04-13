"""Shared OpenAI-compatible LLM client for chat, streaming, and embeddings."""

from __future__ import annotations

import logging
from collections.abc import AsyncGenerator

import httpx
import openai

from app.config import settings

logger = logging.getLogger(__name__)

# Local embedding model via fastembed (384-dim, runs in-process, no external API)
_EMBED_DIM = 384
_fastembed_model = None


def _get_fastembed():
    """Lazy-load fastembed model (downloads ~50MB on first use)."""
    global _fastembed_model
    if _fastembed_model is None:
        from fastembed import TextEmbedding
        _fastembed_model = TextEmbedding(model_name="BAAI/bge-small-en-v1.5")
        logger.info("fastembed model loaded: BAAI/bge-small-en-v1.5 (%d-dim)", _EMBED_DIM)
    return _fastembed_model

# Timeout: 30s connect, 120s total for streaming responses
_HTTP_TIMEOUT = httpx.Timeout(connect=30.0, read=120.0, write=30.0, pool=30.0)


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
            timeout=_HTTP_TIMEOUT,
            max_retries=2,
        )
        self.default_model = default_model or settings.LLM_MODEL

    # ── Chat completion ──────────────────────────────────────────

    async def chat(
        self,
        messages: list[dict],
        *,
        json_mode: bool = False,
        model: str | None = None,
        temperature: float | None = None,
    ) -> str:
        """Chat completion — returns the assistant text.

        IMPORTANT: CLIProxyAPI + GPT-5.4 return `content=null` in non-streaming
        mode (reasoning model quirk where output is only emitted as deltas).
        We therefore use streaming under the hood and accumulate the delta
        chunks, so callers get the full response as a single string.
        """
        kwargs: dict = {
            "model": model or self.default_model,
            "messages": messages,
            "stream": True,
        }
        if temperature is not None:
            kwargs["temperature"] = temperature
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}

        collected: list[str] = []
        try:
            resp = await self._client.chat.completions.create(**kwargs)
            async for chunk in resp:
                if not chunk.choices:
                    continue
                delta = chunk.choices[0].delta.content
                if delta:
                    collected.append(delta)
            return "".join(collected)
        except openai.APIConnectionError as e:
            logger.error("LLM connection failed: %s", e)
            raise RuntimeError(f"无法连接到 LLM 服务: {e}") from e
        except openai.APITimeoutError as e:
            logger.error("LLM request timed out: %s", e)
            raise RuntimeError("LLM 请求超时，请稍后重试") from e
        except openai.APIStatusError as e:
            logger.error("LLM API error %d: %s", e.status_code, e.message)
            raise RuntimeError(f"LLM 服务错误 ({e.status_code}): {e.message}") from e

    # ── Chat with image (vision) ──────────────────────────────────

    async def chat_with_image(
        self,
        messages: list[dict],
        image_b64: str,
        *,
        model: str | None = None,
    ) -> str:
        """Chat completion with an image input (vision capability).

        The last user message is transformed into a multi-part content array
        containing both text and an inline base64 image.
        """
        msgs = [m.copy() for m in messages]
        if msgs and msgs[-1]["role"] == "user":
            msgs[-1] = {
                "role": "user",
                "content": [
                    {"type": "text", "text": msgs[-1]["content"]},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/png;base64,{image_b64}",
                        },
                    },
                ],
            }

        try:
            resp = await self._client.chat.completions.create(
                model=model or self.default_model,
                messages=msgs,
            )
            return resp.choices[0].message.content or ""
        except openai.APIConnectionError as e:
            logger.error("LLM vision connection failed: %s", e)
            raise RuntimeError(f"无法连接到 LLM 服务: {e}") from e
        except openai.APITimeoutError as e:
            logger.error("LLM vision request timed out: %s", e)
            raise RuntimeError("LLM 视觉请求超时，请稍后重试") from e
        except openai.APIStatusError as e:
            logger.error("LLM vision API error %d: %s", e.status_code, e.message)
            raise RuntimeError(f"LLM 服务错误 ({e.status_code}): {e.message}") from e

    # ── Streaming ────────────────────────────────────────────────

    async def stream(
        self,
        messages: list[dict],
        *,
        model: str | None = None,
        temperature: float | None = None,
    ) -> AsyncGenerator[str, None]:
        """Yield text chunks from a streaming chat completion."""
        try:
            kwargs: dict = {
                "model": model or self.default_model,
                "messages": messages,
                "stream": True,
            }
            if temperature is not None:
                kwargs["temperature"] = temperature
            resp = await self._client.chat.completions.create(**kwargs)
            async for chunk in resp:
                delta = chunk.choices[0].delta.content
                if delta:
                    yield delta
        except openai.APIConnectionError as e:
            logger.error("LLM stream connection failed: %s", e)
            raise RuntimeError(f"无法连接到 LLM 服务: {e}") from e
        except openai.APITimeoutError as e:
            logger.error("LLM stream timed out: %s", e)
            raise RuntimeError("LLM 流式请求超时") from e
        except openai.APIStatusError as e:
            logger.error("LLM stream API error %d: %s", e.status_code, e.message)
            raise RuntimeError(f"LLM 服务错误 ({e.status_code}): {e.message}") from e

    # ── Embeddings ───────────────────────────────────────────────

    async def embed(
        self,
        texts: list[str],
        *,
        model: str | None = None,
    ) -> list[list[float]]:
        """Batch-embed *texts* using local fastembed (384-d BGE model).

        Runs the blocking fastembed call in a thread pool to avoid
        freezing the async event loop for large batches.
        """
        if not texts:
            return []
        import asyncio

        def _blocking_embed() -> list[list[float]]:
            fe = _get_fastembed()
            embeddings = list(fe.embed(texts))
            return [e.tolist() for e in embeddings]

        try:
            return await asyncio.to_thread(_blocking_embed)
        except Exception as e:
            logger.error("Embedding request failed: %s", e)
            raise RuntimeError(f"向量嵌入请求失败: {e}") from e
