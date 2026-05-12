"""
Phase 5.6 — Auto Stress Check Cron Job

Background scheduler that automatically runs:
  1. Nightly stress checks at 9:00 PM
  2. Digital twin iSVD batch update at midnight
  3. Daily reward reset at 00:01 AM

Uses APScheduler (AsyncIOScheduler) integrated with FastAPI's event loop.
"""

import os
import json
import logging
from datetime import datetime, timedelta

import httpx
import psycopg2
import psycopg2.extras
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from services.behavioral_pipeline_service import BehavioralPipelineService
from models.lstm_stress_model import StressModelManager

logger = logging.getLogger("cron_service")
logger.setLevel(logging.INFO)

DATABASE_URL = os.getenv("DATABASE_URL", "postgres://user:password@postgres:5432/mindtwin_db")
NOTIFICATION_SERVICE_URL = os.getenv("NOTIFICATION_SERVICE_URL", "http://notification-service:3007")
REWARD_SERVICE_URL = os.getenv("REWARD_SERVICE_URL", "http://reward-service:3006")
AI_ENGINE_URL = os.getenv("AI_ENGINE_URL", "http://ai-engine:8000")
ANALYTICS_SERVICE_URL = os.getenv("ANALYTICS_SERVICE_URL", "http://analytics-service:3008")
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "internal-secret")


def _get_db():
    """Create a new PostgreSQL connection."""
    return psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)


def _get_active_student_ids() -> list[str]:
    """
    Query PostgreSQL for all student_ids where:
      - onboarding_completed = true
      - last session was within the past 7 days (active students only)
    """
    try:
        conn = _get_db()
        cur = conn.cursor()
        cur.execute("""
            SELECT DISTINCT s.id::text AS student_id
            FROM students s
            WHERE s.onboarding_completed = true
              AND EXISTS (
                  SELECT 1 FROM study_sessions ss
                  WHERE ss.student_id = s.id
                    AND ss.created_at >= NOW() - INTERVAL '7 days'
              )
        """)
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return [row["student_id"] for row in rows]
    except Exception as e:
        logger.error(f"Failed to fetch active student IDs: {e}")
        return []


def _generate_contextual_message(stress_drivers: list[str]) -> str:
    """Generate a contextual notification body based on identified stress drivers."""
    if not stress_drivers:
        return "Take a moment to check in with yourself tonight. You matter."

    messages = {
        "exam_pressure": "Exams are approaching — remember, steady preparation beats last-minute cramming.",
        "low_mood": "Your mood has been low recently. It's okay to take a step back and breathe.",
        "late_nights": "You've been staying up late. A good night's sleep can make all the difference.",
        "high_study_hours": "You've been studying hard. Don't forget to give your mind a rest.",
        "low_completion": "Feeling behind on your plan? Focus on one topic at a time — progress is progress.",
        "high_social_media": "Screen time has been high. Try a short walk or stretch instead.",
        "no_quizzes": "You haven't taken any quizzes recently. A quick self-test can boost confidence.",
    }

    parts = [messages.get(d, "") for d in stress_drivers if d in messages]
    if parts:
        return " ".join(parts[:2])  # At most 2 driver messages
    return "Take a moment to check in with yourself tonight. You matter."


def _identify_stress_drivers(feature_vector: list[float]) -> list[str]:
    """Identify which behavioral signals are contributing to stress."""
    drivers = []
    if len(feature_vector) < 12:
        return drivers

    if feature_vector[7] <= 7:   # days_to_next_exam
        drivers.append("exam_pressure")
    if feature_vector[4] <= 2:   # mood_score
        drivers.append("low_mood")
    if feature_vector[10] == 1:  # late_night_sessions
        drivers.append("late_nights")
    if feature_vector[0] > 8:    # study_hours
        drivers.append("high_study_hours")
    if feature_vector[8] < 0.3:  # topics_completed_ratio
        drivers.append("low_completion")
    if feature_vector[5] > 180:  # social_media_mins
        drivers.append("high_social_media")
    if feature_vector[3] == 0 and feature_vector[7] <= 7:  # no quizzes near exam
        drivers.append("no_quizzes")

    return drivers


# ─── Job 1: Nightly Stress Checks ─────────────────────────────────────────────

