# EduAgent

AI-powered educational agent platform for personalized learning, integrated with LMS via LTI.

## Quick Start

```bash
# 1. Copy environment file and fill in secrets
cp .env.example .env

# 2. Start all services
docker compose up -d

# 3. Open in browser
open http://localhost
```

## Architecture

| Service        | Port  | Description                          |
|----------------|-------|--------------------------------------|
| nginx          | 80    | Reverse proxy                        |
| frontend       | 3001  | Next.js student/teacher UI           |
| backend        | 8000  | FastAPI core API + AI agents         |
| lti-provider   | 3000  | LTI 1.3 integration (ltijs)         |
| postgres       | 5432  | Relational data                      |
| neo4j          | 7474  | Knowledge graph                      |
| redis          | 6379  | Cache + pub/sub                      |
| mongo          | 27017 | LTI session store                    |
| milvus (host)  | 19530 | Vector embeddings (external)         |

## Project Structure

```
├── backend/          # Python FastAPI
├── frontend/         # Next.js + CopilotKit
├── lti-provider/     # LTI 1.3 via ltijs
├── extension/        # Browser extension
├── data/             # Seed data, course materials
├── docs/             # Design specs, plans
├── docker-compose.yml
├── nginx.conf
└── .env.example
```
