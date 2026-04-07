"""
EduAgent Demo Seed Data
~~~~~~~~~~~~~~~~~~~~~~~

Populates PostgreSQL and Neo4j with demo data for competition:
  - Users (1 teacher + 5 students)
  - Courses (高等数学, 大学物理)
  - Course enrollments
  - Knowledge points
  - Exercises (25 math + 15 physics)
  - Assignments + submissions
  - Student profiles with BKT states
  - Neo4j knowledge graph

Usage:
    cd backend && python -m data.seed
    # or from project root:
    PYTHONPATH=backend python data/seed.py
"""

from __future__ import annotations

import asyncio
import json
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Ensure backend package is importable
_backend_dir = str(Path(__file__).resolve().parent.parent / "backend")
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import Base, engine, async_session
from app.auth import hash_password
from app.models.user import User
from app.models.course import Course, CourseEnrollment
from app.models.assignment import Assignment, Submission
from app.models.knowledge_point import KnowledgePoint
from app.models.exercise import Exercise
from app.models.student_profile import StudentProfile
from app.models.agent_config import AgentConfig

# ── Paths ────────────────────────────────────────────────────
DATA_DIR = Path(__file__).resolve().parent
EXERCISES_PATH = DATA_DIR / "exercises.json"
CYPHER_PATH = DATA_DIR / "knowledge_graph.cypher"

# ── Fixed UUIDs for reproducibility ──────────────────────────
TEACHER_ID = uuid.UUID("00000000-0000-4000-a000-000000000001")
STUDENT_IDS = [
    uuid.UUID("00000000-0000-4000-a000-000000000010"),  # 张三
    uuid.UUID("00000000-0000-4000-a000-000000000011"),  # 李四
    uuid.UUID("00000000-0000-4000-a000-000000000012"),  # 王五
    uuid.UUID("00000000-0000-4000-a000-000000000013"),  # 赵六
    uuid.UUID("00000000-0000-4000-a000-000000000014"),  # 陈七
]
MATH_COURSE_ID = uuid.UUID("00000000-0000-4000-b000-000000000001")
PHYSICS_COURSE_ID = uuid.UUID("00000000-0000-4000-b000-000000000002")

STUDENT_NAMES = ["张三", "李四", "王五", "赵六", "陈七"]
STUDENT_EMAILS = [f"student{i}@demo.com" for i in range(1, 6)]
PASSWORD = "demo123"

# ── Knowledge point external_id → UUID mapping ──────────────
KP_DATA: dict[str, dict] = {
    # Math
    "MATH-LIMIT-001": {"name": "数列极限", "course": "math", "difficulty": 2, "tags": ["极限", "数列"]},
    "MATH-LIMIT-002": {"name": "函数极限", "course": "math", "difficulty": 3, "tags": ["极限", "函数"]},
    "MATH-DIFF-001":  {"name": "导数与微分", "course": "math", "difficulty": 3, "tags": ["微分", "导数"]},
    "MATH-CALC-001":  {"name": "不定积分", "course": "math", "difficulty": 3, "tags": ["积分"]},
    "MATH-CALC-002":  {"name": "定积分", "course": "math", "difficulty": 4, "tags": ["积分", "定积分"]},
    "MATH-CALC-003":  {"name": "定积分的性质", "course": "math", "difficulty": 3, "tags": ["积分", "性质"]},
    "MATH-SERIES-001": {"name": "数项级数", "course": "math", "difficulty": 4, "tags": ["级数"]},
    "MATH-SERIES-002": {"name": "幂级数", "course": "math", "difficulty": 5, "tags": ["级数", "幂级数"]},
    "MATH-VEC-001":   {"name": "向量代数", "course": "math", "difficulty": 3, "tags": ["向量"]},
    "MATH-DET-001":   {"name": "行列式", "course": "math", "difficulty": 4, "tags": ["行列式", "线代"]},
    # Physics
    "PHY-MECH-001":   {"name": "牛顿运动定律", "course": "physics", "difficulty": 3, "tags": ["力学", "牛顿"]},
    "PHY-MECH-002":   {"name": "做功与能量", "course": "physics", "difficulty": 4, "tags": ["力学", "做功", "能量"]},
    "PHY-MECH-003":   {"name": "动能定理", "course": "physics", "difficulty": 4, "tags": ["力学", "动能"]},
    "PHY-KIN-001":    {"name": "运动学基本量", "course": "physics", "difficulty": 2, "tags": ["运动学", "位移", "速度"]},
    "PHY-KIN-002":    {"name": "匀变速运动", "course": "physics", "difficulty": 3, "tags": ["运动学", "加速度"]},
    "PHY-MOM-001":    {"name": "动量守恒", "course": "physics", "difficulty": 4, "tags": ["力学", "动量"]},
}