async def run_nightly_stress_checks():
    """
    Runs every night at 9pm for all active students.

    Steps:
    1. Query PostgreSQL: get all student_ids where onboarding_completed = true
       AND last session was within 7 days (active students only)
    2. For each student:
       a. Extract behavioral window
       b. Run stress prediction
       c. If severity is "high" or "critical":
          - Save to stress_logs
          - Create notification via notification service
          - Title: "Check in with yourself tonight"
          - Body: generate contextual message based on stress drivers
    3. Log summary: {students_checked, high_stress_count, notifications_sent}
    """
    logger.info("🌙 Starting nightly stress checks...")
    start_time = datetime.now()

    student_ids = _get_active_student_ids()
    students_checked = 0
    high_stress_count = 0
    notifications_sent = 0

    pipeline = BehavioralPipelineService()
    model = StressModelManager.get_instance()
    today = datetime.now().strftime("%Y-%m-%d")

    for student_id in student_ids:
        try:
            # a. Extract behavioral window
            window = pipeline.extract_window(student_id, today, 14)

            # b. Run stress prediction
            predictions = model.predict(window)
            severity = predictions["severity_tomorrow"]
            students_checked += 1

            # c. If high or critical stress
            if severity in ("high", "critical"):
                high_stress_count += 1

                # Save to stress_logs
                try:
                    conn = _get_db()
                    cur = conn.cursor()
                    snapshot = json.dumps(predictions)
                    cur.execute("""
                        INSERT INTO stress_logs
                        (student_id, stress_score, severity, behavioral_snapshot, intervention_triggered)
                        VALUES (%s, %s, %s, %s, %s)
                    """, (
                        student_id,
                        predictions["stress_tomorrow"],
                        severity,
                        snapshot,
                        "cron_nightly_check"
                    ))
                    conn.commit()
                    cur.close()
                    conn.close()
                except Exception as db_err:
                    logger.error(f"DB error saving stress log for {student_id}: {db_err}")

                # Extract latest raw features for driver analysis
                raw_features = pipeline.extract_daily_features(student_id, today)
                stress_drivers = _identify_stress_drivers(raw_features["feature_vector"])
                body_message = _generate_contextual_message(stress_drivers)

                # Create notification via notification service
                try:
                    async with httpx.AsyncClient(timeout=10.0) as client:
                        await client.post(
                            f"{NOTIFICATION_SERVICE_URL}/api/notifications/send",
                            json={
                                "student_id": student_id,
                                "title": "Check in with yourself tonight",
                                "body": body_message,
                                "type": "stress_alert",
                                "severity": severity,
                                "metadata": {
                                    "stress_score": predictions["stress_tomorrow"],
                                    "drivers": stress_drivers,
                                    "source": "cron_nightly_check"
                                }
                            },
                            headers={"x-api-key": INTERNAL_API_KEY}
                        )
                    notifications_sent += 1
                except Exception as notif_err:
                    logger.error(f"Failed to send notification for {student_id}: {notif_err}")

        except Exception as e:
            logger.error(f"Error processing stress check for {student_id}: {e}")

    elapsed = (datetime.now() - start_time).total_seconds()
    summary = {
        "job": "nightly_stress_checks",
        "students_checked": students_checked,
        "high_stress_count": high_stress_count,
        "notifications_sent": notifications_sent,
        "elapsed_seconds": round(elapsed, 2),
        "completed_at": datetime.now().isoformat()
    }
    logger.info(f"🌙 Nightly stress checks complete: {json.dumps(summary)}")
    return summary


# ─── Job 2: Nightly Twin Update Batch ─────────────────────────────────────────

