"""
Pydantic models for the Adaptive Study Planner API.
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import date


# ── Input models ──────────────────────────────────────────────────────────────

class ExamInput(BaseModel):
    subject: str
    exam_date: str  # ISO date string "YYYY-MM-DD"
    topic_ids: List[str] = []


class StudentProfile(BaseModel):
    max_daily_hours: float = Field(default=6.0, ge=1.0, le=16.0)
    preferred_start_time: str = "08:00"   # HH:MM
    twin_vector: Optional[List[float]] = None
    peer_cluster_id: int = Field(default=2, ge=0, le=4)


class TopicDetail(BaseModel):
    id: str
    topic_name: str
    subject: str
    weightage_percent: float = Field(default=5.0, ge=0.0, le=100.0)
    estimated_study_hours: float = Field(default=2.0, ge=0.1)
    difficulty_level: int = Field(default=3, ge=1, le=5)
    prerequisite_topic_ids: List[str] = []


class QuizGap(BaseModel):
    topic_id: str
    gap_score: float = Field(..., ge=0.0, le=1.0)  # 1.0 = total gap, 0.0 = mastered


class GenerateScheduleRequest(BaseModel):
    student_id: str
    exams: List[ExamInput]
    student_profile: StudentProfile
    topic_details: List[TopicDetail]
    quiz_gaps: List[QuizGap] = []
    start_date: str  # ISO date string


class ReplanRequest(BaseModel):
    student_id: str
    completed_topic_ids: List[str] = []
    skipped_sessions: List[Dict[str, Any]] = []
    current_date: str  # ISO date string
    reason: str = Field(
        default="manual",
        pattern="^(completed_early|fell_behind|stress_high|manual)$"
    )
    # Carry-forward context needed to replan
    exams: List[ExamInput] = []
    student_profile: Optional[StudentProfile] = None
    topic_details: List[TopicDetail] = []
    quiz_gaps: List[QuizGap] = []


# ── Output models ─────────────────────────────────────────────────────────────

class ScheduledSlot(BaseModel):
    slot_number: int
    subject: Optional[str]
    topic_id: Optional[str]
    topic_name: Optional[str]
    duration_min: int = 90
    is_revision: bool = False
    start_time: Optional[str] = None  # HH:MM


class DaySchedule(BaseModel):
    date: str
    slots: List[ScheduledSlot]


class CoverageStats(BaseModel):
    total_topics: int
    scheduled_topics: int
    estimated_completion_percent: float


class GenerateScheduleResponse(BaseModel):
    schedule: List[DaySchedule]
    coverage_stats: CoverageStats
    warnings: List[str]
    generated_at: str


class ReplanResponse(BaseModel):
    schedule: List[DaySchedule]
    coverage_stats: CoverageStats
    warnings: List[str]
    replan_reason: str
    adjustments_made: List[str]
    generated_at: str
