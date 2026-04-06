# EduAgent Platform Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete, deployable cross-curriculum AI Agent educational platform for the A25 competition (deadline: 2026-04-15).

**Architecture:** LangGraph Director Graph orchestrates 5 specialized agents (QA/Grader/Tutor/Analyst/Meta) over FastAPI. Next.js frontend with CopilotKit embedding. PostgreSQL + Neo4j + Milvus + Redis data layer. LTI 1.3 (ltijs) + DingTalk SDK for platform integration.

**Tech Stack:** Python 3.12 / FastAPI / LangGraph / LangChain / Next.js 14 / TailwindCSS / shadcn/ui / CopilotKit / PostgreSQL 16 / Neo4j 5 / Milvus / Redis 7 / Docker Compose / GPT-5.4 via CLIProxyAPI

**Spec:** `docs/superpowers/specs/2026-04-06-eduagent-platform-design.md`

---

## Chunk 1: Foundation — Infrastructure + Backend Scaffold

### Task 1: Project Scaffold + Docker Compose

**Files:**
- Create: `docker-compose.yml`
- Create: `nginx.conf`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `README.md`

- [ ] **Step 1: Create project root structure**

```
edu-agent-platform/
├── backend/
├── frontend/
├── lti-provider/
├── extension/
├── data/           # seed data, course materials
├── docs/
├── docker-compose.yml
├── nginx.conf
├── .env.example
└── .gitignore
```

- [ ] **Step 2: Write docker-compose.yml**

Services: postgres (16), neo4j (5), redis (7), backend (python:3.12-slim), frontend (node:20-slim), lti-provider (node:20-slim), nginx (alpine). Milvus is already running on win4060 — connect via host network. Map all ports. Define shared network `eduagent-net`. Volume mounts for persistent data.

Environment variables via `.env`:
```
POSTGRES_PASSWORD=eduagent_dev
NEO4J_AUTH=neo4j/eduagent_dev
REDIS_URL=redis://redis:6379
MILVUS_HOST=host.docker.internal
MILVUS_PORT=19530
LLM_BASE_URL=https://codex-api.inspiredjinyao.com
LLM_API_KEY=e0c944b93d0f062fbd82d9328089f2c2
LLM_MODEL=gpt-5.4
```

- [ ] **Step 3: Write nginx.conf**

Proxy rules: `/` → frontend:3001, `/api/` → backend:8000, `/lti/` → lti-provider:3000. SSE support: `proxy_buffering off; proxy_cache off; proxy_set_header Connection '';`. CORS headers for CopilotKit cross-origin embedding.

- [ ] **Step 4: Verify docker-compose up starts all infra services**

Run: `docker-compose up -d postgres neo4j redis nginx`
Verify: `docker-compose ps` shows all healthy.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "infra: project scaffold with Docker Compose"
```

---

### Task 2: Backend — FastAPI Scaffold + Database Models

**Files:**
- Create: `backend/app/main.py`
- Create: `backend/app/config.py`
- Create: `backend/app/database.py`
- Create: `backend/app/models/user.py`
- Create: `backend/app/models/course.py`
- Create: `backend/app/models/assignment.py`
- Create: `backend/app/models/knowledge_point.py`
- Create: `backend/app/models/xapi_statement.py`
- Create: `backend/app/models/student_profile.py`
- Create: `backend/app/schemas/` (Pydantic schemas for all models)
- Create: `backend/app/auth.py` (JWT auth)
- Create: `backend/app/api/__init__.py`
- Create: `backend/app/api/auth.py`
- Create: `backend/requirements.txt`
- Create: `backend/Dockerfile`
- Create: `backend/alembic.ini` + `backend/alembic/`

- [ ] **Step 1: Write requirements.txt**

```
fastapi==0.115.6
uvicorn[standard]==0.34.0
sqlalchemy[asyncio]==2.0.36
asyncpg==0.30.0
alembic==1.14.1
pydantic==2.10.4
pydantic-settings==2.7.1
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
redis==5.2.1
neo4j==5.27.0
pymilvus==2.5.4
langchain==0.3.14
langchain-openai==0.3.0
langchain-community==0.3.14
langgraph==0.2.60
openai==1.58.1
httpx==0.28.1
python-multipart==0.0.20
unstructured[all-docs]==0.16.11
```

- [ ] **Step 2: Write config.py with pydantic-settings**

Load all env vars: DATABASE_URL, REDIS_URL, NEO4J_URI, MILVUS_HOST, LLM_BASE_URL, LLM_API_KEY, LLM_MODEL, JWT_SECRET, JWT_ALGORITHM=HS256, JWT_EXPIRE_MINUTES=1440.

- [ ] **Step 3: Write database.py — async SQLAlchemy engine + session**

AsyncSession factory with `create_async_engine(settings.DATABASE_URL)`. Base declarative class. `get_db()` dependency.

- [ ] **Step 4: Write all SQLAlchemy models**

Tables: `users` (id, email, name, hashed_password, role: teacher|student, created_at), `courses` (id, name, description, teacher_id FK, created_at), `assignments` (id, course_id FK, title, content, due_date, created_at), `submissions` (id, assignment_id FK, student_id FK, content, status: submitted|grading|graded, score, annotations JSONB, created_at), `knowledge_points` (id, external_id varchar unique, name, course_id FK, difficulty int, tags JSONB, created_at), `xapi_statements` (id UUID, user_id FK, verb varchar, object_type varchar, object_id varchar, result_score float, result_success bool, context JSONB, timestamp timestamptz), `student_profiles` (id, user_id FK, course_id FK, bkt_states JSONB, overall_mastery float, risk_level varchar, last_active timestamptz), `platform_users` (id, user_id FK, platform varchar, platform_user_id varchar, metadata JSONB, unique constraint on platform+platform_user_id), `exercises` (id, course_id FK, knowledge_point_id FK, question text, options JSONB, answer varchar, difficulty int, explanation text).

- [ ] **Step 5: Write Pydantic schemas for all models**

Request/response schemas: UserCreate, UserResponse, CourseCreate, CourseResponse, AssignmentCreate, SubmissionCreate, AnnotationSchema (paragraph_id, char_start, char_end, original_text, type, severity, comment, correction, knowledge_point), GradingResult, ExerciseResponse, BKTState, StudentProfile, XAPIStatement.

- [ ] **Step 6: Write auth.py — JWT creation + verification + password hashing**

Functions: `create_access_token(data)`, `verify_token(token)`, `get_current_user(token)` dependency, `hash_password()`, `verify_password()`. Use python-jose for JWT, passlib for bcrypt.

- [ ] **Step 7: Write api/auth.py — login/register endpoints**

`POST /api/auth/register` — create user, return JWT.
`POST /api/auth/login` — verify credentials, return JWT.
`GET /api/auth/me` — return current user from JWT.

- [ ] **Step 8: Write main.py — FastAPI app with CORS + routes**

Mount routers. CORS allow all origins (for CopilotKit). Add `/health` endpoint. Lifespan: connect DB + create tables on startup.

- [ ] **Step 9: Write Dockerfile**

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 10: Run alembic init + generate initial migration**

Run: `cd backend && alembic init alembic && alembic revision --autogenerate -m "initial tables"`

- [ ] **Step 11: Verify backend starts and /health returns 200**

Run: `docker-compose up -d backend && curl http://localhost:8000/health`

