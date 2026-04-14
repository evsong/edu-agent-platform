# EduAgent Frontend-Backend Full Integration Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all mock/hardcoded data in 13 frontend pages with real backend API calls, adding ~8 missing backend endpoints to fill gaps.

**Architecture:** Backend already has 28 endpoints covering chat, grading, practice, analytics, knowledge, platform. Frontend uses `@tanstack/react-query` with `placeholderData` pattern — keep mock data as fallback, wire `queryFn` to real API. Add missing CRUD endpoints for agents, courses, assignments, and dashboard overview.

**Tech Stack:** Python FastAPI / SQLAlchemy async / Next.js 16 / @tanstack/react-query / apiFetch wrapper (JWT auth, error handling)

**Spec:** `docs/superpowers/specs/2026-04-06-eduagent-platform-design.md`

**Key constraint:** All pages already have `placeholderData: mockXxx` — if API fails, UI still renders. Only modify `queryFn` and API paths; do NOT change UI components unless needed for data shape differences.

---

## Chunk 1: Backend — Add Missing API Endpoints

### Task 1: Agent Config Model + CRUD API

**Files:**
- Create: `backend/app/models/agent_config.py`
- Modify: `backend/app/models/__init__.py` (if exists) — add import
- Create: `backend/app/api/agents.py`
- Modify: `backend/app/main.py` — register router
- Modify: `data/seed.py` — add agent config seed data

**Context:** Frontend Agent 配置 page shows 4 agents with fields: name, course_name, status, model, temperature, knowledge_base, grading_rules, icon. Need a DB table + CRUD.

- [ ] **Step 1: Create AgentConfig model**

```python
# backend/app/models/agent_config.py
from sqlalchemy import Column, String, Float, ForeignKey
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import relationship
import uuid
from app.database import Base

class AgentConfig(Base):
    __tablename__ = "agent_configs"
    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agent_id = Column(String(50), nullable=False)  # qa, grader, tutor, analyst, meta
    name = Column(String(255), nullable=False)
    course_id = Column(PG_UUID(as_uuid=True), ForeignKey("courses.id"), nullable=False)
    status = Column(String(20), nullable=False, default="stopped")  # running/configuring/stopped
    model = Column(String(100), nullable=False, default="GPT-5.4")
    temperature = Column(Float, nullable=False, default=0.3)
    knowledge_base = Column(String(500), nullable=True)
    grading_rules = Column(String(500), nullable=True)
    icon = Column(String(100), nullable=True, default="ri-robot-2-line")
```

- [ ] **Step 2: Create agents API router**

```python
# backend/app/api/agents.py
# Endpoints:
# GET  /api/agents              — list all agent configs (join course.name)
# POST /api/agents              — create agent config
# PUT  /api/agents/{id}         — update (status, model, temperature, etc.)
# DELETE /api/agents/{id}       — delete
# POST /api/agents/{id}/toggle  — toggle running/stopped
```

Response shape must match frontend `AgentConfig` type:
```json
{
  "id": "uuid", "name": "数学答疑助手", "course_id": "uuid",
  "course_name": "高等数学", "status": "running", "model": "GPT-5.4",
  "temperature": 0.3, "knowledge_base": "高等数学知识库 (24 知识点)",
  "grading_rules": "严格模式 - 步骤评分", "icon": "ri-calculator-line"
}
```

- [ ] **Step 3: Register router in main.py**

Add `from app.api.agents import router as agents_router` and `app.include_router(agents_router)`.

- [ ] **Step 4: Add seed data for 4 agent configs**

In `data/seed.py`, add `seed_agent_configs()` creating 4 configs matching the current mock data (数学答疑助手/running, 物理实验指导/running, 算法题解析/configuring, 统计学辅导/stopped).

- [ ] **Step 5: Commit**
```bash
git add -A && git commit -m "feat: add AgentConfig model + CRUD API + seed data"
```

---

### Task 2: Courses List + Students API

**Files:**
- Create: `backend/app/api/courses.py`
- Modify: `backend/app/main.py` — register router

**Context:** Frontend needs: list courses (teacher or student), get course detail, list enrolled students. The Course model already exists with teacher_id, enrollments.

- [ ] **Step 1: Create courses API router**

```python
# backend/app/api/courses.py
# Endpoints:
# GET  /api/courses                   — list courses (filter by JWT user role: teacher sees own, student sees enrolled)
# GET  /api/courses/{id}              — course detail + student_count + kp_count
# GET  /api/courses/{id}/students     — enrolled students with mastery
# POST /api/courses                   — create course (teacher only)
# PUT  /api/courses/{id}              — update course
```

