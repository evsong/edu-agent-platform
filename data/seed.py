"""
EduAgent Demo Seed Data
~~~~~~~~~~~~~~~~~~~~~~~

Populates PostgreSQL and Neo4j with demo data for competition:
  - Users (1 teacher + 5 students)
  - Courses (高等数学, 大学物理)
  - Course enrollments
  - Knowledge points
  - Exercises (25 math + 15 physics)
  - Assignments + submissions (3 assignments, 8 submissions)
  - Student profiles with BKT states
  - xAPI statements (~75 learning activity records)
  - Neo4j knowledge graph

Usage:
    cd backend && python -m data.seed
    # or from project root:
    PYTHONPATH=backend python data/seed.py
"""

from __future__ import annotations

import asyncio
import json
import random
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
from app.models.xapi_statement import XAPIStatement

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

ASSIGNMENT_1_ID = uuid.UUID("00000000-0000-4000-c000-000000000001")  # existing: 定积分
ASSIGNMENT_2_ID = uuid.UUID("00000000-0000-4000-c000-000000000002")  # new: 级数
ASSIGNMENT_3_ID = uuid.UUID("00000000-0000-4000-c000-000000000003")  # new: 牛顿力学
ASSIGNMENT_4_ID = uuid.UUID("00000000-0000-4000-c000-000000000004")  # new: 数据结构(代码)

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
    assignment_id = ASSIGNMENT_1_ID
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


async def seed_additional_assignments(session: AsyncSession) -> None:
    """Create 2 more assignments + 3 submissions for the physics one."""
    now = datetime.now(timezone.utc)

    # ── Math assignment: 级数 (pending, no submissions yet) ──
    math_hw = Assignment(
        id=ASSIGNMENT_2_ID,
        course_id=MATH_COURSE_ID,
        title="第四次作业-级数",
        content=(
            "1. 判断级数 Σ(1/n²) 的敛散性\n"
            "2. 求幂级数 Σ(xⁿ/n!) 的收敛半径\n"
            "3. 将 f(x)=eˣ 展开为麦克劳林级数\n"
            "4. 利用逐项积分求 Σ((-1)ⁿ/(2n+1)) 的和"
        ),
        due_date=now + timedelta(days=3),
        grading_rules={
            "total_points": 100,
            "questions": [
                {"id": 1, "points": 20, "type": "判断"},
                {"id": 2, "points": 25, "type": "calculation"},
                {"id": 3, "points": 25, "type": "calculation"},
                {"id": 4, "points": 30, "type": "calculation"},
            ],
        },
    )

    # ── Physics assignment: 牛顿力学 (3 submissions) ──
    phys_hw = Assignment(
        id=ASSIGNMENT_3_ID,
        course_id=PHYSICS_COURSE_ID,
        title="第一次实验报告-牛顿力学",
        content=(
            "实验目的：验证牛顿第二运动定律 F=ma\n"
            "要求：\n"
            "1. 描述实验装置和原理\n"
            "2. 记录实验数据（至少5组）\n"
            "3. 用图表分析 F 与 a 的关系\n"
            "4. 讨论误差来源和改进方案"
        ),
        due_date=now + timedelta(days=5),
        grading_rules={
            "total_points": 100,
            "sections": [
                {"id": 1, "points": 15, "type": "装置描述"},
                {"id": 2, "points": 25, "type": "数据记录"},
                {"id": 3, "points": 35, "type": "数据分析"},
                {"id": 4, "points": 25, "type": "误差讨论"},
            ],
        },
    )
    session.add_all([math_hw, phys_hw])
    await session.flush()

    # Submissions for the physics assignment
    phys_submissions = [
        Submission(
            assignment_id=ASSIGNMENT_3_ID,
            student_id=STUDENT_IDS[0],  # 张三
            content=(
                "一、实验装置：光滑导轨、滑块、弹簧测力计、光电计时器。\n"
                "二、原理：F=ma，通过改变外力测量加速度。\n"
                "三、数据：(0.5N,0.25m/s²), (1.0N,0.51m/s²), (1.5N,0.74m/s²), "
                "(2.0N,1.02m/s²), (2.5N,1.24m/s²)\n"
                "四、分析：线性拟合 R²=0.998，斜率=2.01kg，与滑块质量2.0kg吻合。\n"
                "五、误差来源：摩擦力、空气阻力、计时精度。改进：使用气垫导轨。"
            ),
            status="graded",
            score=85.0,
            annotations={
                "auto_graded": True,
                "feedback": "数据分析完整，图表清晰。误差讨论可以更深入。",
            },
        ),
        Submission(
            assignment_id=ASSIGNMENT_3_ID,
            student_id=STUDENT_IDS[2],  # 王五
            content=(
                "实验装置：导轨+滑块+砝码。\n"
                "原理：牛顿第二定律。\n"
                "数据：(1N,0.48), (2N,0.99), (3N,1.52), (4N,1.98), (5N,2.51)\n"
                "分析：F和a成正比关系，拟合得m≈2.0kg。\n"
                "误差：测量不准确。"
            ),
            status="graded",
            score=72.0,
            annotations={
                "auto_graded": True,
                "feedback": "实验过程描述过于简略，缺少单位标注，误差分析需要具体化。",
            },
        ),
        Submission(
            assignment_id=ASSIGNMENT_3_ID,
            student_id=STUDENT_IDS[3],  # 赵六
            content=(
                "一、装置：气垫导轨、光电门、砝码组、电子天平。\n"
                "二、原理：在摩擦力可忽略的条件下验证F=ma。\n"
                "三、数据记录：\n"
                "组1: F=0.49N, a=0.245m/s²\n"
                "组2: F=0.98N, a=0.490m/s²\n"
                "组3: F=1.47N, a=0.732m/s²\n"
                "组4: F=1.96N, a=0.981m/s²\n"
                "组5: F=2.45N, a=1.220m/s²\n"
                "四、分析：待完成"
            ),
            status="submitted",
            score=None,
            annotations=None,
        ),
    ]
    session.add_all(phys_submissions)
    await session.flush()
    print("  [+] Created 2 additional assignments (级数 + 牛顿力学) with 3 submissions")


