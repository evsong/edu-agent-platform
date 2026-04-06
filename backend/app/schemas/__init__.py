"""Pydantic schemas — import all schemas here."""

from app.schemas.user import UserCreate, UserResponse, TokenResponse  # noqa: F401
from app.schemas.course import CourseCreate, CourseResponse  # noqa: F401
from app.schemas.assignment import (  # noqa: F401
    AssignmentCreate,
    SubmissionCreate,
    SubmissionResponse,
)
from app.schemas.grading import (  # noqa: F401
    AnnotationSchema,
    GradingResult,
    GradingRules,
)
from app.schemas.analytics import (  # noqa: F401
    BKTState,
    StudentProfileResponse,
    ExerciseResponse,
    PracticeAnswerRequest,
)
from app.schemas.platform import (  # noqa: F401
    LTILaunchData,
    DingTalkMessage,
    XAPIStatement,
)