GET /api/courses response shape (must match frontend `Course` type):
```json
[{
  "id": "uuid", "name": "高等数学", "description": "...",
  "student_count": 5, "updated_at": "2026-04-07T...", "icon": "ri-calculator-line"
}]
```

GET /api/courses/{id}/students response:
```json
{
  "course": { "id": "...", "name": "..." },
  "students": [{ "id": "uuid", "name": "张三", "email": "...", "overall_mastery": 0.56 }]
}
```

Note: `student_count` = count of CourseEnrollment for course_id. `icon` can be derived from course name or stored; for seed data, hardcode icons.

- [ ] **Step 2: Register router in main.py**

- [ ] **Step 3: Commit**
```bash
git add -A && git commit -m "feat: add courses list + students API"
```

---

### Task 3: Assignments List + Submissions List API

**Files:**
- Create: `backend/app/api/assignments.py`
- Modify: `backend/app/main.py` — register router

**Context:** Frontend grading page needs assignment submissions list. Student assignments page needs their submissions. Assignment and Submission models already exist in DB with seed data (1 assignment + 5 submissions).

- [ ] **Step 1: Create assignments API router**

```python
# backend/app/api/assignments.py
# Endpoints:
# GET  /api/assignments                       — list assignments (teacher: all for their courses; student: enrolled courses)
# GET  /api/assignments/{id}                  — assignment detail
# GET  /api/assignments/{id}/submissions      — all submissions for an assignment (teacher)
# GET  /api/submissions/mine                  — student's own submissions across all assignments
```

GET /api/assignments response:
```json
[{
  "id": "uuid", "title": "第三次作业-定积分", "course_id": "uuid",
  "course_name": "高等数学", "content": "...", "due_date": "...",
  "submission_count": 5, "graded_count": 5
}]
```

GET /api/submissions/mine response (for student assignments page):
```json
[{
  "id": "uuid", "assignment_id": "uuid", "assignment_title": "第三次作业-定积分",
  "course_name": "高等数学", "status": "graded", "score": 92.0,
  "submitted_at": "...", "due_date": "..."
}]
```

GET /api/assignments/{id}/submissions response (for teacher grading page):
```json
[{
  "id": "uuid", "student_name": "张三", "student_avatar": "张",
  "assignment_title": "第三次作业-定积分", "submitted_at": "...",
  "status": "graded", "score": 92.0
}]
```

- [ ] **Step 2: Register router in main.py**

- [ ] **Step 3: Commit**
```bash
git add -A && git commit -m "feat: add assignments + submissions list API"
```

---

### Task 4: Analytics Overview Endpoint

**Files:**
- Modify: `backend/app/api/analytics.py` — add overview endpoint
- Modify: `backend/app/services/analytics.py` — add get_overview method

**Context:** Teacher dashboard needs aggregated stats: active students, QA accuracy, warning count, AI interaction count. Compute from DB tables.

- [ ] **Step 1: Add get_overview to AnalyticsService**

```python
async def get_overview(self, db: AsyncSession, teacher_id: uuid.UUID) -> dict:
    """Aggregate dashboard stats for a teacher's courses."""
    # 1. Get teacher's course IDs
    # 2. Count distinct students enrolled
    # 3. Count student_profiles with risk_level in ("high", "medium")
    # 4. Count xapi_statements for interactions
    # 5. Calculate QA accuracy from xapi (correct/total for verb="completed")
    # Return StatOverview-compatible dict
```

- [ ] **Step 2: Add GET /api/analytics/overview endpoint**

```python
@router.get("/overview")
async def get_overview(db: AsyncSession = Depends(get_db)):
    # Requires JWT auth to get teacher_id
    # Returns StatOverview shape
```

- [ ] **Step 3: Add GET /api/analytics/mastery/{course_id} endpoint**

Returns KnowledgeMastery[] — aggregate mastery per knowledge point across all students.

```python
@router.get("/mastery/{course_id}")
async def get_mastery(course_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    # For each KP in course: avg mastery across all student profiles
    # Return [{ name, mastery, level }]
```

- [ ] **Step 4: Commit**
```bash
git add -A && git commit -m "feat: add analytics overview + mastery aggregation endpoints"
```

---

### Task 5: Re-seed Database (with new agent_configs table)

**Files:**
- Modify: `data/seed.py`

**Context:** After adding AgentConfig model, need to re-run seed to populate the new table.