- [ ] **Step 12: Commit**

```bash
git add backend/ && git commit -m "feat: FastAPI scaffold with models, auth, and migrations"
```

---

### Task 3: Frontend — Next.js Scaffold + Design System

**Files:**
- Create: `frontend/` (via `npx create-next-app@latest`)
- Create: `frontend/tailwind.config.ts` (custom Ink & Paper tokens)
- Create: `frontend/app/layout.tsx`
- Create: `frontend/app/page.tsx` (Landing page)
- Create: `frontend/app/(auth)/login/page.tsx`
- Create: `frontend/app/(auth)/register/page.tsx`
- Create: `frontend/components/ui/` (shadcn/ui init)
- Create: `frontend/lib/api.ts` (API client)
- Create: `frontend/lib/auth.ts` (JWT storage + auth context)
- Create: `frontend/Dockerfile`

- [ ] **Step 1: Create Next.js app**

```bash
cd frontend && npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir=false --import-alias="@/*"
```

- [ ] **Step 2: Install dependencies**

```bash
npm install @copilotkit/react-core @copilotkit/react-ui remixicon recharts react-force-graph-3d framer-motion zustand @tanstack/react-query cmdk
npx shadcn@latest init
npx shadcn@latest add button card input label dialog dropdown-menu tooltip badge separator avatar sheet tabs
```

- [ ] **Step 3: Configure tailwind.config.ts with Ink & Paper tokens**

Extend colors: `primary: { DEFAULT: '#4338CA', ... }`, `surface: '#FAFAFA'`, success/warning/error. Extend fontFamily: `display: ['Plus Jakarta Sans']`, `body: ['Inter']`, `mono: ['JetBrains Mono']`. Add Google Fonts to `app/layout.tsx` via `next/font/google`.

- [ ] **Step 4: Write root layout.tsx**

Import fonts (Plus Jakarta Sans, Inter, JetBrains Mono). Add global CSS variables. Body classes.

- [ ] **Step 5: Write Landing Page (app/page.tsx)**

Hero section with value proposition + dual CTAs. 4 feature cards (multi-agent / position annotation / knowledge graph / plug-and-play). Navbar with logo + nav links + login/register buttons. Use Remixicon classes (`ri-brain-line`, `ri-edit-2-line`, etc.). Responsive — mobile stacks to single column.

- [ ] **Step 6: Write auth pages (login + register)**

Login form: email + password → POST /api/auth/login → store JWT in localStorage → redirect to /teacher or /student based on role. Register form: name + email + password + role select.

- [ ] **Step 7: Write lib/api.ts — fetch wrapper with JWT**

`apiFetch(path, options)` — prepends base URL, attaches `Authorization: Bearer <jwt>` header. Handles 401 → redirect to login.

- [ ] **Step 8: Write lib/auth.ts — AuthProvider + useAuth hook**