async def seed_code_assignment(session: AsyncSession) -> None:
    """Create a code-based assignment (数据结构) with a buggy Python submission."""
    now = datetime.now(timezone.utc)

    assignment = Assignment(
        id=ASSIGNMENT_4_ID,
        course_id=MATH_COURSE_ID,
        title="编程作业-数据结构：链表操作",
        content=(
            "实现以下链表操作函数（Python）：\n"
            "1. 反转单链表 reverse_list(head)\n"
            "2. 检测链表是否有环 has_cycle(head)\n"
            "3. 合并两个有序链表 merge_sorted(l1, l2)\n\n"
            "要求：\n"
            "- 提供完整的 ListNode 类定义\n"
            "- 每个函数需有类型注解和文档字符串\n"
            "- 考虑边界情况（空链表、单节点等）"
        ),
        due_date=now + timedelta(days=5),
        grading_rules={
            "total_points": 100,
            "questions": [
                {"id": 1, "points": 30, "type": "code", "criteria": "链表反转"},
                {"id": 2, "points": 30, "type": "code", "criteria": "环检测"},
                {"id": 3, "points": 40, "type": "code", "criteria": "有序合并"},
            ],
        },
    )
    session.add(assignment)
    await session.flush()

    # Buggy submission from 李四: has a deliberate off-by-one in merge
    # and missing cycle detection logic
    code_submission = Submission(
        assignment_id=ASSIGNMENT_4_ID,
        student_id=STUDENT_IDS[1],  # 李四
        content=(
            "class ListNode:\n"
            "    def __init__(self, val=0, next=None):\n"
            "        self.val = val\n"
            "        self.next = next\n"
            "\n"
            "def reverse_list(head):\n"
            "    prev = None\n"
            "    curr = head\n"
            "    while curr:\n"
            "        next_node = curr.next\n"
            "        curr.next = prev\n"
            "        prev = curr\n"
            "        curr = next_node\n"
            "    return prev\n"
            "\n"
            "def has_cycle(head):\n"
            "    # 使用快慢指针\n"
            "    slow = head\n"
            "    fast = head\n"
            "    while fast and fast.next:\n"
            "        slow = slow.next\n"
            "        fast = fast.next\n"  # BUG: should be fast.next.next
            "        if slow == fast:\n"
            "            return True\n"
            "    return False\n"
            "\n"
            "def merge_sorted(l1, l2):\n"
            "    dummy = ListNode()\n"
            "    curr = dummy\n"
            "    while l1 and l2:\n"
            "        if l1.val <= l2.val:\n"
            "            curr.next = l1\n"
            "            l1 = l1.next\n"
            "        else:\n"
            "            curr.next = l2\n"
            "            l2 = l2.next\n"
            "        curr = curr.next\n"
            "    # 忘记处理剩余节点\n"
            "    return dummy.next\n"
        ),
        status="submitted",
        score=None,
        annotations=None,
    )
    session.add(code_submission)
    await session.flush()
    print("  [+] Created code assignment (数据结构) with 1 buggy submission")