- [ ] **Step 1: Add seed_agent_configs() to seed.py**

Create 4 agent configs matching the mock data, using the MATH_COURSE_ID and PHYSICS_COURSE_ID constants.

- [ ] **Step 2: Re-run seed on win4060**

```bash
# Drop and re-create (since tables changed):
ssh win4060-cf "cd C:\Services\eduagent && docker compose exec backend python -c \"
from app.database import engine, Base
import asyncio
async def reset():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
asyncio.run(reset())
print('Tables reset')
\""

# Re-run seed:
ssh win4060-cf "cd C:\Services\eduagent && docker compose cp data/. backend:/app/data/ && docker compose exec backend python -m data.seed"
```

- [ ] **Step 3: Commit**
```bash
git add -A && git commit -m "feat: seed agent configs + re-seed database"
```

---

## Chunk 2: Frontend — Wire All Pages to Real API

### Task 6: Update lib/queries.ts — Fix All Fetch Functions

**Files:**
- Modify: `frontend/lib/queries.ts`

**Context:** All fetch functions exist but point to wrong/non-existent API paths. Fix each to match the real backend endpoints. This is the SINGLE most impactful change — once queries.ts is correct, all pages auto-update via react-query.

- [ ] **Step 1: Fix all fetch functions**

Map each function to correct backend endpoint:

```typescript
// Dashboard
fetchStatOverview = () => apiFetch("/api/analytics/overview")
fetchKnowledgeMastery = (courseId) => apiFetch(`/api/analytics/mastery/${courseId}`)
fetchWarnings = (courseId) => apiFetch(`/api/analytics/warnings/${courseId}?threshold=0.3`).then(r => r.warnings)

// Courses
fetchCourses = () => apiFetch("/api/courses")
fetchCourse = (id) => apiFetch(`/api/courses/${id}`)

// Agents
fetchAgents = () => apiFetch("/api/agents")

// Grading
fetchSubmissions = (status?) => apiFetch(`/api/assignments/${ASSIGNMENT_ID}/submissions`) // or all submissions
fetchGradingDetail = (id) => apiFetch(`/api/grading/annotations/${id}`)

// Knowledge
fetchKnowledgeDocs = (courseId) => apiFetch(`/api/knowledge/docs/${courseId}`) // may need new endpoint
fetchKnowledgeGraph = (courseId) => apiFetch(`/api/knowledge/graph/${courseId}`)

// Analytics
fetchCourseAnalytics = (courseId) => apiFetch(`/api/analytics/report/${courseId}`)

// Practice (student)
// Already called directly in practice page, not via queries.ts
```

- [ ] **Step 2: Ensure response shapes match frontend types**

Where backend response shape differs from frontend type, add transform in the fetch function:
```typescript
fetchWarnings = async (courseId: string) => {
  const res = await apiFetch<{ warnings: WarningStudent[] }>(`/api/analytics/warnings/${courseId}`);
  return res.warnings;
};
```

- [ ] **Step 3: Commit**
```bash
git add -A && git commit -m "feat: wire all query functions to real backend API"
```

---

### Task 7: Teacher Dashboard — Real Data

**Files:**
- Modify: `frontend/app/teacher/dashboard/page.tsx`

**Context:** Uses 3 react-query hooks with fetchStatOverview, fetchKnowledgeMastery, fetchWarnings. After Task 6 fixes queries.ts, the dashboard should auto-work. But may need to adjust:
1. The `course_id` parameter — dashboard currently passes "default", need to pass real course_id or omit
2. Response shape transformations

- [ ] **Step 1: Update query parameters**

Change `fetchKnowledgeMastery("default")` to use the teacher's first course ID (from auth context or a courses query). Similarly for `fetchWarnings`.

- [ ] **Step 2: Verify dashboard renders with real data**

The mockOverview `active_students_trend` (sparkline array) won't come from the backend overview endpoint. Keep as mock or derive from xAPI data.

- [ ] **Step 3: Commit**
```bash
git add -A && git commit -m "feat: teacher dashboard uses real analytics data"
```

---

### Task 8: Teacher Agents Page — Real CRUD

**Files:**
- Modify: `frontend/app/teacher/agents/page.tsx`

**Context:** Currently all mock. Need to:
1. Wire fetchAgents() to GET /api/agents
2. Add onClick handlers for "配置", "停止", "启动", "新建 Agent" buttons
3. Mutate via react-query (useMutation)

- [ ] **Step 1: Wire query to real API**