React context: `{ user, token, login(), logout(), isLoading }`. Check localStorage on mount. Provide via context in root layout.

- [ ] **Step 9: Write Dockerfile**

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
CMD ["npm", "start"]
```

- [ ] **Step 10: Verify landing page renders at localhost:3001**

Run: `docker-compose up -d frontend && open http://localhost:3001`

- [ ] **Step 11: Commit**

```bash
git add frontend/ && git commit -m "feat: Next.js scaffold with Ink & Paper design system and auth"
```

---

## Chunk 2: Backend Services — Knowledge + Grading + Analytics

### Task 4: M2 — Knowledge Service (RAG + Neo4j)

**Files:**
- Create: `backend/app/services/knowledge.py`
- Create: `backend/app/services/llm.py` (shared LLM client)
- Create: `backend/app/api/knowledge.py`
- Create: `backend/tests/test_knowledge.py`

- [ ] **Step 1: Write llm.py — shared OpenAI-compatible LLM client**

Class `LLMClient` wrapping `openai.AsyncOpenAI(base_url=settings.LLM_BASE_URL, api_key=settings.LLM_API_KEY)`. Methods: `chat(messages, json_mode=False)`, `stream(messages)` yielding chunks, `embed(texts)` using text-embedding-3-large.

- [ ] **Step 2: Write knowledge.py — KnowledgeService**

Class with methods:
- `upload_document(course_id, file)` — Unstructured parse → RecursiveCharacterTextSplitter (chunk_size=1000, overlap=200) → LLMClient.embed() → Milvus insert (collection per course). Also extract knowledge points via LLM → Neo4j nodes.
- `search(query, course_id, top_k=3)` — Milvus similarity search Top-10 → LLM rerank → Top-3. Then Neo4j query for related cross-course knowledge points. Return combined context.
- `get_graph(course_id)` — Neo4j Cypher: `MATCH (n:KP {course_id: $cid})-[r]->(m) RETURN n, r, m`. Return nodes + edges JSON for frontend visualization.
- `get_cross_course(point_id)` — `MATCH (n:KP {id: $pid})-[:CROSS_COURSE]->(m) RETURN m`.

Neo4j connection: `neo4j.AsyncGraphDatabase.driver(settings.NEO4J_URI)`.
Milvus connection: `pymilvus.MilvusClient(uri=f"http://{settings.MILVUS_HOST}:{settings.MILVUS_PORT}")`.

- [ ] **Step 3: Write api/knowledge.py — REST endpoints**

`POST /api/knowledge/upload` — file upload, returns document_id.
`GET /api/knowledge/search?q=...&course_id=...` — RAG search.
`GET /api/knowledge/graph/{course_id}` — graph visualization data.
`GET /api/knowledge/points/{point_id}` — point detail + relations.
`GET /api/knowledge/cross-course/{point_id}` — cross-course links.

- [ ] **Step 4: Write tests — RAG search with mock data**

Test: upload a small text document → search for a known phrase → verify relevant chunks returned. Test: Neo4j graph query returns nodes and edges.

- [ ] **Step 5: Verify endpoints with curl**

Upload a sample math document, search for "定积分", verify RAG results.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/knowledge.py backend/app/services/llm.py backend/app/api/knowledge.py backend/tests/
git commit -m "feat(M2): knowledge service with RAG + Neo4j graph"
```

---

### Task 5: M5 — Grading Service (Position-Level Annotations)

**Files:**
- Create: `backend/app/services/grading.py`
- Create: `backend/app/api/grading.py`
- Create: `backend/app/services/grading_prompts.py` (prompt templates + few-shot)
- Create: `backend/tests/test_grading.py`

- [ ] **Step 1: Write grading_prompts.py — system prompt + few-shot examples**

`GRADING_SYSTEM_PROMPT`: "你是资深数学教师。对学生作业进行逐行批注，输出 JSON 格式..."
`GRADING_FEW_SHOT`: 5 examples of input/output with position-level annotations. Each example shows paragraph_id, char_start/end, original_text, type, severity, comment, correction, knowledge_point.
`build_grading_prompt(paragraphs, rules)` — Assembles system + few-shot + user paragraphs.

- [ ] **Step 2: Write grading.py — GradingService**

Methods:
- `preprocess_document(content: str) -> list[Paragraph]` — Split by newlines/paragraphs, assign [P1] [P2] ... IDs. Return list of `{id, text, char_offset}`.
- `grade_submission(submission_id, content, course_id, rules=None) -> GradingResult` — Preprocess → build prompt → LLMClient.chat(json_mode=True) → parse JSON → validate_annotations → save to DB.
- `validate_annotations(annotations, paragraphs) -> list[Annotation]` — For each annotation: check paragraph_id exists, char_start/end in range, original_text matches substring at position. Mark `confidence: "low"` if any check fails.
- `get_grading_rules(course_id)` → Fetch from DB.
- `save_grading_rules(course_id, rules)` → Persist to DB.

- [ ] **Step 3: Write api/grading.py — REST endpoints**

`POST /api/grading/submit` — accepts submission_id, starts async grading, returns task_id.
`GET /api/grading/result/{task_id}` — poll for grading result.
`GET /api/grading/annotations/{submission_id}` — get annotations for a submission.
`POST /api/grading/rules` — teacher sets grading rules.
`GET /api/grading/rules/{course_id}` — get current rules.

- [ ] **Step 4: Write tests — annotation validation + position accuracy**

Test: Given known input text and LLM output, validate that annotations map correctly to text positions. Test: Invalid annotations (out-of-range) get flagged as low confidence.

- [ ] **Step 5: End-to-end test with real LLM**

Submit a math homework sample → verify JSON annotations returned with correct positions.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/grading*.py backend/app/api/grading.py backend/tests/
git commit -m "feat(M5): position-level annotation engine with 4-stage pipeline"
```

