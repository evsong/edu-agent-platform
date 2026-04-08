"""FastAPI application entry point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.database import Base, engine
from app.api.auth import router as auth_router
from app.api.chat import router as chat_router
from app.api.grading import router as grading_router
from app.api.knowledge import router as knowledge_router
from app.api.analytics import router as analytics_router
from app.api.practice import router as practice_router
from app.api.platform import router as platform_router
from app.api.agents import router as agents_router
from app.api.courses import router as courses_router
from app.api.assignments import router as assignments_router

# Import agent modules to trigger @AgentRegistry.register() decorators
import app.agents.qa_agent  # noqa: F401
import app.agents.grader_agent  # noqa: F401
import app.agents.tutor_agent  # noqa: F401
import app.agents.analyst_agent  # noqa: F401
import app.agents.meta_agent  # noqa: F401


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create all tables on startup, dispose engine on shutdown."""
    # Import all models so Base.metadata is populated
    import app.models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


app = FastAPI(
    title="EduAgent API",
    description="AI-powered education platform backend",
    version="0.1.0",
    lifespan=lifespan,
)


# ── Rate-limiting middleware (Redis-backed) ──────────────────────
class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        if request.url.path.startswith("/api/"):
            client_ip = request.client.host if request.client else "unknown"
            from app.services.cache import rate_limit_check
            try:
                allowed = await rate_limit_check(
                    f"rate:{client_ip}", max_requests=100, window=60
                )
                if not allowed:
                    return JSONResponse(
                        {"detail": "Rate limit exceeded"}, status_code=429
                    )
            except Exception:
                pass  # Redis down → allow request
        return await call_next(request)


app.add_middleware(RateLimitMiddleware)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth_router)
app.include_router(chat_router)
app.include_router(grading_router)
app.include_router(knowledge_router)
app.include_router(analytics_router)
app.include_router(practice_router)
app.include_router(platform_router)
app.include_router(agents_router)
app.include_router(courses_router)
app.include_router(assignments_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