# Pre-generate stable UUIDs for knowledge points
KP_UUIDS: dict[str, uuid.UUID] = {
    ext_id: uuid.uuid5(uuid.NAMESPACE_DNS, f"eduagent.kp.{ext_id}")
    for ext_id in KP_DATA
}


def _course_id_for(course_key: str) -> uuid.UUID:
    return MATH_COURSE_ID if course_key == "math" else PHYSICS_COURSE_ID


# ── BKT state profiles ──────────────────────────────────────
def _make_bkt_states(mastery_overrides: dict[str, float]) -> dict:
    """Create BKT states dict. Default mastery = 0.5 for all KPs,
    with specific overrides."""
    states = {}
    for ext_id in KP_DATA:
        p = mastery_overrides.get(ext_id, 0.5)
        states[ext_id] = {
            "p_know": round(p, 2),
            "p_learn": 0.1,
            "p_guess": 0.25,
            "p_slip": 0.1,
            "attempts": 8,
            "correct": max(1, int(p * 8)),
        }
    return states


STUDENT_PROFILES_CONFIG: list[dict] = [
    {
        # 张三: overall good but weak on 向量(0.18) and 行列式(0.12) → high risk
        "overrides": {
            "MATH-VEC-001": 0.18,
            "MATH-DET-001": 0.12,
            "MATH-LIMIT-001": 0.85,
            "MATH-LIMIT-002": 0.78,
            "MATH-DIFF-001": 0.72,
            "MATH-CALC-001": 0.70,
            "MATH-CALC-002": 0.65,
            "MATH-CALC-003": 0.68,
            "MATH-SERIES-001": 0.55,
            "MATH-SERIES-002": 0.45,
            "PHY-MECH-001": 0.70,
            "PHY-MECH-002": 0.60,
            "PHY-MECH-003": 0.55,
            "PHY-KIN-001": 0.75,
            "PHY-KIN-002": 0.65,
            "PHY-MOM-001": 0.50,
        },
        "overall_mastery": 0.56,
        "risk_level": "high",
    },
    {
        # 李四: weak on 级数(0.22) and 微分(0.29) → high risk
        "overrides": {
            "MATH-SERIES-001": 0.22,
            "MATH-SERIES-002": 0.15,
            "MATH-DIFF-001": 0.29,
            "MATH-LIMIT-001": 0.60,
            "MATH-LIMIT-002": 0.55,
            "MATH-CALC-001": 0.35,
            "MATH-CALC-002": 0.30,
            "MATH-CALC-003": 0.32,
            "MATH-VEC-001": 0.50,
            "MATH-DET-001": 0.45,
            "PHY-MECH-001": 0.55,
            "PHY-MECH-002": 0.40,
            "PHY-MECH-003": 0.38,
            "PHY-KIN-001": 0.60,
            "PHY-KIN-002": 0.50,
            "PHY-MOM-001": 0.42,
        },
        "overall_mastery": 0.41,
        "risk_level": "high",
    },
    {
        # 王五: medium overall → medium risk
        "overrides": {
            "MATH-LIMIT-001": 0.70,
            "MATH-LIMIT-002": 0.62,
            "MATH-DIFF-001": 0.55,
            "MATH-CALC-001": 0.50,
            "MATH-CALC-002": 0.48,
            "MATH-CALC-003": 0.52,
            "MATH-SERIES-001": 0.45,
            "MATH-SERIES-002": 0.38,
            "MATH-VEC-001": 0.55,
            "MATH-DET-001": 0.42,
            "PHY-MECH-001": 0.60,
            "PHY-MECH-002": 0.52,
            "PHY-MECH-003": 0.48,
            "PHY-KIN-001": 0.65,
            "PHY-KIN-002": 0.55,
            "PHY-MOM-001": 0.50,
        },
        "overall_mastery": 0.53,
        "risk_level": "medium",
    },
    {
        # 赵六: good overall → low risk
        "overrides": {
            "MATH-LIMIT-001": 0.92,
            "MATH-LIMIT-002": 0.88,
            "MATH-DIFF-001": 0.82,
            "MATH-CALC-001": 0.80,
            "MATH-CALC-002": 0.75,
            "MATH-CALC-003": 0.78,
            "MATH-SERIES-001": 0.70,
            "MATH-SERIES-002": 0.62,
            "MATH-VEC-001": 0.85,
            "MATH-DET-001": 0.72,
            "PHY-MECH-001": 0.80,
            "PHY-MECH-002": 0.75,
            "PHY-MECH-003": 0.70,
            "PHY-KIN-001": 0.88,
            "PHY-KIN-002": 0.78,
            "PHY-MOM-001": 0.72,
        },
        "overall_mastery": 0.78,
        "risk_level": "low",
    },
    {
        # 陈七: good overall → low risk
        "overrides": {
            "MATH-LIMIT-001": 0.88,
            "MATH-LIMIT-002": 0.85,
            "MATH-DIFF-001": 0.80,
            "MATH-CALC-001": 0.78,
            "MATH-CALC-002": 0.72,
            "MATH-CALC-003": 0.75,
            "MATH-SERIES-001": 0.68,
            "MATH-SERIES-002": 0.60,
            "MATH-VEC-001": 0.82,
            "MATH-DET-001": 0.70,
            "PHY-MECH-001": 0.78,
            "PHY-MECH-002": 0.72,
            "PHY-MECH-003": 0.68,
            "PHY-KIN-001": 0.85,
            "PHY-KIN-002": 0.75,
            "PHY-MOM-001": 0.70,
        },
        "overall_mastery": 0.75,
        "risk_level": "low",
    },
]