---

### Task 6: M5 — Analytics Service (BKT + Practice Generation)

**Files:**
- Create: `backend/app/services/analytics.py`
- Create: `backend/app/services/bkt.py`
- Create: `backend/app/api/analytics.py`
- Create: `backend/app/api/practice.py`
- Create: `backend/tests/test_bkt.py`

- [ ] **Step 1: Write bkt.py — BKT algorithm (port from OATutor)**

```python
def bkt_update(params: dict, is_correct: bool) -> None:
    if is_correct:
        num = params['probMastery'] * (1 - params['probSlip'])
        den = (1 - params['probMastery']) * params['probGuess']
    else:
        num = params['probMastery'] * params['probSlip']
        den = (1 - params['probMastery']) * (1 - params['probGuess'])
    posterior = num / (num + den)
    params['probMastery'] = posterior + (1 - posterior) * params['probTransit']

def select_problem(problems, bkt_states, completed_ids, threshold=0.95):
    candidates = []
    for p in problems:
        if p.id in completed_ids:
            continue
        mastery = 1.0
        for kp_id in p.knowledge_point_ids:
            if kp_id in bkt_states:
                mastery *= bkt_states[kp_id]['probMastery']
        if mastery >= threshold:
            continue
        candidates.append((p, mastery))
    if not candidates:
        return None
    candidates.sort(key=lambda x: x[1])
    return candidates[0][0]

DEFAULT_BKT_PARAMS = {
    'probMastery': 0.3,
    'probSlip': 0.1,
    'probGuess': 0.25,
    'probTransit': 0.1
}
```

- [ ] **Step 2: Write tests for BKT**

Test: correct answer increases probMastery. Test: wrong answer decreases. Test: select_problem picks lowest mastery. Test: mastered problems (≥0.95) are skipped.

- [ ] **Step 3: Write analytics.py — AnalyticsService**

Methods:
- `record_xapi(user_id, verb, object_type, object_id, result_score, result_success, context)` — Insert xAPI statement to PostgreSQL.
- `get_profile(user_id, course_id)` — Return student_profiles with bkt_states, overall_mastery.
- `update_bkt(user_id, course_id, knowledge_point_id, is_correct)` — Load bkt_states from student_profiles → bkt_update() → save back.
- `get_warnings(course_id, threshold=0.3)` — Query student_profiles where any bkt_state probMastery < threshold.
- `generate_report(course_id)` — Aggregate xapi_statements GROUP BY knowledge_point → find top-5 error points → LLM generate teaching suggestions.

- [ ] **Step 4: Write api/analytics.py + api/practice.py — REST endpoints**

Analytics: `GET /api/analytics/profile/{user_id}`, `GET /api/analytics/warnings/{course_id}`, `GET /api/analytics/report/{course_id}`.
Practice: `POST /api/practice/generate` (BKT select + optional LLM generation), `POST /api/practice/answer` (check + BKT update), `GET /api/practice/history/{user_id}`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/bkt.py backend/app/services/analytics.py backend/app/api/analytics.py backend/app/api/practice.py backend/tests/
git commit -m "feat(M5): BKT knowledge tracing + analytics + practice generation"
```

---

### Task 7: M3 — Platform Service (LTI + DingTalk)

**Files:**
- Create: `backend/app/services/platform.py`
- Create: `backend/app/api/platform.py`
- Create: `lti-provider/index.js`
- Create: `lti-provider/package.json`
- Create: `lti-provider/Dockerfile`

- [ ] **Step 1: Write lti-provider/package.json + index.js**

ltijs setup: `lti.setup(LTIKEY, { url: mongoUrl }, { appRoute: '/', loginRoute: '/login', keysetRoute: '/keys' })`. On connect: extract user identity + course → POST to `http://backend:8000/api/platform/lti-launch` → redirect to frontend with JWT.

Register platform for 超星 with LTI 1.3 endpoints. Grade passback: expose `/lti/grade` that calls `lti.Grade.submitScore()`.

- [ ] **Step 2: Write backend platform.py — PlatformService**

Methods:
- `handle_lti_launch(lti_data)` — Upsert platform_users mapping → create/find user → generate JWT → return redirect URL.
- `submit_lti_grade(user_id, course_id, score)` — Call ltijs grade endpoint.
- `handle_dingtalk_webhook(message)` — Parse DingTalk robot message → forward to Agent orchestration → return response.
- `send_dingtalk_notification(user_id, content)` — Call DingTalk API to send work notification.
- `resolve_user(platform, platform_user_id)` — Lookup platform_users table.

