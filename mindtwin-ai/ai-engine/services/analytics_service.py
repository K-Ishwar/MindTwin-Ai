"""
analytics_service.py — MindTwin AI Engine
==========================================
Computes all analytics aggregations that power student dashboards.

All DB queries run against PostgreSQL via psycopg2.
The service is stateless — instantiate once and call methods freely.
"""

import os
import json
import logging
from datetime import datetime, timedelta, date
from typing import Optional

import numpy as np
import psycopg2
import psycopg2.extras

logger = logging.getLogger("analytics_service")

DATABASE_URL = os.getenv("DATABASE_URL", "postgres://user:password@postgres:5432/mindtwin_db")


def _get_db():
    return psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)


def _date_range(days: int) -> list[str]:
    """Return a list of ISO date strings for the past `days` days (oldest first)."""
    today = date.today()
    return [(today - timedelta(days=days - 1 - i)).isoformat() for i in range(days)]


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


# ─────────────────────────────────────────────────────────────────────────────
class AnalyticsService:
    # ── 1. Performance Timeline ───────────────────────────────────────────────

    def get_student_performance_timeline(self, student_id: str, days: int = 30) -> dict:
        """
        Day-by-day performance timeline for the past N days.

        For each day returns:
          date, study_hours, sessions_completed, sessions_skipped,
          avg_quiz_score, mood_avg, stress_score, tokens_earned, topics_covered
        """
        since = (date.today() - timedelta(days=days)).isoformat()
        dates = _date_range(days)

        try:
            conn = _get_db()
            cur = conn.cursor()

            # Study sessions per day
            cur.execute("""
                SELECT
                    DATE(started_at)                                        AS day,
                    ROUND(SUM(actual_duration_min) / 60.0, 2)              AS study_hours,
                    COUNT(*) FILTER (WHERE completed = TRUE)               AS completed,
                    COUNT(*) FILTER (WHERE skipped = TRUE)                 AS skipped
                FROM study_sessions
                WHERE student_id = %s AND started_at >= %s
                GROUP BY day
            """, (student_id, since))
            session_rows = {str(r["day"]): r for r in cur.fetchall()}

            # Quiz scores per day
            cur.execute("""
                SELECT
                    DATE(completed_at)                          AS day,
                    ROUND(AVG(score_percent)::numeric, 2)       AS avg_score
                FROM quiz_attempts
                WHERE student_id = %s AND completed_at >= %s
                GROUP BY day
            """, (student_id, since))
            quiz_rows = {str(r["day"]): float(r["avg_score"]) for r in cur.fetchall()}

            # Mood per day
            cur.execute("""
                SELECT
                    DATE(logged_at)                             AS day,
                    ROUND(AVG(mood_score)::numeric, 2)          AS avg_mood
                FROM mood_logs
                WHERE student_id = %s AND logged_at >= %s
                GROUP BY day
            """, (student_id, since))
            mood_rows = {str(r["day"]): float(r["avg_mood"]) for r in cur.fetchall()}

            # Stress per day (latest per day)
            cur.execute("""
                SELECT DISTINCT ON (DATE(logged_at))
                    DATE(logged_at)  AS day,
                    stress_score
                FROM stress_logs
                WHERE student_id = %s AND logged_at >= %s
                ORDER BY DATE(logged_at), logged_at DESC
            """, (student_id, since))
            stress_rows = {str(r["day"]): float(r["stress_score"]) for r in cur.fetchall()}

            # Tokens earned per day
            cur.execute("""
                SELECT
                    DATE(created_at)                            AS day,
                    COALESCE(SUM(tokens_delta) FILTER (WHERE tokens_delta > 0), 0) AS tokens
                FROM token_history
                WHERE student_id = %s AND created_at >= %s
                GROUP BY day
            """, (student_id, since))
            token_rows = {str(r["day"]): int(r["tokens"]) for r in cur.fetchall()}

            # Topics covered per day
            cur.execute("""
                SELECT
                    DATE(ss.started_at)         AS day,
                    ARRAY_AGG(DISTINCT t.topic_name) AS topics
                FROM study_sessions ss
                JOIN topics t ON t.id = ss.topic_id
                WHERE ss.student_id = %s AND ss.started_at >= %s AND ss.completed = TRUE
                GROUP BY day
            """, (student_id, since))
            topic_rows = {str(r["day"]): list(r["topics"]) for r in cur.fetchall()}

            cur.close()
            conn.close()
        except Exception as e:
            logger.error(f"[timeline] DB error for {student_id}: {e}")
            return {"timeline": [], "summary": {}}

        # Build day-by-day list
        timeline = []
        all_hours, all_scores, all_moods = [], [], []

        for d in dates:
            sr = session_rows.get(d, {})
            study_hours = float(sr.get("study_hours") or 0)
            completed   = int(sr.get("completed") or 0)
            skipped     = int(sr.get("skipped") or 0)
            quiz_score  = quiz_rows.get(d)
            mood        = mood_rows.get(d)
            stress      = stress_rows.get(d)
            tokens      = token_rows.get(d, 0)
            topics      = topic_rows.get(d, [])

            timeline.append({
                "date":               d,
                "study_hours":        study_hours,
                "sessions_completed": completed,
                "sessions_skipped":   skipped,
                "avg_quiz_score":     quiz_score,
                "mood_avg":           mood,
                "stress_score":       stress,
                "tokens_earned":      tokens,
                "topics_covered":     topics,
            })

            if study_hours > 0:
                all_hours.append(study_hours)
            if quiz_score is not None:
                all_scores.append(quiz_score)
            if mood is not None:
                all_moods.append(mood)

        # Summary
        total_hours       = round(sum(all_hours), 2)
        total_completed   = sum(d["sessions_completed"] for d in timeline)
        total_planned     = total_completed + sum(d["sessions_skipped"] for d in timeline)
        completion_rate   = round(total_completed / total_planned * 100, 1) if total_planned else 0
        avg_quiz_score    = round(float(np.mean(all_scores)), 1) if all_scores else None
        avg_mood          = round(float(np.mean(all_moods)), 2) if all_moods else None

        # Best / worst day by study hours
        days_with_data = [d for d in timeline if d["study_hours"] > 0]
        best_day  = max(days_with_data, key=lambda d: d["study_hours"])["date"] if days_with_data else None
        worst_day = min(days_with_data, key=lambda d: d["study_hours"])["date"] if days_with_data else None

        # Most productive day of week
        dow_hours = {}
        for d in timeline:
            if d["study_hours"] > 0:
                dow = datetime.strptime(d["date"], "%Y-%m-%d").strftime("%A")
                dow_hours.setdefault(dow, []).append(d["study_hours"])
        most_productive_dow = (
            max(dow_hours, key=lambda k: sum(dow_hours[k]) / len(dow_hours[k]))
            if dow_hours else None
        )

        return {
            "timeline": timeline,
            "summary": {
                "total_hours":              total_hours,
                "completion_rate":          completion_rate,
                "avg_quiz_score":           avg_quiz_score,
                "avg_mood":                 avg_mood,
                "best_day":                 best_day,
                "worst_day":                worst_day,
                "most_productive_time_of_week": most_productive_dow,
            },
        }

    # ── 2. Subject Mastery Breakdown ──────────────────────────────────────────

    def get_subject_mastery_breakdown(self, student_id: str) -> dict:
        """
        Per-subject mastery across all topics.

        Mastery tiers (by theta):
          mastered:     theta > 0.5
          in_progress:  -0.5 <= theta <= 0.5
          needs_work:   theta < -0.5
        """
        try:
            conn = _get_db()
            cur = conn.cursor()

            # Fetch student board/grade for topic filtering
            cur.execute(
                "SELECT board, grade_level FROM students WHERE id = %s",
                (student_id,)
            )
            student = cur.fetchone()
            if not student:
                cur.close(); conn.close()
                return {"subjects": [], "overall_mastery_percent": 0}

            board       = student["board"]
            grade_level = student["grade_level"]

            # All topics for this student's curriculum
            cur.execute("""
                SELECT id, topic_name, subject, estimated_study_hours
                FROM topics
                WHERE board = %s OR grade_level = %s
            """, (board, grade_level))
            all_topics = cur.fetchall()

            if not all_topics:
                # Fallback: all topics
                cur.execute("SELECT id, topic_name, subject, estimated_study_hours FROM topics")
                all_topics = cur.fetchall()

            # Latest theta per topic for this student
            cur.execute("""
                SELECT DISTINCT ON (topic_id)
                    topic_id,
                    theta_estimate,
                    score_percent
                FROM quiz_attempts
                WHERE student_id = %s
                ORDER BY topic_id, completed_at DESC
            """, (student_id,))
            theta_map = {str(r["topic_id"]): float(r["theta_estimate"]) for r in cur.fetchall()}

            # Study hours per topic
            cur.execute("""
                SELECT
                    topic_id,
                    ROUND(SUM(actual_duration_min) / 60.0, 2) AS hours
                FROM study_sessions
                WHERE student_id = %s AND completed = TRUE
                GROUP BY topic_id
            """, (student_id,))
            hours_map = {str(r["topic_id"]): float(r["hours"]) for r in cur.fetchall()}

            cur.close()
            conn.close()
        except Exception as e:
            logger.error(f"[mastery] DB error for {student_id}: {e}")
            return {"subjects": [], "overall_mastery_percent": 0}

        # Group topics by subject
        subject_map: dict = {}
        for t in all_topics:
            subj = t["subject"]
            if subj not in subject_map:
                subject_map[subj] = []
            subject_map[subj].append(t)

        subjects = []
        all_mastery_pcts = []

        for subj, topics in subject_map.items():
            total = len(topics)
            assessed, mastered, in_progress, needs_work = 0, 0, 0, 0
            thetas, time_hours = [], 0.0

            for t in topics:
                tid = str(t["id"])
                time_hours += hours_map.get(tid, 0.0)
                if tid in theta_map:
                    assessed += 1
                    theta = theta_map[tid]
                    thetas.append(theta)
                    if theta > 0.5:
                        mastered += 1
                    elif theta >= -0.5:
                        in_progress += 1
                    else:
                        needs_work += 1

            avg_theta = float(np.mean(thetas)) if thetas else 0.0
            mastery_pct = round(mastered / total * 100, 1) if total else 0.0

            # predicted_exam_score: 50 + avg_theta * 20, clamped [25, 95]
            predicted = _clamp(50.0 + avg_theta * 20.0, 25.0, 95.0)

            subjects.append({
                "subject_name":         subj,
                "topics_total":         total,
                "topics_assessed":      assessed,
                "topics_mastered":      mastered,
                "topics_in_progress":   in_progress,
                "topics_need_work":     needs_work,
                "avg_theta":            round(avg_theta, 3),
                "mastery_percent":      mastery_pct,
                "time_invested_hours":  round(time_hours, 2),
                "predicted_exam_score": round(predicted, 1),
            })
            all_mastery_pcts.append(mastery_pct)

        overall = round(float(np.mean(all_mastery_pcts)), 1) if all_mastery_pcts else 0.0
        subjects.sort(key=lambda s: s["mastery_percent"], reverse=True)

        return {"subjects": subjects, "overall_mastery_percent": overall}

    # ── 3. Twin Vector Evolution ──────────────────────────────────────────────

    def get_twin_vector_evolution(self, student_id: str, days: int = 30) -> dict:
        """
        Tracks how the digital twin vector has evolved over time.

        Dimension groups (from twin_service.py):
          dims  0– 9  : subject performance
          dims 30–39  : learning pace
          dims 40–49  : stress indicators
          dims 50–59  : consistency indicators
          dims 60–63  : overall ability

        Falls back to the current twin vector when no history table exists.
        """
        since = (date.today() - timedelta(days=days)).isoformat()

        try:
            conn = _get_db()
            cur = conn.cursor()

            # Try twin_vector_history table first
            history_rows = []
            try:
                cur.execute("""
                    SELECT recorded_at::date AS day, twin_vector
                    FROM twin_vector_history
                    WHERE student_id = %s AND recorded_at >= %s
                    ORDER BY recorded_at ASC
                """, (student_id, since))
                history_rows = cur.fetchall()
            except Exception:
                pass  # Table may not exist — use current vector as single snapshot

            # Fallback: current twin vector
            if not history_rows:
                cur.execute(
                    "SELECT twin_vector, last_updated FROM digital_twins WHERE student_id = %s",
                    (student_id,)
                )
                row = cur.fetchone()
                if row and row["twin_vector"]:
                    history_rows = [{
                        "day": date.today(),
                        "twin_vector": row["twin_vector"],
                    }]

            # Peer cluster average for comparison
            cur.execute("""
                SELECT peer_cluster_id FROM digital_twins WHERE student_id = %s
            """, (student_id,))
            cluster_row = cur.fetchone()
            peer_cluster_id = cluster_row["peer_cluster_id"] if cluster_row else 2

            cur.execute("""
                SELECT AVG((twin_vector::jsonb->60)::float) AS avg_ability
                FROM digital_twins
                WHERE peer_cluster_id = %s
            """, (peer_cluster_id,))
            peer_row = cur.fetchone()
            peer_avg_ability = float(peer_row["avg_ability"] or 0.5) if peer_row else 0.5

            cur.close()
            conn.close()
        except Exception as e:
            logger.error(f"[twin_evolution] DB error for {student_id}: {e}")
            return {"evolution": [], "growth_summary": "Stable", "peer_comparison": {}}

        evolution = []
        growth_scores = []

        for row in history_rows:
            raw = row["twin_vector"]
            vec = json.loads(raw) if isinstance(raw, str) else list(raw)
            if len(vec) < 64:
                continue

            performance  = round(float(np.mean(vec[0:10])),  3)
            pace         = round(float(np.mean(vec[30:40])), 3)
            stress       = round(float(np.mean(vec[40:50])), 3)
            consistency  = round(float(np.mean(vec[50:60])), 3)
            ability      = round(float(vec[60]),              3)

            # growth_score: weighted composite (higher = better)
            # stress is inverted (lower stress → higher score)
            growth = round(
                0.30 * performance +
                0.25 * consistency +
                0.20 * ability +
                0.15 * pace +
                0.10 * (1.0 - stress),
                3
            )
            growth_scores.append(growth)

            evolution.append({
                "date":        str(row["day"]),
                "performance": performance,
                "pace":        pace,
                "stress":      stress,
                "consistency": consistency,
                "ability":     ability,
                "growth_score": growth,
            })

        # Growth summary
        growth_summary = "Stable"
        if len(growth_scores) >= 4:
            mid = len(growth_scores) // 2
            first_half = float(np.mean(growth_scores[:mid]))
            second_half = float(np.mean(growth_scores[mid:]))
            delta = second_half - first_half
            if delta > 0.05:
                growth_summary = "Accelerating"
            elif delta < -0.05:
                growth_summary = "Declining"
            elif abs(delta) <= 0.01:
                growth_summary = "Plateaued"

        # Strongest / most improved dimension
        dim_labels = {
            "performance": "Subject Performance",
            "consistency": "Study Consistency",
            "ability":     "Overall Ability",
            "pace":        "Learning Pace",
        }
        if evolution:
            latest = evolution[-1]
            strongest_key = max(
                ["performance", "consistency", "ability", "pace"],
                key=lambda k: latest[k]
            )
            strongest_dimension = dim_labels[strongest_key]

            most_improved_key = "performance"
            if len(evolution) >= 2:
                first = evolution[0]
                most_improved_key = max(
                    ["performance", "consistency", "ability", "pace"],
                    key=lambda k: latest[k] - first[k]
                )
            most_improved_dimension = dim_labels[most_improved_key]
        else:
            strongest_dimension = "N/A"
            most_improved_dimension = "N/A"

        # Peer comparison
        student_growth = round(float(np.mean(growth_scores)), 3) if growth_scores else 0.0
        peer_growth = round(
            0.30 * peer_avg_ability + 0.25 * 0.5 + 0.20 * peer_avg_ability + 0.15 * 0.5 + 0.10 * 0.5,
            3
        )
        percentile = int(_clamp((student_growth / max(peer_growth, 0.01)) * 50, 1, 99))

        return {
            "evolution":               evolution,
            "growth_summary":          growth_summary,
            "strongest_dimension":     strongest_dimension,
            "most_improved_dimension": most_improved_dimension,
            "peer_comparison": {
                "student_growth_score": student_growth,
                "peer_cluster_avg":     peer_growth,
                "percentile":           percentile,
            },
        }

    # ── 4. Study Pattern Insights ─────────────────────────────────────────────

    def get_study_pattern_insights(self, student_id: str) -> dict:
        """
        Analyzes behavioral patterns to generate actionable insights.
        """
        insights = []

        try:
            conn = _get_db()
            cur = conn.cursor()

            # ── 1. Peak productivity window ───────────────────────────────────
            cur.execute("""
                SELECT
                    EXTRACT(HOUR FROM ss.started_at)::int AS hour,
                    AVG(qa.score_percent)                  AS avg_score,
                    COUNT(qa.id)                           AS quiz_count
                FROM study_sessions ss
                JOIN quiz_attempts qa ON qa.student_id = ss.student_id
                    AND DATE(qa.completed_at) = DATE(ss.started_at)
                WHERE ss.student_id = %s AND ss.completed = TRUE
                GROUP BY hour
                HAVING COUNT(qa.id) >= 2
                ORDER BY avg_score DESC
                LIMIT 3
            """, (student_id,))
            peak_rows = cur.fetchall()

            if peak_rows:
                best_hour = int(peak_rows[0]["hour"])
                best_score = float(peak_rows[0]["avg_score"])
                end_hour = (best_hour + 2) % 24
                am_pm = lambda h: f"{h % 12 or 12}{'am' if h < 12 else 'pm'}"
                insights.append({
                    "insight_id":     "peak_productivity",
                    "category":       "timing",
                    "headline":       f"You perform best between {am_pm(best_hour)}–{am_pm(end_hour)}",
                    "detail":         f"Your average quiz score during this window is {best_score:.0f}%.",
                    "recommendation": f"Schedule your hardest topics between {am_pm(best_hour)} and {am_pm(end_hour)}.",
                    "data_points":    int(peak_rows[0]["quiz_count"]),
                    "confidence":     "high" if int(peak_rows[0]["quiz_count"]) >= 5 else "medium",
                })

            # ── 2. Optimal session length ─────────────────────────────────────
            cur.execute("""
                SELECT
                    CASE
                        WHEN ss.actual_duration_min < 25  THEN 'under_25'
                        WHEN ss.actual_duration_min < 45  THEN '25_45'
                        WHEN ss.actual_duration_min < 70  THEN '45_70'
                        ELSE 'over_70'
                    END AS bucket,
                    AVG(qa.score_percent) AS avg_score,
                    COUNT(qa.id)          AS count
                FROM study_sessions ss
                JOIN quiz_attempts qa ON qa.student_id = ss.student_id
                    AND DATE(qa.completed_at) = DATE(ss.started_at)
                WHERE ss.student_id = %s AND ss.completed = TRUE
                GROUP BY bucket
                HAVING COUNT(qa.id) >= 2
                ORDER BY avg_score DESC
            """, (student_id,))
            duration_rows = cur.fetchall()

            if duration_rows:
                best_bucket = duration_rows[0]["bucket"]
                best_score  = float(duration_rows[0]["avg_score"])
                bucket_labels = {
                    "under_25": "under 25 minutes",
                    "25_45":    "25–45 minutes",
                    "45_70":    "45–70 minutes",
                    "over_70":  "over 70 minutes",
                }
                label = bucket_labels.get(best_bucket, best_bucket)
                insights.append({
                    "insight_id":     "optimal_duration",
                    "category":       "duration",
                    "headline":       f"Your sweet spot is {label} per session",
                    "detail":         f"Sessions of {label} correlate with your highest quiz scores ({best_score:.0f}% avg).",
                    "recommendation": f"Aim for {label} study blocks for best retention.",
                    "data_points":    int(duration_rows[0]["count"]),
                    "confidence":     "high" if int(duration_rows[0]["count"]) >= 5 else "medium",
                })

            # ── 3. Social media impact ────────────────────────────────────────
            cur.execute("""
                SELECT
                    DATE(sms.started_at)                    AS day,
                    SUM(sms.minutes_granted)                AS social_mins,
                    AVG(qa.score_percent)                   AS next_day_score
                FROM social_media_sessions sms
                JOIN quiz_attempts qa ON qa.student_id = sms.student_id
                    AND DATE(qa.completed_at) = DATE(sms.started_at) + INTERVAL '1 day'
                WHERE sms.student_id = %s
                GROUP BY day
                HAVING COUNT(qa.id) >= 1
            """, (student_id,))
            social_rows = cur.fetchall()

            if len(social_rows) >= 3:
                heavy_days = [r for r in social_rows if float(r["social_mins"]) > 120]
                light_days = [r for r in social_rows if float(r["social_mins"]) <= 120]
                if heavy_days and light_days:
                    heavy_avg = float(np.mean([float(r["next_day_score"]) for r in heavy_days]))
                    light_avg = float(np.mean([float(r["next_day_score"]) for r in light_days]))
                    drop = round(light_avg - heavy_avg, 1)
                    if drop > 3:
                        insights.append({
                            "insight_id":     "social_media_impact",
                            "category":       "social",
                            "headline":       f"Heavy social media use drops your scores by {drop}%",
                            "detail":         f"On days after 2+ hours of social media, your quiz scores average {heavy_avg:.0f}% vs {light_avg:.0f}% on lighter days.",
                            "recommendation": "Try capping social media to 1 hour on school nights.",
                            "data_points":    len(social_rows),
                            "confidence":     "medium" if len(social_rows) < 10 else "high",
                        })

            # ── 4. Mood-performance correlation ──────────────────────────────
            cur.execute("""
                SELECT
                    ml.mood_score,
                    AVG(qa.score_percent) AS avg_score,
                    COUNT(qa.id)          AS count
                FROM mood_logs ml
                JOIN quiz_attempts qa ON qa.student_id = ml.student_id
                    AND DATE(qa.completed_at) = DATE(ml.logged_at)
                WHERE ml.student_id = %s
                GROUP BY ml.mood_score
                HAVING COUNT(qa.id) >= 2
                ORDER BY ml.mood_score DESC
            """, (student_id,))
            mood_rows = cur.fetchall()

            if len(mood_rows) >= 2:
                high_mood = [r for r in mood_rows if int(r["mood_score"]) >= 4]
                low_mood  = [r for r in mood_rows if int(r["mood_score"]) <= 2]
                if high_mood and low_mood:
                    high_avg = float(np.mean([float(r["avg_score"]) for r in high_mood]))
                    low_avg  = float(np.mean([float(r["avg_score"]) for r in low_mood]))
                    diff = round(high_avg - low_avg, 1)
                    if diff > 2:
                        insights.append({
                            "insight_id":     "mood_performance",
                            "category":       "mood",
                            "headline":       f"Good mood boosts your scores by {diff}%",
                            "detail":         f"When your mood is 4–5, you score {high_avg:.0f}% on average vs {low_avg:.0f}% when mood is 1–2.",
                            "recommendation": "Log your mood daily — it helps us personalise your plan.",
                            "data_points":    sum(int(r["count"]) for r in mood_rows),
                            "confidence":     "medium",
                        })

            # ── 5. Subject rotation analysis ─────────────────────────────────
            cur.execute("""
                SELECT
                    DATE(ss.started_at)                     AS day,
                    COUNT(DISTINCT t.subject)               AS subjects_studied,
                    AVG(qa.score_percent)                   AS avg_score
                FROM study_sessions ss
                JOIN topics t ON t.id = ss.topic_id
                LEFT JOIN quiz_attempts qa ON qa.student_id = ss.student_id
                    AND DATE(qa.completed_at) = DATE(ss.started_at)
                WHERE ss.student_id = %s AND ss.completed = TRUE
                GROUP BY day
                HAVING COUNT(qa.id) >= 1
            """, (student_id,))
            rotation_rows = cur.fetchall()

            if len(rotation_rows) >= 5:
                multi = [r for r in rotation_rows if int(r["subjects_studied"]) >= 2]
                single = [r for r in rotation_rows if int(r["subjects_studied"]) == 1]
                if multi and single:
                    multi_avg  = float(np.mean([float(r["avg_score"]) for r in multi]))
                    single_avg = float(np.mean([float(r["avg_score"]) for r in single]))
                    diff = round(multi_avg - single_avg, 1)
                    if abs(diff) > 3:
                        better = "rotating subjects" if diff > 0 else "focusing on one subject"
                        insights.append({
                            "insight_id":     "subject_rotation",
                            "category":       "pattern",
                            "headline":       f"You perform better when {better}",
                            "detail":         f"Multi-subject days average {multi_avg:.0f}% vs {single_avg:.0f}% on single-subject days.",
                            "recommendation": f"Try {'mixing subjects each day' if diff > 0 else 'deep-diving into one subject per day'}.",
                            "data_points":    len(rotation_rows),
                            "confidence":     "medium",
                        })

            cur.close()
            conn.close()
        except Exception as e:
            logger.error(f"[insights] DB error for {student_id}: {e}")

        # Always return at least a generic insight if nothing was computed
        if not insights:
            insights.append({
                "insight_id":     "keep_going",
                "category":       "motivation",
                "headline":       "Keep building your study history",
                "detail":         "Complete more sessions and quizzes to unlock personalised insights.",
                "recommendation": "Aim for at least 5 study sessions this week.",
                "data_points":    0,
                "confidence":     "low",
            })

        return {"insights": insights}

    # ── 5. Exam Readiness Score ───────────────────────────────────────────────

    def get_exam_readiness_score(self, student_id: str, exam_id: str) -> dict:
        """
        Composite exam readiness score for one upcoming exam.

        readiness = 0.40*coverage + 0.35*mastery + 0.15*consistency + 0.10*(1-stress)
        """
        try:
            conn = _get_db()
            cur = conn.cursor()

            # Fetch exam
            cur.execute("""
                SELECT id, subject, exam_date,
                       (exam_date::date - CURRENT_DATE) AS days_remaining
                FROM exams
                WHERE id = %s AND student_id = %s
            """, (exam_id, student_id))
            exam = cur.fetchone()
            if not exam:
                cur.close(); conn.close()
                return {"error": "Exam not found"}

            subject       = exam["subject"]
            exam_date     = str(exam["exam_date"])
            days_remaining = int(exam["days_remaining"])

            # Student board/grade
            cur.execute("SELECT board, grade_level FROM students WHERE id = %s", (student_id,))
            student = cur.fetchone()
            board, grade_level = (student["board"], student["grade_level"]) if student else (None, None)

            # All topics for this subject
            cur.execute("""
                SELECT id, topic_name, estimated_study_hours
                FROM topics
                WHERE subject = %s AND (board = %s OR grade_level = %s)
            """, (subject, board, grade_level))
            topics = cur.fetchall()

            if not topics:
                cur.execute("SELECT id, topic_name, estimated_study_hours FROM topics WHERE subject = %s", (subject,))
                topics = cur.fetchall()

            total_topics = len(topics)
            topic_ids = [str(t["id"]) for t in topics]

            # Coverage: topics with ≥1 completed session
            cur.execute("""
                SELECT COUNT(DISTINCT topic_id) AS covered
                FROM study_sessions
                WHERE student_id = %s AND completed = TRUE AND topic_id = ANY(%s::uuid[])
            """, (student_id, topic_ids))
            covered = int((cur.fetchone() or {}).get("covered") or 0)
            coverage = covered / total_topics if total_topics else 0.0

            # Mastery: avg theta across subject topics, normalised 0-1
            cur.execute("""
                SELECT DISTINCT ON (topic_id)
                    topic_id, theta_estimate
                FROM quiz_attempts
                WHERE student_id = %s AND topic_id = ANY(%s::uuid[])
                ORDER BY topic_id, completed_at DESC
            """, (student_id, topic_ids))
            thetas = [float(r["theta_estimate"]) for r in cur.fetchall()]
            avg_theta = float(np.mean(thetas)) if thetas else 0.0
            mastery = _clamp((avg_theta + 3.0) / 6.0, 0.0, 1.0)  # -3..+3 → 0..1

            # Consistency: session completion rate last 2 weeks
            two_weeks_ago = (date.today() - timedelta(days=14)).isoformat()
            cur.execute("""
                SELECT
                    COUNT(*) FILTER (WHERE completed = TRUE) AS done,
                    COUNT(*)                                  AS total
                FROM study_sessions
                WHERE student_id = %s AND started_at >= %s
            """, (student_id, two_weeks_ago))
            cons_row = cur.fetchone()
            done  = int(cons_row["done"]  or 0)
            total = int(cons_row["total"] or 0)
            consistency = done / total if total else 0.0

            # Stress: latest stress score
            cur.execute("""
                SELECT stress_score FROM stress_logs
                WHERE student_id = %s ORDER BY logged_at DESC LIMIT 1
            """, (student_id,))
            stress_row = cur.fetchone()
            current_stress = float(stress_row["stress_score"]) if stress_row else 0.3

            # Gap topics (top 3 by urgency = lowest theta)
            cur.execute("""
                SELECT DISTINCT ON (qa.topic_id)
                    t.topic_name, qa.theta_estimate
                FROM quiz_attempts qa
                JOIN topics t ON t.id = qa.topic_id
                WHERE qa.student_id = %s AND qa.topic_id = ANY(%s::uuid[])
                  AND qa.gap_detected = TRUE
                ORDER BY qa.topic_id, qa.completed_at DESC
            """, (student_id, topic_ids))
            gap_rows = sorted(cur.fetchall(), key=lambda r: float(r["theta_estimate"]))[:3]
            critical_gaps = [r["topic_name"] for r in gap_rows]

            cur.close()
            conn.close()
        except Exception as e:
            logger.error(f"[exam_readiness] DB error for {student_id}/{exam_id}: {e}")
            return {"error": str(e)}

        # Composite score
        readiness_score   = (0.40 * coverage + 0.35 * mastery +
                             0.15 * consistency + 0.10 * (1.0 - current_stress))
        readiness_percent = round(_clamp(readiness_score * 100, 0, 100), 1)

        if readiness_percent >= 80:
            readiness_label = "Well Prepared 🟢"
        elif readiness_percent >= 60:
            readiness_label = "On Track 🟡"
        elif readiness_percent >= 40:
            readiness_label = "Needs Focus 🟠"
        else:
            readiness_label = "At Risk 🔴"

        # Recommended daily hours
        remaining_study_hours = sum(
            float(t.get("estimated_study_hours") or 2) * (1.0 - mastery)
            for t in topics
        )
        recommended_daily = round(
            remaining_study_hours / max(days_remaining, 1), 1
        ) if days_remaining > 0 else 0.0
        recommended_daily = _clamp(recommended_daily, 0.5, 8.0)

        # Predicted performance range
        base_pred = _clamp(50.0 + avg_theta * 20.0, 25.0, 95.0)
        pred_low  = int(_clamp(base_pred - 10, 20, 90))
        pred_high = int(_clamp(base_pred + 10, 30, 100))

        return {
            "exam_id":           exam_id,
            "subject":           subject,
            "exam_date":         exam_date,
            "days_remaining":    days_remaining,
            "readiness_score":   round(readiness_score, 4),
            "readiness_percent": readiness_percent,
            "readiness_label":   readiness_label,
            "components": {
                "coverage":         round(coverage, 3),
                "mastery":          round(mastery, 3),
                "consistency":      round(consistency, 3),
                "stress_adjustment": round(1.0 - current_stress, 3),
            },
            "critical_gaps":            critical_gaps,
            "recommended_daily_hours":  recommended_daily,
            "predicted_performance_range": {"low": pred_low, "high": pred_high},
        }

    # ── 6. Weekly Digest ─────────────────────────────────────────────────────

    def generate_weekly_digest(self, student_id: str) -> dict:
        """
        Comprehensive weekly performance digest.
        Compares this week vs last week across all key metrics.
        """
        this_week_start = (date.today() - timedelta(days=date.today().weekday())).isoformat()
        last_week_start = (date.today() - timedelta(days=date.today().weekday() + 7)).isoformat()
        last_week_end   = this_week_start

        def _week_stats(since: str, until: Optional[str] = None) -> dict:
            until_clause = f"AND started_at < '{until}'" if until else ""
            try:
                conn = _get_db()
                cur = conn.cursor()

                cur.execute(f"""
                    SELECT
                        COUNT(*) FILTER (WHERE completed = TRUE)  AS sessions_done,
                        COUNT(*) FILTER (WHERE skipped = TRUE)    AS sessions_skipped,
                        ROUND(SUM(actual_duration_min)/60.0, 2)   AS study_hours
                    FROM study_sessions
                    WHERE student_id = %s AND started_at >= %s {until_clause}
                """, (student_id, since))
                sess = cur.fetchone() or {}

                cur.execute(f"""
                    SELECT
                        COUNT(*)                                   AS quizzes,
                        ROUND(AVG(score_percent)::numeric, 1)      AS avg_score
                    FROM quiz_attempts
                    WHERE student_id = %s AND completed_at >= %s
                    {"AND completed_at < '" + until + "'" if until else ""}
                """, (student_id, since))
                quiz = cur.fetchone() or {}

                cur.execute(f"""
                    SELECT ROUND(AVG(stress_score)::numeric, 3) AS avg_stress
                    FROM stress_logs
                    WHERE student_id = %s AND logged_at >= %s
                    {"AND logged_at < '" + until + "'" if until else ""}
                """, (student_id, since))
                stress = cur.fetchone() or {}

                cur.execute(f"""
                    SELECT COALESCE(SUM(tokens_delta) FILTER (WHERE tokens_delta > 0), 0) AS tokens
                    FROM token_history
                    WHERE student_id = %s AND created_at >= %s
                    {"AND created_at < '" + until + "'" if until else ""}
                """, (student_id, since))
                tokens = cur.fetchone() or {}

                cur.close()
                conn.close()

                return {
                    "sessions_done":    int(sess.get("sessions_done") or 0),
                    "sessions_skipped": int(sess.get("sessions_skipped") or 0),
                    "study_hours":      float(sess.get("study_hours") or 0),
                    "quizzes":          int(quiz.get("quizzes") or 0),
                    "avg_quiz_score":   float(quiz.get("avg_score") or 0),
                    "avg_stress":       float(stress.get("avg_stress") or 0),
                    "tokens_earned":    int(tokens.get("tokens") or 0),
                }
            except Exception as e:
                logger.error(f"[weekly_digest] week stats error: {e}")
                return {"sessions_done": 0, "sessions_skipped": 0, "study_hours": 0,
                        "quizzes": 0, "avg_quiz_score": 0, "avg_stress": 0, "tokens_earned": 0}

        this_week = _week_stats(this_week_start)
        last_week = _week_stats(last_week_start, last_week_end)

        def _delta(key: str) -> float:
            return round(this_week[key] - last_week[key], 2)

        # Top achievement
        achievement = None
        if this_week["avg_quiz_score"] >= 85:
            achievement = f"Outstanding quiz performance — {this_week['avg_quiz_score']}% average this week!"
        elif this_week["sessions_done"] > last_week["sessions_done"]:
            achievement = f"Completed {this_week['sessions_done']} sessions — more than last week!"
        elif this_week["tokens_earned"] > 50:
            achievement = f"Earned {this_week['tokens_earned']} focus tokens this week!"

        # Biggest challenge
        challenge = None
        if this_week["avg_quiz_score"] < 50 and this_week["quizzes"] > 0:
            challenge = f"Quiz scores need attention — averaging {this_week['avg_quiz_score']}%."
        elif this_week["avg_stress"] > 0.65:
            challenge = "Stress levels were elevated this week. Consider lighter sessions."
        elif this_week["sessions_skipped"] >= 3:
            challenge = f"Missed {this_week['sessions_skipped']} sessions — try to keep the streak going."

        # Recommendation for next week
        recommendation = "Keep up the consistent effort — you're building great habits."
        if this_week["avg_stress"] > 0.65:
            recommendation = "Prioritise rest and shorter study blocks next week to manage stress."
        elif this_week["avg_quiz_score"] < 55 and this_week["quizzes"] > 0:
            recommendation = "Focus on gap topics next week — review flagged subjects before new material."
        elif this_week["sessions_done"] < 3:
            recommendation = "Aim for at least 5 sessions next week to build momentum."

        # Exam progress
        exam_progress = []
        try:
            conn = _get_db()
            cur = conn.cursor()
            cur.execute("""
                SELECT id, subject, exam_date,
                       (exam_date::date - CURRENT_DATE) AS days_remaining
                FROM exams
                WHERE student_id = %s AND exam_date >= CURRENT_DATE
                ORDER BY exam_date ASC LIMIT 5
            """, (student_id,))
            exams = cur.fetchall()
            cur.close()
            conn.close()

            for exam in exams:
                readiness = self.get_exam_readiness_score(student_id, str(exam["id"]))
                exam_progress.append({
                    "subject":           exam["subject"],
                    "exam_date":         str(exam["exam_date"]),
                    "days_remaining":    int(exam["days_remaining"]),
                    "readiness_percent": readiness.get("readiness_percent", 0),
                    "readiness_label":   readiness.get("readiness_label", "Unknown"),
                })
        except Exception as e:
            logger.error(f"[weekly_digest] exam progress error: {e}")

        return {
            "this_week":    this_week,
            "last_week":    last_week,
            "deltas": {
                "sessions_done":    _delta("sessions_done"),
                "study_hours":      _delta("study_hours"),
                "avg_quiz_score":   _delta("avg_quiz_score"),
                "avg_stress":       _delta("avg_stress"),
                "tokens_earned":    _delta("tokens_earned"),
            },
            "top_achievement":    achievement,
            "biggest_challenge":  challenge,
            "recommendation":     recommendation,
            "exam_progress":      exam_progress,
            "generated_at":       datetime.now().isoformat(),
        }