# ── Seed functions ───────────────────────────────────────────

async def seed_users(session: AsyncSession) -> None:
    """Create teacher + 5 students."""
    hashed = hash_password(PASSWORD)

    teacher = User(
        id=TEACHER_ID,
        email="teacher@demo.com",
        name="张教授",
        hashed_password=hashed,
        role="teacher",
    )
    session.add(teacher)

    for sid, name, email in zip(STUDENT_IDS, STUDENT_NAMES, STUDENT_EMAILS):
        student = User(
            id=sid,
            email=email,
            name=name,
            hashed_password=hashed,
            role="student",
        )
        session.add(student)

    await session.flush()
    print(f"  [+] Created 1 teacher + {len(STUDENT_IDS)} students")


async def seed_courses(session: AsyncSession) -> None:
    """Create 高等数学 and 大学物理 courses."""
    math = Course(
        id=MATH_COURSE_ID,
        name="高等数学",
        description="涵盖极限、微积分、级数、向量代数与线性代数基础，是理工科必修基础课程。",
        teacher_id=TEACHER_ID,
    )
    physics = Course(
        id=PHYSICS_COURSE_ID,
        name="大学物理",
        description="涵盖力学、运动学、动量与能量，强调与高等数学的跨课程关联。",
        teacher_id=TEACHER_ID,
    )
    session.add_all([math, physics])
    await session.flush()
    print("  [+] Created 2 courses: 高等数学, 大学物理")


async def seed_enrollments(session: AsyncSession) -> None:
    """Enroll all students in both courses."""
    for sid in STUDENT_IDS:
        for cid in [MATH_COURSE_ID, PHYSICS_COURSE_ID]:
            enrollment = CourseEnrollment(user_id=sid, course_id=cid)
            session.add(enrollment)
    await session.flush()
    print(f"  [+] Enrolled {len(STUDENT_IDS)} students in 2 courses")


async def seed_knowledge_points(session: AsyncSession) -> None:
    """Create knowledge points in PG."""
    for ext_id, info in KP_DATA.items():
        kp = KnowledgePoint(
            id=KP_UUIDS[ext_id],
            external_id=ext_id,
            name=info["name"],
            course_id=_course_id_for(info["course"]),
            difficulty=info["difficulty"],
            tags=info["tags"],
        )
        session.add(kp)
    await session.flush()
    print(f"  [+] Created {len(KP_DATA)} knowledge points")


async def seed_exercises(session: AsyncSession) -> None:
    """Load exercises from JSON and insert into PG."""
    exercises_data = json.loads(EXERCISES_PATH.read_text(encoding="utf-8"))
    count = 0
    for ex in exercises_data:
        kp_ext_id = ex["knowledge_point_id"]
        kp_uuid = KP_UUIDS.get(kp_ext_id)
        course_key = ex["course_id"]
        exercise = Exercise(
            course_id=_course_id_for(course_key),
            knowledge_point_id=kp_uuid,
            question=ex["question"],
            options=ex.get("options"),
            answer=ex.get("answer"),
            difficulty=ex.get("difficulty", 1),
            explanation=ex.get("explanation"),
        )
        session.add(exercise)
        count += 1
    await session.flush()
    print(f"  [+] Created {count} exercises")