async def run_twin_update_batch():
    """
    Runs every night at midnight.
    Performs nightly iSVD update of digital twin vectors for all active students.
    Calls POST /api/ai/twin/update for each student with aggregated daily data.
    """
    logger.info("🔄 Starting nightly twin update batch...")
    start_time = datetime.now()

    student_ids = _get_active_student_ids()
    updates_succeeded = 0
    updates_failed = 0

    for student_id in student_ids:
        try:
            # Aggregate the day's session data for this student
            conn = _get_db()
            cur = conn.cursor()

            # Get the most recent session from today
            cur.execute("""
                SELECT
                    COALESCE(SUM(duration_min), 0) AS total_duration_min,
                    COUNT(*) AS session_count,
                    AVG(mood_after) AS avg_mood,
                    BOOL_OR(completed) AS any_completed
                FROM study_sessions
                WHERE student_id = %s
                  AND created_at::date = CURRENT_DATE
            """, (student_id,))
            session_agg = cur.fetchone()

            # Get latest quiz data from today (if any)
            cur.execute("""
                SELECT topic_id, score_percent
                FROM quiz_attempts
                WHERE student_id = %s
                  AND created_at::date = CURRENT_DATE
                ORDER BY created_at DESC
                LIMIT 1
            """, (student_id,))
            quiz_row = cur.fetchone()

            cur.close()
            conn.close()

            if not session_agg or session_agg["session_count"] == 0:
                continue  # No activity today, skip

            # Build update payload
            session_data = {
                "duration_min": int(session_agg["total_duration_min"]),
                "topic_id": "aggregated_daily",
                "mood_after": int(session_agg["avg_mood"]) if session_agg["avg_mood"] else None,
                "completed": bool(session_agg["any_completed"]),
                "planned_duration_min": int(session_agg["total_duration_min"])
            }

            quiz_data = None
            if quiz_row:
                quiz_data = {
                    "topic_id": quiz_row["topic_id"],
                    "score_percent": float(quiz_row["score_percent"])
                }

            payload = {
                "student_id": student_id,
                "session_data": session_data,
            }
            if quiz_data:
                payload["quiz_data"] = quiz_data

            # Call the twin update endpoint
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    f"{AI_ENGINE_URL}/api/ai/twin/update",
                    json=payload,
                    headers={"x-api-key": INTERNAL_API_KEY}
                )
                if resp.status_code == 200:
                    updates_succeeded += 1
                else:
                    updates_failed += 1
                    logger.warning(f"Twin update failed for {student_id}: {resp.status_code} {resp.text}")

        except Exception as e:
            updates_failed += 1
            logger.error(f"Error updating twin for {student_id}: {e}")

    elapsed = (datetime.now() - start_time).total_seconds()
    summary = {
        "job": "twin_update_batch",
        "total_students": len(student_ids),
        "updates_succeeded": updates_succeeded,
        "updates_failed": updates_failed,
        "elapsed_seconds": round(elapsed, 2),
        "completed_at": datetime.now().isoformat()
    }
    logger.info(f"🔄 Twin update batch complete: {json.dumps(summary)}")
    return summary


# ─── Job 3: Daily Reward Reset ────────────────────────────────────────────────

async def run_daily_reward_reset():
    """
    Runs every day at 00:01 AM.
    Calls POST /api/reward/daily-reset to reset daily reward counters.
    """
    logger.info("🎁 Starting daily reward reset...")
    start_time = datetime.now()

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{REWARD_SERVICE_URL}/api/reward/daily-reset",
                headers={"x-api-key": INTERNAL_API_KEY}
            )
            success = resp.status_code == 200
            detail = resp.json() if success else resp.text
    except Exception as e:
        success = False
        detail = str(e)
        logger.error(f"Failed to call daily-reset: {e}")

    elapsed = (datetime.now() - start_time).total_seconds()
    summary = {
        "job": "daily_reward_reset",
        "success": success,
        "detail": detail,
        "elapsed_seconds": round(elapsed, 2),
        "completed_at": datetime.now().isoformat()
    }
    logger.info(f"🎁 Daily reward reset complete: {json.dumps(summary, default=str)}")
    return summary


# ─── Job 4: Weekly Digest Notifications ───────────────────────────────────────

async def run_weekly_digest_notifications():
    """
    Runs every Sunday at 18:00 (6 PM) IST.
    Calls the analytics-service internal endpoint which fans out weekly digest
    push notifications to all active students.
    """
    logger.info("📊 Starting weekly digest notifications...")
    start_time = datetime.now()

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{ANALYTICS_SERVICE_URL}/api/analytics/internal/weekly-digest-notify",
                headers={"x-api-key": INTERNAL_API_KEY}
            )
            success = resp.status_code == 200
            detail = resp.json() if success else resp.text
    except Exception as e:
        success = False
        detail = str(e)
        logger.error(f"Failed to trigger weekly digest notifications: {e}")

    elapsed = (datetime.now() - start_time).total_seconds()
    summary = {
        "job": "weekly_digest_notifications",
        "success": success,
        "detail": detail,
        "elapsed_seconds": round(elapsed, 2),
        "completed_at": datetime.now().isoformat()
    }
    logger.info(f"📊 Weekly digest notifications complete: {json.dumps(summary, default=str)}")
    return summary


