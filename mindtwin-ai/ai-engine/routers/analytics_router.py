"""
<<<<<<< HEAD
Analytics Router — Phase 8.2
==============================
FastAPI endpoints consumed by the analytics-service.

Endpoints:
  GET /api/ai/analytics/timeline/{student_id}?days=30
  GET /api/ai/analytics/mastery/{student_id}
  GET /api/ai/analytics/insights/{student_id}
  GET /api/ai/analytics/exam-readiness/{student_id}/{exam_id}
  GET /api/ai/analytics/weekly-digest/{student_id}
  GET /api/ai/analytics/twin-evolution/{student_id}
"""

import os
import json
import logging
from datetime import datetime, timedelta
from typing import Optional

import psycopg2
import psycopg2.extras
from fastapi import APIRouter, HTTPException, Query

=======
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

>>>>>>> cb4458a60e96d61275eb8dbf65c93cda4221c664
logger = logging.getLogger("analytics_router")

router = APIRouter(prefix="/api/ai/analytics", tags=["Analytics"])

<<<<<<< HEAD
DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgres://user:password@postgres:5432/mindtwin_db"
)


def _get_db():
    return psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)
=======
# Single shared instance — AnalyticsService is stateless
_svc = AnalyticsService()
>>>>>>> cb4458a60e96d61275eb8dbf65c93cda4221c664


# ── GET /api/ai/analytics/timeline/{student_id} ───────────────────────────────

@router.get("/timeline/{student_id}")
<<<<<<< HEAD
def get_timeline(student_id: str, days: int = Query(default=30, ge=1, le=365)):
    """
    Returns daily study activity for the past N days.
    Aggregates study_sessions by date: total duration, session count, topics covered.
    """
    try:
        conn = _get_db()
        cur = conn.cursor()

        cur.execute(
            """
            SELECT
                DATE(ss.created_at)                  AS study_date,
                COALESCE(SUM(ss.duration_min), 0)    AS total_duration_min,
                COUNT(*)                             AS session_count,
                COUNT(DISTINCT ss.topic_id)          AS topics_covered,
                ROUND(AVG(ss.mood_after)::numeric, 2) AS avg_mood
            FROM study_sessions ss
            WHERE ss.student_id = %s
              AND ss.created_at >= NOW() - (%s || ' days')::INTERVAL
            GROUP BY DATE(ss.created_at)
            ORDER BY study_date ASC
            """,
            (student_id, days),
        )
        sessions_by_day = [dict(row) for row in cur.fetchall()]

        # Convert date objects to ISO strings for JSON serialisation
        for row in sessions_by_day:
            if hasattr(row["study_date"], "isoformat"):
                row["study_date"] = row["study_date"].isoformat()

        # Build a zero-filled series so the frontend can render a continuous chart
        date_map = {row["study_date"]: row for row in sessions_by_day}
        full_series = []
        for i in range(days):
            d = (datetime.now() - timedelta(days=days - 1 - i)).strftime("%Y-%m-%d")
            full_series.append(
                date_map.get(
                    d,
                    {
                        "study_date": d,
                        "total_duration_min": 0,
                        "session_count": 0,
                        "topics_covered": 0,
                        "avg_mood": None,
                    },
                )
            )

        # Total stats for the period
        cur.execute(
            """
            SELECT
                COALESCE(SUM(duration_min), 0)   AS total_mins,
                COUNT(*)                         AS total_sessions,
                COUNT(DISTINCT topic_id)         AS unique_topics
            FROM study_sessions
            WHERE student_id = %s
              AND created_at >= NOW() - (%s || ' days')::INTERVAL
            """,
            (student_id, days),
        )
        totals = dict(cur.fetchone() or {})

        cur.close()
        conn.close()

        return {
            "student_id": student_id,
            "days": days,
            "timeline": full_series,
            "totals": totals,
        }

    except Exception as e:
        logger.error(f"Timeline error for {student_id}: {e}")
=======
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
>>>>>>> cb4458a60e96d61275eb8dbf65c93cda4221c664
        raise HTTPException(status_code=500, detail=str(e))


# ── GET /api/ai/analytics/mastery/{student_id} ────────────────────────────────