async def seed_assignments(session: AsyncSession) -> None:
    """Create a sample math assignment + submissions."""
    assignment_id = uuid.UUID("00000000-0000-4000-c000-000000000001")
    now = datetime.now(timezone.utc)

    assignment = Assignment(
        id=assignment_id,
        course_id=MATH_COURSE_ID,
        title="第三次作业-定积分",
        content=(
            "1. 计算 ∫₀² (3x²+1)dx\n"
            "2. 计算 ∫₀^π sin(x)dx\n"
            "3. 利用分部积分法计算 ∫₀¹ xeˣdx\n"
            "4. 证明积分中值定理"
        ),
        due_date=now + timedelta(days=7),
        grading_rules={
            "total_points": 100,
            "questions": [
                {"id": 1, "points": 20, "type": "calculation"},
                {"id": 2, "points": 20, "type": "calculation"},
                {"id": 3, "points": 30, "type": "calculation"},
                {"id": 4, "points": 30, "type": "proof"},
            ],
        },
    )
    session.add(assignment)
    await session.flush()

    # Mock submissions from each student
    mock_answers = [
        {
            "content": "1. F(x)=x³+x, F(2)-F(0)=10\n2. [-cos x]₀^π=2\n3. 分部积分得1\n4. （证明略）",
            "score": 92.0,
            "status": "graded",
        },
        {
            "content": "1. ∫(3x²+1)dx=x³+x, 代入得10\n2. 答案是2\n3. 不会\n4. （未完成）",
            "score": 55.0,
            "status": "graded",
        },
        {
            "content": "1. 结果是10\n2. 2\n3. 结果是1\n4. 由连续函数的介值定理...",
            "score": 78.0,
            "status": "graded",
        },
        {
            "content": "1. 10\n2. 2\n3. 1\n4. 完整证明如下...",
            "score": 95.0,
            "status": "graded",
        },
        {
            "content": "1. F(2)-F(0)=10\n2. 2\n3. xe^x-e^x|₀¹=1\n4. 证明完成",
            "score": 88.0,
            "status": "graded",
        },
    ]

    for sid, answer in zip(STUDENT_IDS, mock_answers):
        submission = Submission(
            assignment_id=assignment_id,
            student_id=sid,
            content=answer["content"],
            status=answer["status"],
            score=answer["score"],
            annotations={
                "auto_graded": True,
                "feedback": "系统自动批改完成",
            },
        )
        session.add(submission)

    await session.flush()
    print("  [+] Created 1 assignment with 5 submissions")


async def seed_student_profiles(session: AsyncSession) -> None:
    """Create student profiles with varying BKT states."""
    now = datetime.now(timezone.utc)

    for i, (sid, config) in enumerate(zip(STUDENT_IDS, STUDENT_PROFILES_CONFIG)):
        bkt_states = _make_bkt_states(config["overrides"])

        for course_id in [MATH_COURSE_ID, PHYSICS_COURSE_ID]:
            # Filter BKT states for this course
            course_key = "math" if course_id == MATH_COURSE_ID else "physics"
            course_bkt = {
                k: v for k, v in bkt_states.items()
                if KP_DATA[k]["course"] == course_key
            }

            # Compute course-specific mastery as average of p_know values
            if course_bkt:
                course_mastery = round(
                    sum(s["p_know"] for s in course_bkt.values()) / len(course_bkt), 2
                )
            else:
                course_mastery = config["overall_mastery"]

            profile = StudentProfile(
                user_id=sid,
                course_id=course_id,
                bkt_states=course_bkt,
                overall_mastery=course_mastery,
                risk_level=config["risk_level"],
                last_active=now - timedelta(hours=i * 12),  # stagger activity
            )
            session.add(profile)

    await session.flush()
    print(f"  [+] Created {len(STUDENT_IDS) * 2} student profiles (BKT states populated)")


