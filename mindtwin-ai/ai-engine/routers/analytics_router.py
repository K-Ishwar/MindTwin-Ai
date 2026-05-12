"""
analytics_router.py — MindTwin AI Engine
=========================================
Exposes all analytics endpoints.

All routes are prefixed /api/ai/analytics.
Authentication is handled at the API gateway / Node services level;
the AI engine trusts internal calls.
"""

import logging
from fastapi import APIRouter, HTTPException, Query

from services.analytics_service import AnalyticsService

logger = logging.getLogger("analytics_router")

router = APIRouter(prefix="/api/ai/analytics", tags=["Analytics"])

# Single shared instance — AnalyticsService is stateless
_svc = AnalyticsService()


# ── GET /api/ai/analytics/timeline/{student_id} ───────────────────────────────

@router.get("/timeline/{student_id}")
def get_performance_timeline(
    student_id: str,
    days: int = Query(default=30, ge=7, le=90, description="Number of days to look back"),
):
    """
    Day-by-day performance timeline for the past N days.

    Returns study hours, sessions, quiz scores, mood, stress, tokens,
    and topics covered for each day, plus a summary.
    """
    try:
        result = _svc.get_student_performance_timeline(student_id, days)
        return {"success": True, **result}
    except Exception as e:
        logger.error(f"[timeline] {student_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── GET /api/ai/analytics/mastery/{student_id} ────────────────────────────────

@router.get("/mastery/{student_id}")
def get_subject_mastery(student_id: str):
    """
    Per-subject mastery breakdown.

    Returns mastery tiers (mastered / in_progress / needs_work),
    avg theta, predicted exam score, and time invested per subject.
    """
    try:
        result = _svc.get_subject_mastery_breakdown(student_id)
        return {"success": True, **result}
    except Exception as e:
        logger.error(f"[mastery] {student_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── GET /api/ai/analytics/twin-evolution/{student_id} ────────────────────────

@router.get("/twin-evolution/{student_id}")
def get_twin_evolution(
    student_id: str,
    days: int = Query(default=30, ge=7, le=90),
):
    """
    Digital twin vector evolution over time.

    Tracks performance, consistency, stress, pace, and overall ability
    dimensions. Includes peer comparison and growth summary.
    """
    try:
        result = _svc.get_twin_vector_evolution(student_id, days)
        return {"success": True, **result}
    except Exception as e:
        logger.error(f"[twin_evolution] {student_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── GET /api/ai/analytics/insights/{student_id} ───────────────────────────────

@router.get("/insights/{student_id}")
def get_study_insights(student_id: str):
    """
    Behavioural pattern insights.

    Analyses peak productivity windows, optimal session length,
    social media impact, mood-performance correlation, and subject rotation.
    Each insight includes a headline, detail, recommendation, and confidence level.
    """
    try:
        result = _svc.get_study_pattern_insights(student_id)
        return {"success": True, **result}
    except Exception as e:
        logger.error(f"[insights] {student_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── GET /api/ai/analytics/exam-readiness/{student_id}/{exam_id} ───────────────

@router.get("/exam-readiness/{student_id}/{exam_id}")
def get_exam_readiness(student_id: str, exam_id: str):
    """
    Composite exam readiness score for one upcoming exam.

    Components: syllabus coverage (40%), mastery (35%),
    study consistency (15%), stress adjustment (10%).
    Returns readiness label, critical gaps, recommended daily hours,
    and predicted performance range.
    """
    try:
        result = _svc.get_exam_readiness_score(student_id, exam_id)
        if "error" in result:
            raise HTTPException(status_code=404, detail=result["error"])
        return {"success": True, **result}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[exam_readiness] {student_id}/{exam_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── GET /api/ai/analytics/weekly-digest/{student_id} ─────────────────────────

@router.get("/weekly-digest/{student_id}")
def get_weekly_digest(student_id: str):
    """
    Comprehensive weekly performance digest.

    Compares this week vs last week, surfaces top achievement,
    biggest challenge, personalised recommendation, and exam progress.
    Used for weekly notification/email summaries.
    """
    try:
        result = _svc.generate_weekly_digest(student_id)
        return {"success": True, **result}
    except Exception as e:
        logger.error(f"[weekly_digest] {student_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