# ─── Job 5: Weekly Digest with Email ──────────────────────────────────────────

async def run_weekly_digest():
    """
    Runs every Sunday at 18:00 (6 PM) IST.

    Steps:
    1. Get all active students (onboarding_completed = true, active in last 7 days)
    2. For each student:
       a. Call GET /api/ai/analytics/weekly-digest/{student_id}
       b. POST /api/notifications/send-weekly-digest with digest data
          → notification-service sends push + email (if email_verified)
    3. Log: { students_processed, push_sent, email_sent, errors }
    """
    logger.info("📧 Starting weekly digest (push + email)...")
    start_time = datetime.now()

    student_ids = _get_active_student_ids()
    students_processed = 0
    push_sent = 0
    email_sent = 0
    errors = 0

    for student_id in student_ids:
        try:
            # a. Fetch digest data from analytics router
            digest_data = None
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.get(
                        f"{AI_ENGINE_URL}/api/ai/analytics/weekly-digest/{student_id}"
                    )
                    if resp.status_code == 200:
                        digest_data = resp.json()
            except Exception as fetch_err:
                logger.warning(f"Could not fetch digest for {student_id}: {fetch_err}")

            # b. Send via notification-service (push + email)
            async with httpx.AsyncClient(timeout=15.0) as client:
                notif_resp = await client.post(
                    f"{NOTIFICATION_SERVICE_URL}/api/notifications/send-weekly-digest",
                    json={
                        "student_id": student_id,
                        "digest_data": digest_data or {},
                    },
                    headers={"x-api-key": INTERNAL_API_KEY}
                )

                if notif_resp.status_code == 200:
                    result = notif_resp.json()
                    students_processed += 1
                    if result.get("push_sent"):
                        push_sent += 1
                    if result.get("email_sent"):
                        email_sent += 1
                else:
                    errors += 1
                    logger.warning(
                        f"send-weekly-digest failed for {student_id}: "
                        f"{notif_resp.status_code} {notif_resp.text}"
                    )

        except Exception as e:
            errors += 1
            logger.error(f"Weekly digest error for {student_id}: {e}")

    elapsed = (datetime.now() - start_time).total_seconds()
    summary = {
        "job": "weekly_digest",
        "total_active_students": len(student_ids),
        "students_processed": students_processed,
        "push_sent": push_sent,
        "email_sent": email_sent,
        "errors": errors,
        "elapsed_seconds": round(elapsed, 2),
        "completed_at": datetime.now().isoformat(),
    }
    logger.info(f"📧 Weekly digest complete: {json.dumps(summary)}")
    return summary


# ─── Scheduler Setup ──────────────────────────────────────────────────────────

# Job registry for manual trigger lookups
JOB_REGISTRY = {
    "nightly_stress_checks":       run_nightly_stress_checks,
    "twin_update_batch":           run_twin_update_batch,
    "daily_reward_reset":          run_daily_reward_reset,
    "weekly_digest_notifications": run_weekly_digest_notifications,
    "weekly_digest":               run_weekly_digest,
}

# Initialize the scheduler
scheduler = AsyncIOScheduler(timezone="Asia/Kolkata")

scheduler.add_job(
    run_nightly_stress_checks,
    CronTrigger(hour=21, minute=0),
    id="nightly_stress_checks",
    name="Nightly Stress Checks",
    replace_existing=True,
)
scheduler.add_job(
    run_twin_update_batch,
    CronTrigger(hour=0, minute=0),
    id="twin_update_batch",
    name="Twin Update Batch",
    replace_existing=True,
)
scheduler.add_job(
    run_daily_reward_reset,
    CronTrigger(hour=0, minute=1),
    id="daily_reward_reset",
    name="Daily Reward Reset",
    replace_existing=True,
)
scheduler.add_job(
    run_weekly_digest_notifications,
    CronTrigger(day_of_week="sun", hour=18, minute=0),
    id="weekly_digest_notifications",
    name="Weekly Digest Notifications (push only)",
    replace_existing=True,
)
scheduler.add_job(
    run_weekly_digest,
    CronTrigger(day_of_week="sun", hour=18, minute=5),
    id="weekly_digest",
    name="Weekly Digest (push + email)",
    replace_existing=True,
)