- [ ] **Step 3: Write api/platform.py — REST endpoints**

`POST /api/platform/lti-launch` — handle LTI launch data from ltijs.
`POST /api/platform/lti-grade` — proxy grade submission to ltijs.
`POST /api/platform/dingtalk/webhook` — DingTalk robot callback.
`POST /api/platform/dingtalk/notify` — send DingTalk notification.

- [ ] **Step 4: Write lti-provider Dockerfile**

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
CMD ["node", "index.js"]
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/platform.py backend/app/api/platform.py lti-provider/
git commit -m "feat(M3): LTI 1.3 provider + DingTalk SDK integration"
```

---

## Chunk 3: Agent Framework — LangGraph Director Graph

### Task 8: M1 — Agent SDK + Director Graph

**Files:**
- Create: `backend/app/agents/__init__.py`
- Create: `backend/app/agents/base.py` (BaseAgent + AgentContext + AgentRegistry)
- Create: `backend/app/agents/director.py` (Director node + routing logic)
- Create: `backend/app/agents/qa_agent.py`
- Create: `backend/app/agents/grader_agent.py`
- Create: `backend/app/agents/tutor_agent.py`
- Create: `backend/app/agents/analyst_agent.py`
- Create: `backend/app/agents/meta_agent.py`
- Create: `backend/app/orchestration/graph.py` (LangGraph StateGraph)
- Create: `backend/app/orchestration/state.py` (DirectorState TypedDict)
- Create: `backend/app/orchestration/events.py` (SSE event types)
- Create: `backend/app/api/chat.py` (SSE streaming endpoint)
- Create: `backend/tests/test_director.py`

- [ ] **Step 1: Write state.py — DirectorState TypedDict**

```python
class DirectorState(TypedDict):
    messages: Annotated[list, add_messages]
    user_id: str
    course_id: str
    current_agent_id: Optional[str]
    turn_count: int
    max_turns: int
    should_end: bool
    agent_responses: Annotated[list, operator.add]
```

- [ ] **Step 2: Write events.py — SSE event dataclasses**

Events: `AgentStart(agent_id, agent_name)`, `TextDelta(content)`, `AgentEnd(agent_id)`, `Thinking(stage)`, `Done(total_agents)`, `Error(message)`. Serialization to SSE format: `data: {json}\n\n`.

- [ ] **Step 3: Write base.py — BaseAgent + AgentRegistry + AgentContext**

```python
class AgentContext:
    user_id: str
    course_id: str
    knowledge: KnowledgeService
    grading: GradingService
    analytics: AnalyticsService
    platform: PlatformService
    llm: LLMClient
    session: dict

class BaseAgent(ABC):
    agent_id: str
    name: str
    description: str
    
    @abstractmethod
    async def handle(self, message: str, ctx: AgentContext) -> AsyncGenerator[SSEEvent, None]: ...

class AgentRegistry:
    _agents: dict[str, BaseAgent]
    def register(self, agent_id): ...  # decorator
    def get(self, agent_id): ...
    def all(self): ...
    def descriptions_for_director(self): ...  # formatted string for director prompt