Replace mockAgents with real fetchAgents() call (already done via react-query, just needs queries.ts fix from Task 6).

- [ ] **Step 2: Add toggle mutation**

```typescript
const toggleMutation = useMutation({
  mutationFn: (id: string) => apiFetch(`/api/agents/${id}/toggle`, { method: "POST" }),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ["agents"] }),
});
```

Wire "停止"/"启动" buttons to `toggleMutation.mutate(agent.id)`.

- [ ] **Step 3: Add create agent dialog (simple)**

"新建 Agent" button opens a modal/form with fields: name, course (select from courses), model, temperature. POST to /api/agents.

- [ ] **Step 4: Commit**
```bash
git add -A && git commit -m "feat: agents page with real CRUD + toggle"
```

---

### Task 9: Teacher Courses + Knowledge Graph — Real Data

**Files:**
- Modify: `frontend/app/teacher/courses/page.tsx`
- Modify: `frontend/app/teacher/courses/[id]/page.tsx`
- Modify: `frontend/app/teacher/courses/[id]/knowledge/page.tsx`
- Modify: `frontend/app/teacher/courses/[id]/analytics/page.tsx`

**Context:** Course list, course detail with students, knowledge graph, course analytics all use mock. Wire to:
- GET /api/courses → course list
- GET /api/courses/{id} → course detail
- GET /api/courses/{id}/students → student list with mastery
- GET /api/knowledge/graph/{course_id} → knowledge graph (already exists)
- GET /api/analytics/report/{course_id} → course analytics

- [ ] **Step 1: Courses list page — wire to GET /api/courses**

- [ ] **Step 2: Course detail — wire students tab to GET /api/courses/{id}/students**

- [ ] **Step 3: Knowledge page — wire graph to GET /api/knowledge/graph/{course_id}**

The backend returns `{nodes: [{id, name, course_id, difficulty, group}], edges: [{source, target, type}]}`. The frontend expects `{nodes: GraphNode[], links: GraphLink[]}`. Transform `edges` → `links` and map `course_id` → `course` field.

- [ ] **Step 4: Analytics page — wire to GET /api/analytics/report/{course_id}**

Transform backend `{top_errors, teaching_suggestions, total_interactions}` to match frontend `AnalyticsData` type.

- [ ] **Step 5: Commit**
```bash
git add -A && git commit -m "feat: teacher courses + knowledge graph + analytics use real data"
```

---

### Task 10: Teacher Grading + Warnings — Real Data

**Files:**
- Modify: `frontend/app/teacher/grading/page.tsx`
- Modify: `frontend/app/teacher/grading/[id]/page.tsx`
- Modify: `frontend/app/teacher/warnings/page.tsx`

**Context:**
- Grading queue needs submissions list from GET /api/assignments/{id}/submissions
- Grading detail needs annotations from GET /api/grading/annotations/{submission_id}
- Warnings page needs GET /api/analytics/warnings/{course_id}

- [ ] **Step 1: Grading queue — fetch real submissions**

The teacher grading page lists ALL submissions across courses. Use a new combined endpoint or iterate teacher's assignments. Simplest: add GET /api/submissions/all (teacher only) that joins Assignment + Submission.

Alternatively, modify fetchSubmissions in queries.ts to call the assignments submissions endpoint with the seeded assignment ID.

- [ ] **Step 2: Grading detail — fetch real annotations**

fetchGradingDetail(submissionId) → GET /api/grading/annotations/{submissionId}. Transform backend annotation format to match frontend Annotation type.

Backend annotation: `{paragraph_id, char_start, char_end, original_text, comment, correction, severity, confidence, knowledge_point}`
Frontend Annotation: `{id, line_start, line_end, severity, comment, correction, knowledge_point}`

Map paragraph_id P1→1, P2→2 etc for line numbers.

- [ ] **Step 3: Warnings page — wire to real API**

Already partially handled by queries.ts fix. May need course_id parameter.

- [ ] **Step 4: Wire "AI 批改全部" button to POST /api/grading/submit**

The batch grading button should POST each pending submission ID to /api/grading/submit.

- [ ] **Step 5: Commit**
```bash
git add -A && git commit -m "feat: teacher grading + warnings use real data"
```

---

### Task 11: Student Courses + Assignments — Real Data

**Files:**
- Modify: `frontend/app/s/courses/page.tsx`
- Modify: `frontend/app/s/assignments/page.tsx`
- Modify: `frontend/app/s/assignments/[id]/page.tsx`