@router.get("/mastery/{student_id}")
<<<<<<< HEAD
def get_mastery(student_id: str):
    """
    Returns per-subject mastery derived from quiz theta estimates.
    Mastery score = normalised average IRT theta (0–100 scale).
    """
    try:
        conn = _get_db()
        cur = conn.cursor()

        cur.execute(
            """
            SELECT
                t.subject,
                COUNT(DISTINCT qa.topic_id)                          AS topics_attempted,
                ROUND(AVG(qa.theta_estimate)::numeric, 4)            AS avg_theta,
                ROUND(AVG(qa.score_percent)::numeric, 2)             AS avg_score_percent,
                COUNT(qa.id)                                         AS total_attempts,
                BOOL_OR(qa.gap_detected)                             AS has_gaps,
                MAX(qa.created_at)                                   AS last_attempt_at
            FROM quiz_attempts qa
            JOIN topics t ON t.id = qa.topic_id
            WHERE qa.student_id = %s
            GROUP BY t.subject
            ORDER BY t.subject
            """,
            (student_id,),
        )
        rows = [dict(r) for r in cur.fetchall()]

        # Normalise theta (-3..+3) to mastery score (0..100)
        for row in rows:
            theta = float(row["avg_theta"] or 0)
            row["mastery_score"] = round(min(100, max(0, (theta + 3) / 6 * 100)), 1)
            if row.get("last_attempt_at") and hasattr(row["last_attempt_at"], "isoformat"):
                row["last_attempt_at"] = row["last_attempt_at"].isoformat()

        cur.close()
        conn.close()

        return {"student_id": student_id, "subjects": rows}

    except Exception as e:
        logger.error(f"Mastery error for {student_id}: {e}")
=======
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
>>>>>>> cb4458a60e96d61275eb8dbf65c93cda4221c664
        raise HTTPException(status_code=500, detail=str(e))


# ── GET /api/ai/analytics/insights/{student_id} ───────────────────────────────

@router.get("/insights/{student_id}")
<<<<<<< HEAD
def get_insights(student_id: str):
    """
    Generates behavioural pattern insights from the student's recent activity.
    Returns a list of insight objects with id, type, title, body, severity.
    """
    try:
        conn = _get_db()
        cur = conn.cursor()

        # Gather signals
        cur.execute(
            """
            SELECT
                COALESCE(SUM(duration_min), 0)  AS total_mins_7d,
                COUNT(*)                        AS sessions_7d,
                ROUND(AVG(mood_after)::numeric, 2) AS avg_mood_7d
            FROM study_sessions
            WHERE student_id = %s
              AND created_at >= NOW() - INTERVAL '7 days'
            """,
            (student_id,),
        )
        session_stats = dict(cur.fetchone() or {})

        cur.execute(
            """
            SELECT COUNT(*) AS quiz_count_7d,
                   ROUND(AVG(score_percent)::numeric, 2) AS avg_score_7d,
                   BOOL_OR(gap_detected) AS any_gaps
            FROM quiz_attempts
            WHERE student_id = %s
              AND created_at >= NOW() - INTERVAL '7 days'
            """,
            (student_id,),
        )
        quiz_stats = dict(cur.fetchone() or {})

        cur.execute(
            """
            SELECT MIN(exam_date) AS next_exam_date
            FROM exams
            WHERE student_id = %s AND exam_date >= CURRENT_DATE
            """,
            (student_id,),
        )
        exam_row = cur.fetchone()
        next_exam_date = exam_row["next_exam_date"] if exam_row else None

        cur.close()
        conn.close()

        insights = []
        now_iso = datetime.now().isoformat()

        total_mins = float(session_stats.get("total_mins_7d") or 0)
        sessions_7d = int(session_stats.get("sessions_7d") or 0)
        avg_mood = float(session_stats.get("avg_mood_7d") or 3)
        quiz_count = int(quiz_stats.get("quiz_count_7d") or 0)
        avg_score = float(quiz_stats.get("avg_score_7d") or 0)
        any_gaps = bool(quiz_stats.get("any_gaps"))

        # Insight: low study time
        if total_mins < 120 and sessions_7d < 3:
            insights.append({
                "id": f"low_study_{student_id}_7d",
                "type": "study_habit",
                "title": "Study time is low this week",
                "body": f"You've studied only {int(total_mins)} minutes across {sessions_7d} sessions in the past 7 days. Aim for at least 30 minutes daily.",
                "severity": "warning",
                "generated_at": now_iso,
            })

        # Insight: low mood
        if avg_mood < 2.5:
            insights.append({
                "id": f"low_mood_{student_id}_7d",
                "type": "wellbeing",
                "title": "Your mood has been low",
                "body": "Your average mood after study sessions has been below average. Consider shorter, more focused sessions and take breaks.",
                "severity": "info",
                "generated_at": now_iso,
            })

        # Insight: knowledge gaps detected
        if any_gaps:
            insights.append({
                "id": f"gaps_detected_{student_id}_7d",
                "type": "knowledge_gap",
                "title": "Knowledge gaps detected",
                "body": f"Recent quizzes show gaps in some topics (avg score: {avg_score:.0f}%). Your study plan has been updated to address these.",
                "severity": "warning",
                "generated_at": now_iso,
            })

        # Insight: exam approaching
        if next_exam_date:
            days_to_exam = (next_exam_date - datetime.now().date()).days
            if 0 < days_to_exam <= 14:
                insights.append({
                    "id": f"exam_approaching_{student_id}",
                    "type": "exam_prep",
                    "title": f"Exam in {days_to_exam} days",
                    "body": f"Your next exam is on {next_exam_date.isoformat()}. Focus on weak topics and take practice quizzes daily.",
                    "severity": "critical" if days_to_exam <= 3 else "warning",
                    "generated_at": now_iso,
                })

        # Insight: strong performance
        if avg_score >= 80 and quiz_count >= 3:
            insights.append({
                "id": f"strong_performance_{student_id}_7d",
                "type": "positive",
                "title": "Great quiz performance this week",
                "body": f"You're averaging {avg_score:.0f}% across {quiz_count} quizzes. Keep up the momentum!",
                "severity": "success",
                "generated_at": now_iso,
            })

        return {"student_id": student_id, "insights": insights}

    except Exception as e:
        logger.error(f"Insights error for {student_id}: {e}")