```

- [ ] **Step 4: Write director.py — Director node with LLM routing**

Director prompt: list available agents with descriptions → "Based on the user message, which agent should handle this? Reply with the agent_id or END." Parse response → set `current_agent_id` in state.

Single-agent fast path: if only one registered agent, skip LLM call.
Turn limit check: if turn_count >= max_turns, set should_end.

- [ ] **Step 5: Write 5 agent implementations**

Each agent: inherit BaseAgent, implement handle() method.
- `QAAgent`: call knowledge.search() → build prompt with RAG context → stream LLM response.
- `GraderAgent`: call grading.grade_submission() → yield structured result.
- `TutorAgent`: call analytics BKT select_problem → generate exercise → yield.
- `AnalystAgent`: call analytics get_profile → generate report → yield.
- `MetaAgent`: handle course/agent configuration commands → yield confirmation.

- [ ] **Step 6: Write graph.py — LangGraph StateGraph assembly**

```python
graph = StateGraph(DirectorState)
graph.add_node("director", director_node)
graph.add_node("agent_generate", agent_generate_node)
graph.add_edge(START, "director")
graph.add_conditional_edges("director", should_continue, {
    "agent": "agent_generate",
    "end": END
})
graph.add_edge("agent_generate", "director")
app = graph.compile()
```

- [ ] **Step 7: Write api/chat.py — SSE streaming endpoint**

`POST /api/chat` — accepts `{message, course_id}`. Creates `StreamingResponse` with `text/event-stream`. Invokes LangGraph app, streams events via SSE. Heartbeat every 15s.

- [ ] **Step 8: Test director routing**

Test: "什么是定积分" routes to QA Agent. Test: "批改作业" routes to Grader Agent. Test: "给我出题" routes to Tutor Agent.

- [ ] **Step 9: Commit**

```bash
git add backend/app/agents/ backend/app/orchestration/ backend/app/api/chat.py backend/tests/
git commit -m "feat(M1): LangGraph Director Graph with 5 agents + SSE streaming"
```

---

## Chunk 4: Frontend — Teacher + Student + Embed Pages

### Task 9: Teacher Dashboard Pages

**Files:**
- Create: `frontend/app/(teacher)/layout.tsx` (sidebar nav)
- Create: `frontend/app/(teacher)/dashboard/page.tsx`
- Create: `frontend/app/(teacher)/courses/page.tsx`
- Create: `frontend/app/(teacher)/courses/[id]/page.tsx`
- Create: `frontend/app/(teacher)/courses/[id]/knowledge/page.tsx`
- Create: `frontend/app/(teacher)/courses/[id]/analytics/page.tsx`
- Create: `frontend/app/(teacher)/grading/page.tsx`
- Create: `frontend/app/(teacher)/grading/[id]/page.tsx` (Focus Drawer)
- Create: `frontend/app/(teacher)/agents/page.tsx`
- Create: `frontend/app/(teacher)/warnings/page.tsx`
- Create: `frontend/components/teacher/Sidebar.tsx`
- Create: `frontend/components/teacher/StatCard.tsx`
- Create: `frontend/components/teacher/KnowledgeGraph.tsx` (react-force-graph-3d)
- Create: `frontend/components/teacher/GradingDrawer.tsx`
- Create: `frontend/components/teacher/CommandPalette.tsx` (cmdk)

- [ ] **Step 1: Write teacher layout with sidebar navigation**

Left sidebar 200px: logo + nav items (dashboard, courses, agents, grading, warnings, settings). Use Remixicon. Active state: bg-primary text-white. Badge for pending counts. ⌘K shortcut hint in top-right.

- [ ] **Step 2: Write dashboard page**

4 stat cards (active students, accuracy, warnings, AI interactions). Knowledge point mastery bar chart (Recharts BarChart). Warning student list with avatar + risk level. Use `@tanstack/react-query` for data fetching.

- [ ] **Step 3: Write knowledge graph page**

Dark background container. `react-force-graph-3d` component. Fetch graph data from `/api/knowledge/graph/{course_id}`. Node color by course (indigo=math, green=physics). Edge types: solid=prerequisite, dashed=cross-course. Hover tooltips. Search filter.

- [ ] **Step 4: Write grading queue + Focus Drawer**

List of submissions with status badges. "AI 全部批改" button. Click submission → `<Sheet>` (shadcn/ui) slides from right 70% width. Inside: original text with highlighted annotations, annotation cards, score, "开始针对练习" link. Main content behind gets `scale(0.98) opacity(0.5)` via Framer Motion.

- [ ] **Step 5: Write ⌘K command palette**

Use `cmdk` library. Global keyboard listener. Items: navigate to pages + AI commands ("生成学情报告", "批改所有作业"). AI items show badge.

- [ ] **Step 6: Write remaining teacher pages**

Courses list/detail, agent config (list agents with status + settings), warnings center.

- [ ] **Step 7: Commit**

```bash
git add frontend/app/\(teacher\)/ frontend/components/teacher/
git commit -m "feat: teacher dashboard with knowledge graph, grading drawer, and ⌘K command palette"
```

---

### Task 10: Student Portal Pages

**Files:**
- Create: `frontend/app/(student)/layout.tsx`
- Create: `frontend/app/(student)/courses/page.tsx`
- Create: `frontend/app/(student)/chat/page.tsx`
- Create: `frontend/app/(student)/assignments/page.tsx`
- Create: `frontend/app/(student)/assignments/[id]/page.tsx` (annotation view)
- Create: `frontend/app/(student)/practice/page.tsx`
- Create: `frontend/app/(student)/profile/page.tsx`
- Create: `frontend/components/student/ChatInterface.tsx`
- Create: `frontend/components/student/AnnotationViewer.tsx`
- Create: `frontend/components/student/PracticeCard.tsx`
- Create: `frontend/components/student/EnergyRing.tsx` (BKT mastery SVG)
- Create: `frontend/components/student/InlineAIMorph.tsx`

- [ ] **Step 1: Write student layout with top nav**

Top navbar: logo + nav links (courses, chat, assignments, practice, profile). Use Remixicon. Responsive: mobile switches to bottom tab bar (5 tabs). CopilotKit provider wrapping all student pages: `<CopilotKit runtimeUrl="/api/copilotkit">`.

- [ ] **Step 2: Write chat page with CopilotKit**

Full-height `<CopilotChat>` component. Custom message renderer to show RAG source badges and cross-course links. Style with Ink & Paper theme.

- [ ] **Step 3: Write assignment annotation viewer**

Numbered lines with line numbers (JetBrains Mono). Error lines: red left border + highlight. Annotation cards below each error: icon + severity + comment + correction + knowledge_point badge. Framer Motion: SVG pathLength animation on annotation underlines. Score display top-right. "开始针对练习" CTA button at bottom.

- [ ] **Step 4: Write practice page with BKT Energy Rings**

Energy Ring component: SVG circle with `stroke-dasharray` based on mastery %. States: <0.3 dashed dim, 0.3-0.8 solid blue animated, ≥0.8 gold-purple gradient. Question card: question text + radio options. Submit → check → BKT update → next question. Progress bar.

- [ ] **Step 5: Write profile page with radar chart**

Recharts RadarChart with knowledge point dimensions. Mastery history line chart. Overall stats.

- [ ] **Step 6: Write InlineAIMorph component**

Listen for text selection events. On selection: show floating toolbar (Framer Motion scale-in) with "提示我" / "拆解步骤" buttons. Click → trigger CopilotKit sidebar with selected text as context.

- [ ] **Step 7: Commit**

```bash
git add frontend/app/\(student\)/ frontend/components/student/
git commit -m "feat: student portal with chat, annotation viewer, BKT practice, and inline AI"
```

---

### Task 11: Embed Pages + CopilotKit Runtime + Chrome Extension

**Files:**
- Create: `frontend/app/(embed)/layout.tsx`
- Create: `frontend/app/(embed)/popup/page.tsx`
- Create: `frontend/app/(embed)/sidebar/page.tsx`
- Create: `frontend/app/api/copilotkit/route.ts`
- Create: `extension/manifest.json`
- Create: `extension/content.js`
- Create: `extension/styles.css`

- [ ] **Step 1: Write CopilotKit Runtime API route**

`frontend/app/api/copilotkit/route.ts`: Proxy to backend `/api/chat` SSE endpoint. Or use CopilotKit's built-in runtime adapter to connect to our LangGraph backend.

- [ ] **Step 2: Write embed layout (minimal, no nav)**

Bare layout — no sidebar, no navbar. Just CopilotKit provider + children. For iframe embedding in LMS platforms.

- [ ] **Step 3: Write popup page**

`<CopilotPopup labels={{ title: "AI 助教", initial: "有什么可以帮你的？" }} />` — renders as floating button + expandable chat.

- [ ] **Step 4: Write sidebar page**

`<CopilotSidebar labels={{ title: "AI 助教" }} defaultOpen={true}>` — full sidebar chat with quick suggestion chips.

- [ ] **Step 5: Write Chrome extension**

Manifest v3: content_scripts matching `*.chaoxing.com`, `*.zhihuishu.com`. content.js: inject Shadow DOM container → create iframe pointing to `/embed/popup`. Floating button in bottom-right corner.

- [ ] **Step 6: Commit**

```bash
git add frontend/app/\(embed\)/ frontend/app/api/copilotkit/ extension/
git commit -m "feat: CopilotKit embed pages + Chrome extension for LMS injection"
```

---

## Chunk 5: Mobile Responsive + Integration + Demo Data

### Task 12: Mobile Responsive

**Files:**
- Modify: `frontend/app/(student)/layout.tsx` — add bottom tab bar for mobile
- Modify: `frontend/app/(teacher)/layout.tsx` — hamburger menu for mobile
- Create: `frontend/components/shared/MobileTabBar.tsx`
- Modify: All page components — add responsive Tailwind classes

- [ ] **Step 1: Write MobileTabBar component**

Fixed bottom bar, hidden on `md:` breakpoint. 5 tabs with Remixicon icons. Active state highlight. Student tabs: courses/chat/assignments/practice/profile. Teacher tabs: dashboard/courses/grading/analytics/profile.

- [ ] **Step 2: Make teacher sidebar collapsible on mobile**

Sheet/drawer pattern: hamburger menu button in mobile header → sheet slides from left with full sidebar. Desktop: always visible.

- [ ] **Step 3: Add responsive classes to all pages**

Grid columns: `grid-cols-1 md:grid-cols-2 lg:grid-cols-4`. Stat cards stack vertically on mobile. Knowledge graph: full width, reduced height. Annotation viewer: full width.

- [ ] **Step 4: Test on mobile viewport (375px, 768px)**

Use browser devtools to verify all pages at mobile breakpoints.

- [ ] **Step 5: Commit**

```bash
git add frontend/ && git commit -m "feat: mobile responsive with bottom tab bar"
```

---

### Task 13: Seed Data + Demo Content

**Files:**
- Create: `data/seed.py` (Python script to populate demo data)
- Create: `data/courses/高等数学/` (course materials)
- Create: `data/courses/大学物理/` (course materials)
- Create: `data/knowledge_graph.cypher` (Neo4j seed queries)
- Create: `data/exercises.json` (exercise bank)

- [ ] **Step 1: Write seed.py — create demo users + courses**

Users: 1 teacher (demo@teacher.com), 5 students (student1-5@demo.com).
Courses: 高等数学, 大学物理. Link teacher to both.
Enroll all students in both courses.

- [ ] **Step 2: Prepare course materials for RAG**

Create/collect 2-3 PDF/text files per course covering key topics (定积分, 微分, 极限 for math; 牛顿力学, 做功 for physics). These will be uploaded via knowledge API.

- [ ] **Step 3: Write Neo4j seed data**

Cypher queries to create knowledge point nodes and relationships:
- 10+ math knowledge points (极限, 微分, 定积分, 不定积分, 级数, ...)
- 5+ physics knowledge points (牛顿力学, 做功, 动能定理, ...)
- PREREQUISITE edges within each course
- CROSS_COURSE edges (定积分 → 做功, 微分 → 速度加速度, ...)

- [ ] **Step 4: Write exercise bank**

20+ exercises per course, each tagged with knowledge_point_id, difficulty, options, answer, explanation. JSON format matching exercises table schema.

- [ ] **Step 5: Write seed student profiles**

Pre-populate BKT states for demo students with varying mastery levels. Some students at risk (probMastery < 0.3 on certain topics).

- [ ] **Step 6: Run seed script and verify demo data**

```bash
python data/seed.py
```
Verify: login as teacher, see dashboard with student data. Login as student, see courses.

- [ ] **Step 7: Commit**

```bash
git add data/ && git commit -m "feat: demo seed data for math + physics courses"
```

---

### Task 14: End-to-End Integration + Docker Deploy

**Files:**
- Modify: `docker-compose.yml` — finalize all services
- Create: `scripts/deploy.sh` (deployment script for win4060)
- Modify: `backend/app/main.py` — mount all API routers

- [ ] **Step 1: Mount all API routers in main.py**

```python
app.include_router(auth_router, prefix="/api/auth")
app.include_router(knowledge_router, prefix="/api/knowledge")
app.include_router(grading_router, prefix="/api/grading")
app.include_router(analytics_router, prefix="/api/analytics")
app.include_router(practice_router, prefix="/api/practice")
app.include_router(platform_router, prefix="/api/platform")
app.include_router(chat_router, prefix="/api/chat")
```

- [ ] **Step 2: Full docker-compose build + up**

```bash
docker-compose build && docker-compose up -d
```

Verify all 8 services running. Check logs for errors.

- [ ] **Step 3: Run seed data in container**

```bash
docker-compose exec backend python -m data.seed
```

- [ ] **Step 4: End-to-end smoke test**

1. Open http://localhost → Landing page renders
2. Register teacher + student accounts
3. Teacher: upload course document → verify in knowledge graph
4. Student: ask question in chat → verify RAG response
5. Student: submit assignment → verify position-level annotations
6. Student: start practice → verify BKT-driven question selection
7. Teacher: view dashboard → verify analytics data
8. Teacher: view warnings → verify at-risk students
9. Embed: open /embed/popup → verify CopilotKit chat works

- [ ] **Step 5: Write deploy.sh for win4060**

SSH to win4060, git pull, docker-compose build, docker-compose up -d. Cloudflare tunnel config for external access.

- [ ] **Step 6: Final commit**

```bash
git add -A && git commit -m "feat: end-to-end integration + deployment script"
```

---

## Chunk 6: Competition Deliverables

### Task 15: Documentation + PPT + Video

**Files:**
- Create: `docs/项目概要.md` (300字)
- Create: `docs/技术方案.md` (详细版)
- Create: `docs/安装指南.md`

- [ ] **Step 1: Write 300-word project summary**

Cover: problem statement, solution approach (5 modules), key innovations (Director Graph, position-level annotation, BKT, cross-course), tech stack.

- [ ] **Step 2: Write detailed technical document**

Expand from design spec. Include architecture diagrams, API documentation, performance benchmarks, innovation points.

- [ ] **Step 3: Write installation guide**

Docker Compose setup steps, environment variables, seed data, verification commands.

- [ ] **Step 4: Create PPT (≤10 pages)**

1. Cover 2. Problem 3. Solution overview 4. Architecture 5. Demo screenshots 6. M1 Agent framework 7. M5 Annotation + BKT 8. M2 Knowledge graph 9. Innovation summary 10. Team

- [ ] **Step 5: Record 5-minute demo video**

Script: Landing page → Teacher uploads documents → Student asks question (RAG) → Student submits assignment (annotation) → Student practices (BKT) → Teacher views analytics → Knowledge graph → Platform embedding demo.

- [ ] **Step 6: Commit all deliverables**

```bash
git add docs/ && git commit -m "docs: competition deliverables - summary, technical doc, PPT, install guide"
```

---

## Dependency Graph

```
Task 1 (Docker/Scaffold)
  ├→ Task 2 (Backend Scaffold)  ──→ Task 4 (Knowledge) ─┐
  │                              ──→ Task 5 (Grading)  ──┤→ Task 8 (Agent Framework) → Task 14 (Integration)
  │                              ──→ Task 6 (Analytics) ─┤
  │                              ──→ Task 7 (Platform)  ──┘
  └→ Task 3 (Frontend Scaffold) ──→ Task 9 (Teacher UI) ─┐
                                 ──→ Task 10 (Student UI)──┤→ Task 12 (Mobile) → Task 14
                                 ──→ Task 11 (Embed)   ───┘
Task 13 (Seed Data) → Task 14 (Integration) → Task 15 (Deliverables)
```

**Parallelizable groups:**
- Group A (Backend Services): Tasks 4, 5, 6, 7 can run in parallel after Task 2
- Group B (Frontend Pages): Tasks 9, 10, 11 can run in parallel after Task 3
- Task 8 depends on Tasks 4-7 (needs all services)
- Task 12 depends on Tasks 9-11 (needs all pages)
- Task 14 depends on everything