async def seed_agent_configs(session: AsyncSession) -> None:
    """Create 4 demo agent configs."""
    configs = [
        AgentConfig(
            agent_id="qa",
            name="数学答疑助手",
            course_id=MATH_COURSE_ID,
            status="running",
            model="GPT-5.4",
            temperature=0.3,
            knowledge_base="高等数学知识库 (24 知识点)",
            grading_rules="严格模式 - 步骤评分",
            icon="ri-calculator-line",
        ),
        AgentConfig(
            agent_id="qa",
            name="物理实验指导",
            course_id=PHYSICS_COURSE_ID,
            status="running",
            model="Claude 4 Sonnet",
            temperature=0.5,
            knowledge_base="大学物理知识库 (18 知识点)",
            grading_rules="宽松模式 - 结果评分",
            icon="ri-flask-line",
        ),
        AgentConfig(
            agent_id="tutor",
            name="算法题解析",
            course_id=MATH_COURSE_ID,
            status="configuring",
            model="GPT-5",
            temperature=0.2,
            knowledge_base="配置中...",
            grading_rules="代码评审模式",
            icon="ri-code-s-slash-line",
        ),
        AgentConfig(
            agent_id="analyst",
            name="统计学辅导",
            course_id=PHYSICS_COURSE_ID,
            status="stopped",
            model="Claude 4 Sonnet",
            temperature=0.4,
            knowledge_base="概率论知识库 (12 知识点)",
            grading_rules="标准模式",
            icon="ri-pie-chart-line",
        ),
    ]
    session.add_all(configs)
    await session.flush()
    print(f"  [+] Created {len(configs)} agent configs")


async def seed_neo4j() -> None:
    """Load the cypher file into Neo4j."""
    try:
        from neo4j import GraphDatabase
    except ImportError:
        print("  [!] neo4j driver not installed, skipping Neo4j seed (pip install neo4j)")
        return

    # Parse auth from settings
    neo4j_uri = settings.NEO4J_URI
    auth_parts = settings.NEO4J_AUTH.split("/", 1)
    neo4j_user = auth_parts[0]
    neo4j_pass = auth_parts[1] if len(auth_parts) > 1 else ""

    cypher_text = CYPHER_PATH.read_text(encoding="utf-8")

    # Split into individual statements (separated by semicolons)
    statements = []
    for stmt in cypher_text.split(";"):
        # Remove comments and whitespace
        lines = []
        for line in stmt.strip().splitlines():
            stripped = line.strip()
            if stripped and not stripped.startswith("//"):
                lines.append(line)
        cleaned = "\n".join(lines).strip()
        if cleaned:
            statements.append(cleaned)

    try:
        driver = GraphDatabase.driver(neo4j_uri, auth=(neo4j_user, neo4j_pass))
        with driver.session() as neo_session:
            for stmt in statements:
                neo_session.run(stmt)
        driver.close()
        print(f"  [+] Executed {len(statements)} Neo4j cypher statements")
    except Exception as e:
        print(f"  [!] Neo4j seed failed (connection issue?): {e}")
        print("      You can manually load data/knowledge_graph.cypher later.")


# ── Main ─────────────────────────────────────────────────────

async def main() -> None:
    print("=" * 60)
    print("EduAgent Seed Data")
    print("=" * 60)
    print(f"Database: {settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/{settings.POSTGRES_DB}")
    print()

    # Create tables if they don't exist
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("[1/9] Tables ensured")

    async with async_session() as session:
        async with session.begin():
            # Check if data already exists
            result = await session.execute(select(User).where(User.email == "teacher@demo.com"))
            if result.scalar_one_or_none():
                print("\n[!] Seed data already exists. To re-seed, clear the database first.")
                print("    Run: DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
                return

            print("[2/9] Seeding users...")
            await seed_users(session)

            print("[3/9] Seeding courses...")
            await seed_courses(session)

            print("[4/9] Seeding enrollments...")
            await seed_enrollments(session)

            print("[5/9] Seeding knowledge points...")
            await seed_knowledge_points(session)

            print("[6/9] Seeding exercises...")
            await seed_exercises(session)

            print("[7/9] Seeding assignments & submissions...")
            await seed_assignments(session)

            print("[8/9] Seeding student profiles (BKT)...")
            await seed_student_profiles(session)

            print("[9/9] Seeding agent configs...")
            await seed_agent_configs(session)

        # Commit happens automatically when the `begin()` block exits

    # Neo4j (separate, best-effort)
    print("\n[Neo4j] Seeding knowledge graph...")
    await seed_neo4j()

    print("\n" + "=" * 60)
    print("Seed complete!")
    print()
    print("Demo accounts:")
    print(f"  Teacher: teacher@demo.com / {PASSWORD}")
    for name, email in zip(STUDENT_NAMES, STUDENT_EMAILS):
        print(f"  Student: {email} / {PASSWORD}  ({name})")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
