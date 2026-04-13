"""SQLAlchemy models — import all models here so Base.metadata is complete."""

from app.models.user import User  # noqa: F401
from app.models.course import Course, CourseEnrollment  # noqa: F401
from app.models.assignment import Assignment, Submission  # noqa: F401
from app.models.knowledge_point import KnowledgePoint  # noqa: F401
from app.models.exercise import Exercise  # noqa: F401
from app.models.xapi_statement import XAPIStatement  # noqa: F401
from app.models.student_profile import StudentProfile  # noqa: F401
from app.models.platform_user import PlatformUser  # noqa: F401
from app.models.agent_config import AgentConfig  # noqa: F401
from app.models.document import Document  # noqa: F401
