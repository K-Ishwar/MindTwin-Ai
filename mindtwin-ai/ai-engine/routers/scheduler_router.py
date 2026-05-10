"""
Scheduler Router — FastAPI endpoints for the Adaptive Study Planner.
"""

from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from models.scheduler_models import (
    GenerateScheduleRequest,
    GenerateScheduleResponse,
    ReplanRequest,
    ReplanResponse,
)
from services.scheduler_service import generate_schedule, replan_schedule

router = APIRouter(prefix="/api/ai/scheduler", tags=["Study Scheduler"])


# ── POST /api/ai/scheduler/generate ──────────────────────────────────────────
@router.post("/generate", response_model=GenerateScheduleResponse)
def generate(req: GenerateScheduleRequest):
    """
    Generate a personalised adaptive study schedule for a student.

    The algorithm runs in 5 steps:
    1. Priority scoring (gap × weight × urgency)
    2. Slot generation (90-min blocks, cognitive limit of 4/day)
    3. Greedy assignment (highest priority first, interleaving rule)
    4. Buffer revision slots (last 2 days before each exam)
    5. Output formatting with coverage stats and warnings
    """
    if not req.exams:
        raise HTTPException(status_code=400, detail="At least one exam is required.")
    if not req.topic_details:
        raise HTTPException(status_code=400, detail="At least one topic is required.")

    try:
        schedule, coverage_stats, warnings = generate_schedule(
            student_id=req.student_id,
            exams=req.exams,
            student_profile=req.student_profile,
            topic_details=req.topic_details,
            quiz_gaps=req.quiz_gaps,
            start_date=req.start_date,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Scheduler error: {str(e)}")

    return GenerateScheduleResponse(
        schedule=schedule,
        coverage_stats=coverage_stats,
        warnings=warnings,
        generated_at=datetime.now(timezone.utc).isoformat(),
    )


# ── POST /api/ai/scheduler/replan ────────────────────────────────────────────
@router.post("/replan", response_model=ReplanResponse)
def replan(req: ReplanRequest):
    """
    Regenerate the study schedule from the current date, adapting to
    changes in the student's situation:

    • completed_early : Compress remaining topics into fewer days
    • fell_behind     : Boost urgency so critical topics surface first
    • stress_high     : Reduce daily load by 1 slot for recovery
    • manual          : Clean regeneration with current state
    """
    if not req.exams:
        raise HTTPException(status_code=400, detail="Exam list required for replan.")
    if not req.topic_details:
        raise HTTPException(status_code=400, detail="Topic details required for replan.")

    profile = req.student_profile
    if profile is None:
        from models.scheduler_models import StudentProfile
        profile = StudentProfile()

    try:
        schedule, coverage_stats, warnings, adjustments = replan_schedule(
            student_id=req.student_id,
            completed_topic_ids=req.completed_topic_ids,
            skipped_sessions=req.skipped_sessions,
            current_date=req.current_date,
            reason=req.reason,
            exams=req.exams,
            student_profile=profile,
            topic_details=req.topic_details,
            quiz_gaps=req.quiz_gaps,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Replan error: {str(e)}")

    return ReplanResponse(
        schedule=schedule,
        coverage_stats=coverage_stats,
        warnings=warnings,
        replan_reason=req.reason,
        adjustments_made=adjustments,
        generated_at=datetime.now(timezone.utc).isoformat(),
    )