**Context:**
- Student courses page needs enrolled courses from GET /api/courses (filtered by student role)
- Assignments page needs GET /api/submissions/mine (student's own submissions)
- Assignment detail needs grading result from GET /api/grading/result/{submission_id}

- [ ] **Step 1: Student courses — wire to GET /api/courses**

Backend returns courses the student is enrolled in. Add progress data: compute from StudentProfile.overall_mastery for each course.

- [ ] **Step 2: Student assignments — wire to GET /api/submissions/mine**

Transform response to match the mockAssignments shape (add assignment_title, course_name, status mapping).

- [ ] **Step 3: Assignment detail — wire submit + view annotations**

For pending: POST /api/grading/submit after student submits content.
For graded: GET /api/grading/annotations/{submission_id} to show annotations.

- [ ] **Step 4: Commit**
```bash
git add -A && git commit -m "feat: student courses + assignments use real data"
```

---

### Task 12: Student Practice — Real BKT Exercise Selection

**Files:**
- Modify: `frontend/app/s/practice/page.tsx`

**Context:** Currently uses hardcoded exercises and local BKT math. Need to wire to:
- POST /api/practice/generate → get adaptive exercise
- POST /api/practice/answer → submit answer, get BKT update

- [ ] **Step 1: Replace mock exercises with API-driven flow**

On page load: POST /api/practice/generate with user_id + course_id → receive exercise.
On answer: POST /api/practice/answer → receive is_correct + updated_profile.
Show next exercise by calling generate again.

- [ ] **Step 2: Wire knowledge point mastery rings to real profile**

GET /api/analytics/profile/{user_id}?course_id=X → get real BKT states for display.

- [ ] **Step 3: Commit**
```bash
git add -A && git commit -m "feat: student practice uses real BKT exercise selection"
```

---

## Chunk 3: Deploy + Verify

### Task 13: Build, Deploy, and End-to-End Verify

**Files:** None (deployment task)

- [ ] **Step 1: Push all changes to GitHub**
```bash
cd /Users/ev/a25-refs && git push origin main
```

- [ ] **Step 2: Pull on win4060 + rebuild**
```bash
ssh win4060-cf "cd C:\Services\eduagent && git -c http.proxy=socks5://127.0.0.1:10808 pull origin main"
ssh win4060-cf "cd C:\Services\eduagent && docker compose build backend frontend"
ssh win4060-cf "cd C:\Services\eduagent && docker compose up -d --force-recreate backend frontend && docker compose restart nginx"
```

- [ ] **Step 3: Re-seed database (new tables)**
```bash
ssh win4060-cf "cd C:\Services\eduagent && docker compose cp data/. backend:/app/data/ && docker compose exec backend python -m data.seed"
```

- [ ] **Step 4: Re-upload course materials to Milvus**
```bash
MATH_ID="00000000-0000-4000-b000-000000000001"
PHYS_ID="00000000-0000-4000-b000-000000000002"
API="https://eduagent.inspiredjinyao.com"
curl -s -X POST "$API/api/knowledge/upload" -F "course_id=$MATH_ID" -F "file=@data/courses/高等数学/定积分与微分.md"
curl -s -X POST "$API/api/knowledge/upload" -F "course_id=$MATH_ID" -F "file=@data/courses/高等数学/级数与极限.md"
curl -s -X POST "$API/api/knowledge/upload" -F "course_id=$PHYS_ID" -F "file=@data/courses/大学物理/牛顿力学.md"
curl -s -X POST "$API/api/knowledge/upload" -F "course_id=$PHYS_ID" -F "file=@data/courses/大学物理/运动学.md"
```

- [ ] **Step 5: E2E verification checklist**

Login as teacher@demo.com:
- [ ] Dashboard: real stats, mastery chart from DB, real warning students
- [ ] Courses: 2 courses from DB, click → students list with mastery
- [ ] Knowledge: graph from Neo4j, upload works
- [ ] Grading: submissions from DB, click → annotations, AI batch grade works
- [ ] Agents: 4 agents from DB, toggle start/stop works
- [ ] Warnings: real at-risk students from BKT data

Login as student1@demo.com:
- [ ] Courses: enrolled courses with progress from BKT
- [ ] Chat: AI responds with RAG context
- [ ] Assignments: real submission, view annotations
- [ ] Practice: adaptive exercise from BKT, answer updates mastery
- [ ] Profile: real BKT radar + energy rings (already working)

- [ ] **Step 6: Commit any fixes**
```bash
git add -A && git commit -m "fix: e2e integration fixes" && git push origin main
```