async def seed_xapi_statements(session: AsyncSession) -> None:
    """Create ~70 xAPI statements simulating realistic learning activities."""
    random.seed(42)  # reproducible but varied
    now = datetime.now(timezone.utc)

    def _ts(hours_ago: float) -> datetime:
        """Return a timestamp `hours_ago` before now."""
        return now - timedelta(hours=hours_ago)

    statements: list[XAPIStatement] = []

    # ── Helper: stable UUID from a seed string ──
    def _sid(seed: str) -> uuid.UUID:
        return uuid.uuid5(uuid.NAMESPACE_DNS, f"eduagent.xapi.{seed}")

    # ================================================================
    # 1) QA interactions  (verb="asked", object_type="question")
    # ================================================================
    qa_data: list[tuple[int, list[tuple[str, str, str]]]] = [
        # (student_index, [(question_summary, topic_kp, course_key), ...])
        (0, [  # 张三: 15 math questions
            ("定积分的几何意义是什么？", "MATH-CALC-002", "math"),
            ("怎么计算∫₀¹ x²dx？", "MATH-CALC-002", "math"),
            ("定积分中值定理怎么用？", "MATH-CALC-003", "math"),
            ("牛顿-莱布尼茨公式的证明思路？", "MATH-CALC-002", "math"),
            ("p级数的敛散性怎么判断？", "MATH-SERIES-001", "math"),
            ("比值审敛法怎么用？", "MATH-SERIES-001", "math"),
            ("幂级数的收敛区间怎么求？", "MATH-SERIES-002", "math"),
            ("行列式展开定理怎么理解？", "MATH-DET-001", "math"),
            ("克莱默法则什么时候能用？", "MATH-DET-001", "math"),
            ("行列式和矩阵有什么区别？", "MATH-DET-001", "math"),
            ("行列式为零意味着什么？", "MATH-DET-001", "math"),
            ("向量叉积的几何意义？", "MATH-VEC-001", "math"),
            ("向量的线性相关怎么判断？", "MATH-VEC-001", "math"),
            ("数列极限的ε-N定义怎么理解？", "MATH-LIMIT-001", "math"),
            ("函数极限的ε-δ语言？", "MATH-LIMIT-002", "math"),
        ]),
        (1, [  # 李四: 8 math questions (mostly 微分, 极限)
            ("导数的物理意义是什么？", "MATH-DIFF-001", "math"),
            ("复合函数怎么求导？", "MATH-DIFF-001", "math"),
            ("隐函数求导怎么做？", "MATH-DIFF-001", "math"),
            ("洛必达法则什么时候能用？", "MATH-LIMIT-002", "math"),
            ("极限的四则运算法则？", "MATH-LIMIT-001", "math"),
            ("夹逼准则怎么用？", "MATH-LIMIT-001", "math"),
            ("参数方程求导？", "MATH-DIFF-001", "math"),
            ("无穷小的比较怎么做？", "MATH-LIMIT-002", "math"),
        ]),
        (2, [  # 王五: 10 physics questions
            ("牛顿第三定律的应用场景？", "PHY-MECH-001", "physics"),
            ("自由体图怎么画？", "PHY-MECH-001", "physics"),
            ("摩擦力怎么计算？", "PHY-MECH-001", "physics"),
            ("功的定义和计算？", "PHY-MECH-002", "physics"),
            ("势能和动能的转换？", "PHY-MECH-002", "physics"),
            ("动能定理怎么用？", "PHY-MECH-003", "physics"),
            ("位移和路程的区别？", "PHY-KIN-001", "physics"),
            ("平抛运动的分解？", "PHY-KIN-002", "physics"),
            ("匀变速直线运动公式？", "PHY-KIN-002", "physics"),
            ("参考系的选择对运动描述的影响？", "PHY-KIN-001", "physics"),
        ]),
        (3, [  # 赵六: 12 questions about both courses
            ("不定积分的换元法？", "MATH-CALC-001", "math"),
            ("分部积分的技巧？", "MATH-CALC-001", "math"),
            ("泰勒展开的余项？", "MATH-SERIES-002", "math"),
            ("极限存在的充要条件？", "MATH-LIMIT-001", "math"),
            ("高阶导数的求法？", "MATH-DIFF-001", "math"),
            ("变限积分的求导？", "MATH-CALC-002", "math"),
            ("动量守恒的条件？", "PHY-MOM-001", "physics"),
            ("完全弹性碰撞？", "PHY-MOM-001", "physics"),
            ("功率的瞬时值和平均值？", "PHY-MECH-002", "physics"),
            ("向心加速度的推导？", "PHY-KIN-002", "physics"),
            ("角动量守恒？", "PHY-MOM-001", "physics"),
            ("能量守恒定律的应用？", "PHY-MECH-003", "physics"),
        ]),
        (4, [  # 陈七: 10 questions about both courses
            ("级数的绝对收敛和条件收敛？", "MATH-SERIES-001", "math"),
            ("柯西收敛准则？", "MATH-SERIES-001", "math"),
            ("傅里叶级数和幂级数的关系？", "MATH-SERIES-002", "math"),
            ("行列式的性质和计算技巧？", "MATH-DET-001", "math"),
            ("定积分的应用（面积、体积）？", "MATH-CALC-002", "math"),
            ("牛顿运动定律的局限性？", "PHY-MECH-001", "physics"),
            ("弹性势能的公式推导？", "PHY-MECH-002", "physics"),
            ("匀速圆周运动的条件？", "PHY-KIN-002", "physics"),
            ("冲量定理和动量定理的区别？", "PHY-MOM-001", "physics"),
            ("运动的叠加原理？", "PHY-KIN-001", "physics"),
        ]),
    ]

    for student_idx, questions in qa_data:
        for q_i, (question, kp_ext_id, course_key) in enumerate(questions):
            course_id = MATH_COURSE_ID if course_key == "math" else PHYSICS_COURSE_ID
            hours_ago = random.uniform(1, 168)  # last 7 days
            statements.append(XAPIStatement(
                id=_sid(f"qa-{student_idx}-{q_i}"),
                user_id=STUDENT_IDS[student_idx],
                verb="asked",
                object_type="question",
                object_id=question,
                result_score=None,
                result_success=None,
                context={
                    "course_id": str(course_id),
                    "knowledge_point": kp_ext_id,
                    "topic": KP_DATA[kp_ext_id]["name"],
                },
                timestamp=_ts(hours_ago),
            ))

    # ================================================================
    # 2) Practice exercises  (verb="completed", object_type="exercise")
    # ================================================================
    # Map each student to exercises they attempted, with success based on mastery
    exercise_data: list[tuple[int, list[tuple[str, str]]]] = [
        # (student_idx, [(kp_ext_id, course_key), ...])
        (0, [  # 张三: 8 exercises — strong at 极限, weak at 行列式
            ("MATH-LIMIT-001", "math"), ("MATH-LIMIT-002", "math"),
            ("MATH-CALC-002", "math"), ("MATH-CALC-003", "math"),
            ("MATH-DET-001", "math"), ("MATH-DET-001", "math"),
            ("MATH-VEC-001", "math"), ("MATH-SERIES-001", "math"),
        ]),
        (1, [  # 李四: 7 exercises — weak at 微分/级数
            ("MATH-DIFF-001", "math"), ("MATH-DIFF-001", "math"),
            ("MATH-LIMIT-001", "math"), ("MATH-LIMIT-002", "math"),
            ("MATH-SERIES-001", "math"), ("MATH-CALC-001", "math"),
            ("MATH-CALC-002", "math"),
        ]),
        (2, [  # 王五: 6 exercises — physics focus
            ("PHY-MECH-001", "physics"), ("PHY-MECH-002", "physics"),
            ("PHY-KIN-001", "physics"), ("PHY-KIN-002", "physics"),
            ("MATH-LIMIT-001", "math"), ("MATH-CALC-001", "math"),
        ]),
        (3, [  # 赵六: 10 exercises — good at everything
            ("MATH-LIMIT-001", "math"), ("MATH-DIFF-001", "math"),
            ("MATH-CALC-002", "math"), ("MATH-SERIES-001", "math"),
            ("MATH-DET-001", "math"), ("PHY-MECH-001", "physics"),
            ("PHY-MECH-002", "physics"), ("PHY-KIN-001", "physics"),
            ("PHY-MOM-001", "physics"), ("MATH-CALC-001", "math"),
        ]),
        (4, [  # 陈七: 8 exercises — good at most things
            ("MATH-LIMIT-001", "math"), ("MATH-SERIES-001", "math"),
            ("MATH-SERIES-002", "math"), ("MATH-DET-001", "math"),
            ("PHY-MECH-001", "physics"), ("PHY-KIN-001", "physics"),
            ("PHY-MOM-001", "physics"), ("MATH-CALC-002", "math"),
        ]),
    ]

    for student_idx, exercises in exercise_data:
        mastery_overrides = STUDENT_PROFILES_CONFIG[student_idx]["overrides"]
        for ex_i, (kp_ext_id, course_key) in enumerate(exercises):
            course_id = MATH_COURSE_ID if course_key == "math" else PHYSICS_COURSE_ID
            # Success probability based on mastery level
            mastery = mastery_overrides.get(kp_ext_id, 0.5)
            success = random.random() < mastery
            hours_ago = random.uniform(2, 160)
            statements.append(XAPIStatement(
                id=_sid(f"ex-{student_idx}-{ex_i}"),
                user_id=STUDENT_IDS[student_idx],
                verb="completed",
                object_type="exercise",
                object_id=f"exercise-{kp_ext_id}-{ex_i}",
                result_score=1.0 if success else 0.0,
                result_success=success,
                context={
                    "course_id": str(course_id),
                    "knowledge_point": kp_ext_id,
                    "topic": KP_DATA[kp_ext_id]["name"],
                },
                timestamp=_ts(hours_ago),
            ))

    # ================================================================
    # 3) Grading events  (verb="graded", object_type="submission")
    # ================================================================
    # One per student for the original math assignment
    original_scores = [92.0, 55.0, 78.0, 95.0, 88.0]
    for student_idx, score in enumerate(original_scores):
        statements.append(XAPIStatement(
            id=_sid(f"grade-a1-{student_idx}"),
            user_id=STUDENT_IDS[student_idx],
            verb="graded",
            object_type="submission",
            object_id=f"submission-{ASSIGNMENT_1_ID}-{STUDENT_IDS[student_idx]}",
            result_score=round(score / 100.0, 2),
            result_success=score >= 60.0,
            context={
                "course_id": str(MATH_COURSE_ID),
                "assignment_id": str(ASSIGNMENT_1_ID),
                "assignment_title": "第三次作业-定积分",
            },
            timestamp=_ts(random.uniform(12, 48)),
        ))

    # Grading events for physics assignment (张三 and 王五 graded)
    phys_graded = [(0, 85.0), (2, 72.0)]
    for student_idx, score in phys_graded:
        statements.append(XAPIStatement(
            id=_sid(f"grade-a3-{student_idx}"),
            user_id=STUDENT_IDS[student_idx],
            verb="graded",
            object_type="submission",
            object_id=f"submission-{ASSIGNMENT_3_ID}-{STUDENT_IDS[student_idx]}",
            result_score=round(score / 100.0, 2),
            result_success=score >= 60.0,
            context={
                "course_id": str(PHYSICS_COURSE_ID),
                "assignment_id": str(ASSIGNMENT_3_ID),
                "assignment_title": "第一次实验报告-牛顿力学",
            },
            timestamp=_ts(random.uniform(6, 24)),
        ))

    # ================================================================
    # 4) Knowledge point interactions (verb="answered", object_type="knowledge_point")
    # ================================================================
    # Simulate individual KP mastery checks from practice sessions
    kp_interaction_data: list[tuple[int, list[str]]] = [
        (0, ["MATH-LIMIT-001", "MATH-LIMIT-002", "MATH-DET-001", "MATH-VEC-001",
             "MATH-CALC-002", "MATH-SERIES-001"]),
        (1, ["MATH-DIFF-001", "MATH-LIMIT-001", "MATH-LIMIT-002", "MATH-SERIES-001",
             "MATH-CALC-001"]),
        (2, ["PHY-MECH-001", "PHY-KIN-001", "PHY-KIN-002", "PHY-MECH-002",
             "MATH-LIMIT-001"]),
        (3, ["MATH-LIMIT-001", "MATH-CALC-002", "MATH-DIFF-001", "PHY-MECH-001",
             "PHY-MOM-001", "PHY-KIN-001"]),
        (4, ["MATH-SERIES-001", "MATH-DET-001", "PHY-MECH-001", "PHY-KIN-001",
             "MATH-CALC-002"]),
    ]

    for student_idx, kp_list in kp_interaction_data:
        mastery_overrides = STUDENT_PROFILES_CONFIG[student_idx]["overrides"]
        for kp_i, kp_ext_id in enumerate(kp_list):
            mastery = mastery_overrides.get(kp_ext_id, 0.5)
            success = random.random() < mastery
            course_key = KP_DATA[kp_ext_id]["course"]
            course_id = MATH_COURSE_ID if course_key == "math" else PHYSICS_COURSE_ID
            hours_ago = random.uniform(3, 144)
            statements.append(XAPIStatement(
                id=_sid(f"kp-{student_idx}-{kp_i}"),
                user_id=STUDENT_IDS[student_idx],
                verb="answered",
                object_type="knowledge_point",
                object_id=str(KP_UUIDS[kp_ext_id]),
                result_score=1.0 if success else 0.0,
                result_success=success,
                context={
                    "course_id": str(course_id),
                    "knowledge_point": kp_ext_id,
                    "topic": KP_DATA[kp_ext_id]["name"],
                    "mastery_before": round(mastery, 2),
                },
                timestamp=_ts(hours_ago),
            ))

    session.add_all(statements)
    await session.flush()
    print(f"  [+] Created {len(statements)} xAPI statements")


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
    print("[1/12] Tables ensured")

    async with async_session() as session:
        async with session.begin():
            # Check if data already exists
            result = await session.execute(select(User).where(User.email == "teacher@demo.com"))
            if result.scalar_one_or_none():
                print("\n[!] Seed data already exists. To re-seed, clear the database first.")
                print("    Run: DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
                return

            print("[2/12] Seeding users...")
            await seed_users(session)

            print("[3/12] Seeding courses...")
            await seed_courses(session)

            print("[4/12] Seeding enrollments...")
            await seed_enrollments(session)

            print("[5/12] Seeding knowledge points...")
            await seed_knowledge_points(session)

            print("[6/12] Seeding exercises...")
            await seed_exercises(session)

            print("[7/12] Seeding assignments & submissions...")
            await seed_assignments(session)

            print("[8/12] Seeding additional assignments...")
            await seed_additional_assignments(session)

            print("[9/12] Seeding code assignment...")
            await seed_code_assignment(session)

            print("[10/12] Seeding student profiles (BKT)...")
            await seed_student_profiles(session)

            print("[11/12] Seeding agent configs...")
            await seed_agent_configs(session)

            print("[12/12] Seeding xAPI statements...")
            await seed_xapi_statements(session)

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