=======
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
>>>>>>> cb4458a60e96d61275eb8dbf65c93cda4221c664
        raise HTTPException(status_code=500, detail=str(e))


# ── GET /api/ai/analytics/exam-readiness/{student_id}/{exam_id} ───────────────

@router.get("/exam-readiness/{student_id}/{exam_id}")
def get_exam_readiness(student_id: str, exam_id: str):
    """
<<<<<<< HEAD
    Computes an exam readiness score (0–100) based on:
    - Average quiz score for the exam's subject
    - Topics completed vs total topics for the subject
    - Days remaining until exam
    """
    try:
        conn = _get_db()
        cur = conn.cursor()

        # Fetch exam details
        cur.execute(
            "SELECT subject, exam_date FROM exams WHERE id = %s AND student_id = %s",
            (exam_id, student_id),
        )
        exam = cur.fetchone()
        if not exam:
            raise HTTPException(status_code=404, detail="Exam not found")

        subject = exam["subject"]
        exam_date = exam["exam_date"]
        days_remaining = max(0, (exam_date - datetime.now().date()).days)

        # Quiz performance for this subject
        cur.execute(
            """
            SELECT ROUND(AVG(qa.score_percent)::numeric, 2) AS avg_score,
                   COUNT(qa.id) AS attempts,
                   BOOL_OR(qa.gap_detected) AS has_gaps
            FROM quiz_attempts qa
            JOIN topics t ON t.id = qa.topic_id
            WHERE qa.student_id = %s AND t.subject ILIKE %s
            """,
            (student_id, subject),
        )
        quiz_row = dict(cur.fetchone() or {})

        # Topic completion for this subject
        cur.execute(
            """
            SELECT
                COUNT(DISTINCT t.id) AS total_topics,
                COUNT(DISTINCT CASE WHEN ss.completed = true THEN ss.topic_id END) AS completed_topics
            FROM topics t
            LEFT JOIN study_sessions ss ON ss.topic_id = t.id AND ss.student_id = %s
            WHERE t.subject ILIKE %s
            """,
            (student_id, subject),
        )
        topic_row = dict(cur.fetchone() or {})

        # Weak topics (gap_detected = true)
        cur.execute(
            """
            SELECT DISTINCT t.topic_name, qa.score_percent
            FROM quiz_attempts qa
            JOIN topics t ON t.id = qa.topic_id
            WHERE qa.student_id = %s AND t.subject ILIKE %s AND qa.gap_detected = true
            ORDER BY qa.score_percent ASC
            LIMIT 5
            """,
            (student_id, subject),
        )
        weak_topics = [dict(r) for r in cur.fetchall()]

        cur.close()
        conn.close()

        avg_score = float(quiz_row.get("avg_score") or 50)
        total_topics = int(topic_row.get("total_topics") or 1)
        completed_topics = int(topic_row.get("completed_topics") or 0)
        completion_ratio = completed_topics / total_topics if total_topics > 0 else 0

        # Readiness formula: weighted blend of quiz score + completion + time factor
        time_factor = min(1.0, days_remaining / 30)  # more time = slightly higher readiness
        readiness_score = round(
            (avg_score * 0.5) + (completion_ratio * 100 * 0.4) + (time_factor * 10), 1
        )
        readiness_score = min(100, max(0, readiness_score))

        # Grade prediction
        if readiness_score >= 85:
            predicted_grade = "A"
        elif readiness_score >= 70:
            predicted_grade = "B"
        elif readiness_score >= 55:
            predicted_grade = "C"
        else:
            predicted_grade = "D"

        recommended_actions = []
        if completion_ratio < 0.7:
            recommended_actions.append("Complete remaining topics before the exam")
        if quiz_row.get("has_gaps"):
            recommended_actions.append("Revisit topics where gaps were detected")
        if days_remaining <= 7:
            recommended_actions.append("Take daily practice quizzes to reinforce memory")
        if avg_score < 60:
            recommended_actions.append("Focus on understanding core concepts, not just memorisation")

        return {
            "student_id": student_id,
            "exam_id": exam_id,
            "subject": subject,
            "exam_date": exam_date.isoformat() if hasattr(exam_date, "isoformat") else str(exam_date),
            "days_remaining": days_remaining,
            "readiness_score": readiness_score,
            "predicted_grade": predicted_grade,
            "avg_quiz_score": avg_score,
            "topics_completed": completed_topics,
            "total_topics": total_topics,
            "completion_percent": round(completion_ratio * 100, 1),
            "weak_topics": weak_topics,
            "recommended_actions": recommended_actions,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Exam readiness error for {student_id}/{exam_id}: {e}")
=======
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
>>>>>>> cb4458a60e96d61275eb8dbf65c93cda4221c664
        raise HTTPException(status_code=500, detail=str(e))


# ── GET /api/ai/analytics/weekly-digest/{student_id} ─────────────────────────

@router.get("/weekly-digest/{student_id}")
def get_weekly_digest(student_id: str):
    """
<<<<<<< HEAD
    Generates a weekly summary of the student's study activity.
    """
    try:
        conn = _get_db()
        cur = conn.cursor()

        # Study stats for the past 7 days
        cur.execute(
            """
            SELECT
                COALESCE(SUM(duration_min), 0)       AS total_mins,
                COUNT(*)                             AS total_sessions,
                COUNT(DISTINCT topic_id)             AS unique_topics,
                COUNT(DISTINCT DATE(created_at))     AS active_days,
                ROUND(AVG(mood_after)::numeric, 2)   AS avg_mood
            FROM study_sessions
            WHERE student_id = %s
              AND created_at >= NOW() - INTERVAL '7 days'
            """,
            (student_id,),
        )
        study_stats = dict(cur.fetchone() or {})

        # Quiz stats for the past 7 days
        cur.execute(
            """
            SELECT
                COUNT(*)                                AS quiz_count,
                ROUND(AVG(score_percent)::numeric, 2)  AS avg_score,
                COUNT(DISTINCT topic_id)               AS topics_quizzed
            FROM quiz_attempts
            WHERE student_id = %s
              AND created_at >= NOW() - INTERVAL '7 days'
            """,
            (student_id,),
        )
        quiz_stats = dict(cur.fetchone() or {})

        # Top subjects by study time this week
        cur.execute(
            """
            SELECT t.subject, COALESCE(SUM(ss.duration_min), 0) AS mins
            FROM study_sessions ss
            JOIN topics t ON t.id = ss.topic_id
            WHERE ss.student_id = %s
              AND ss.created_at >= NOW() - INTERVAL '7 days'
            GROUP BY t.subject
            ORDER BY mins DESC
            LIMIT 3
            """,
            (student_id,),
        )
        top_subjects = [dict(r) for r in cur.fetchall()]

        # Study streak (consecutive days with at least one session)
        cur.execute(
            """
            SELECT DATE(created_at) AS study_date
            FROM study_sessions
            WHERE student_id = %s
            GROUP BY DATE(created_at)
            ORDER BY study_date DESC
            LIMIT 30
            """,
            (student_id,),
        )
        streak_dates = [row["study_date"] for row in cur.fetchall()]
        streak = 0
        today = datetime.now().date()
        for i, d in enumerate(streak_dates):
            if d == today - timedelta(days=i):
                streak += 1
            else:
                break

        cur.close()
        conn.close()

        total_mins = int(study_stats.get("total_mins") or 0)
        active_days = int(study_stats.get("active_days") or 0)
        avg_score = float(quiz_stats.get("avg_score") or 0)

        # Build a human-readable summary
        if total_mins == 0:
            week_summary = "No study sessions recorded this week. Start small — even 20 minutes a day makes a difference."
        elif active_days >= 5:
            week_summary = f"Excellent week! You studied {total_mins} minutes across {active_days} days. Keep the streak going!"
        elif active_days >= 3:
            week_summary = f"Good effort this week — {total_mins} minutes over {active_days} days. Try to add one more session tomorrow."
        else:
            week_summary = f"You studied {total_mins} minutes this week. Consistency is key — aim for at least 4 days next week."

        return {
            "student_id": student_id,
            "week_summary": week_summary,
            "study_stats": study_stats,
            "quiz_stats": quiz_stats,
            "top_subjects": top_subjects,
            "study_streak": streak,
            "generated_at": datetime.now().isoformat(),
        }

    except Exception as e:
        logger.error(f"Weekly digest error for {student_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── GET /api/ai/analytics/twin-evolution/{student_id} ────────────────────────

@router.get("/twin-evolution/{student_id}")
def get_twin_evolution(student_id: str):
    """
    Returns the current twin vector with dimensional labels for visualisation.
    Since we don't store historical snapshots yet, we return the current vector
    with metadata about what each dimension represents.
    """
    try:
        conn = _get_db()
        cur = conn.cursor()

        cur.execute(
            """
            SELECT twin_vector, behavioral_features, peer_cluster_id, last_updated
            FROM digital_twins WHERE student_id = %s
            """,
            (student_id,),
        )
        row = cur.fetchone()
        cur.close()
        conn.close()

        if not row:
            raise HTTPException(status_code=404, detail="Digital twin not found")

        twin_vector = json.loads(row["twin_vector"]) if row["twin_vector"] else []
        bf = row["behavioral_features"] if row["behavioral_features"] else {}
        last_updated = row["last_updated"].isoformat() if row["last_updated"] else None

        # Dimension labels for the first 16 dimensions (human-readable for charts)
        DIMENSION_LABELS = [
            "Study Consistency", "Quiz Performance", "Topic Breadth", "Session Depth",
            "Mood Stability", "Exam Readiness", "Gap Recovery", "Peer Similarity",
            "Focus Duration", "Revision Frequency", "Concept Mastery", "Practice Intensity",
            "Stress Resilience", "Learning Velocity", "Retention Rate", "Engagement Score",
        ]

        labelled_dims = []
        for i, val in enumerate(twin_vector[:16]):
            labelled_dims.append({
                "dimension": i,
                "label": DIMENSION_LABELS[i] if i < len(DIMENSION_LABELS) else f"Dim {i}",
                "value": round(float(val), 4),
                "normalised": round(min(1.0, max(0.0, float(val))), 4),
            })

        return {
            "student_id": student_id,
            "twin_vector_length": len(twin_vector),
            "labelled_dimensions": labelled_dims,
            "behavioral_features": bf,
            "peer_cluster_id": row["peer_cluster_id"],
            "last_updated": last_updated,
            # Placeholder for future historical snapshots
            "snapshots": [],
            "dimension_trends": [],
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Twin evolution error for {student_id}: {e}")
=======
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
>>>>>>> cb4458a60e96d61275eb8dbf65c93cda4221c664
        raise HTTPException(status_code=500, detail=str(e))
