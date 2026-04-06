"""Application configuration via pydantic-settings."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ── Postgres ──────────────────────────────────────────────
    POSTGRES_USER: str = "eduagent"
    POSTGRES_PASSWORD: str = "eduagent_dev"
    POSTGRES_DB: str = "eduagent"
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432

    @property
    def DATABASE_URL(self) -> str:
        return (
            f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    # ── Redis ─────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379"

    # ── Neo4j ─────────────────────────────────────────────────
    NEO4J_URI: str = "bolt://neo4j:7687"
    NEO4J_AUTH: str = "neo4j/eduagent_dev"

    # ── Milvus ────────────────────────────────────────────────
    MILVUS_HOST: str = "localhost"
    MILVUS_PORT: int = 19530

    # ── MongoDB (LTI) ────────────────────────────────────────
    MONGODB_URL: str = "mongodb://mongo:27017/lti"

    # ── LLM ───────────────────────────────────────────────────
    LLM_BASE_URL: str = "https://codex-api.inspiredjinyao.com"
    LLM_API_KEY: str = "your_api_key_here"
    LLM_MODEL: str = "gpt-5.4"

    # ── JWT ───────────────────────────────────────────────────
    JWT_SECRET: str = "change_me_in_production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 1440  # 24 hours

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
