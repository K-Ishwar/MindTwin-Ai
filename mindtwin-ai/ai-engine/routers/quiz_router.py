"""
Adaptive Quiz Engine Router
===========================
Full IRT-powered adaptive quiz API.

Endpoints:
  POST /api/ai/quiz/start
  POST /api/ai/quiz/answer
  GET  /api/ai/quiz/gap-report/{student_id}

Uses:
  - IRT service       (3PL model, theta update, SE, termination)
  - Question Bank     (PostgreSQL question fetch)
  - Knowledge Graph   (gap classification, root-cause analysis)
  - Redis             (session state, TTL = 2h)
  - PostgreSQL        (quiz_attempts, quiz_item_responses persistence)
"""

import os
import json
import uuid
import time
import httpx
import psycopg2
import psycopg2.extras
import redis as redis_lib

from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from services.irt_service import (
    select_next_question,
    update_theta_mle,
    compute_standard_error,
    should_terminate,
    classify_gap,
    estimate_revision_hours,
)
from services.knowledge_graph_service import get_knowledge_graph_service
from services.question_bank_service import get_question_bank_service

router = APIRouter(prefix="/api/ai/quiz", tags=["Adaptive Quiz"])

# ── Config ─────────────────────────────────────────────────────────────────────
DATABASE_URL = os.getenv("DATABASE_URL", "postgres://user:password@postgres:5432/mindtwin_db")
REDIS_URL    = os.getenv("REDIS_URL", "redis://redis:6379/0")
AI_ENGINE_URL = os.getenv("AI_ENGINE_URL", "http://ai-engine:8000")
SESSION_TTL  = 7200  # 2 hours

# ── Connections ────────────────────────────────────────────────────────────────

def _db():
    return psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)

def _redis():
    return redis_lib.from_url(REDIS_URL, decode_responses=True)

def _session_key(student_id: str, topic_id: str) -> str:
    return f"quiz_session:{student_id}:{topic_id}"

def _session_key_by_id(session_id: str) -> str:
    return f"quiz_session_id:{session_id}"

# ── Request models ─────────────────────────────────────────────────────────────

class StartQuizRequest(BaseModel):
    student_id: str
    topic_id:   str
    mode:       str = "adaptive"   # adaptive | practice | revision

class AnswerRequest(BaseModel):
    session_id:      str
    student_id:      str
    question_id:     str
    selected_option: str           # A | B | C | D
    time_taken_sec:  int = 30

# ── Helpers ────────────────────────────────────────────────────────────────────

def _sanitize_question(q: dict, number: int) -> dict:
    """Return question dict safe to send to frontend (no answer/IRT params)."""
    return {
        "id":              str(q["id"]),
        "question_text":   q["question_text"],
        "option_a":        q["option_a"],
        "option_b":        q["option_b"],
        "option_c":        q["option_c"],
        "option_d":        q["option_d"],
        "question_number": number,
    }

def _performance_label(theta: float) -> str:
    if theta < -1.0: return "Needs Work"
    if theta <  0.0: return "Getting There"
    if theta <  1.0: return "Proficient"
    return "Excellent"

def _build_recommendations(gap: dict, prerequisite_gaps: list, topic_name: str) -> list[str]:
    recs = []
    sev = gap.get("severity", "none")
    if sev == "significant":
        recs.append(f"Prioritise {topic_name} — a significant gap was detected.")
    elif sev == "minor":
        recs.append(f"Review {topic_name} to close a minor gap before your exam.")
    else:
        recs.append(f"Great work on {topic_name}! Challenge yourself with harder questions.")

    if prerequisite_gaps:
        top = prerequisite_gaps[0]
        recs.append(f"Root cause: strengthen '{top['topic_name']}' to fix {top['impact_score']} downstream gap(s).")

    recs.append("Aim to answer at least 3 sessions before the next quiz for better accuracy.")
    return recs

def _normalize_question(q: dict) -> dict:
    """Map DB columns (irt_a, irt_b, irt_c) → IRT engine keys (a, b, c)."""
    q = dict(q)
    q["id"]  = str(q.get("id", ""))
    q["a"]   = float(q.get("irt_a", q.get("a", 1.0)))
    q["b"]   = float(q.get("irt_b", q.get("b", 0.0)))
    q["c"]   = float(q.get("irt_c", q.get("c", 0.25)))
    if q.get("topic_id"):
        q["topic_id"] = str(q["topic_id"])
    return q


def _get_prior_theta(student_id: str, topic_id: str) -> float:
    """Fetch the most recent theta estimate for (student, topic). Returns 0.0 if none."""
    try:
        conn = _db()
        cur = conn.cursor()
        cur.execute(
            "SELECT theta_estimate FROM quiz_attempts "
            "WHERE student_id=%s AND topic_id=%s "
            "ORDER BY completed_at DESC LIMIT 1",
            (student_id, topic_id),
        )
        row = cur.fetchone()
        cur.close(); conn.close()
        return float(row["theta_estimate"]) if row and row["theta_estimate"] is not None else 0.0
    except Exception:
        return 0.0

def _get_topic_meta(topic_id: str) -> dict:
    """Fetch topic metadata from topics table."""
    try:
        conn = _db()
        cur = conn.cursor()
        cur.execute(
            "SELECT topic_name, subject, board, grade_level, "
            "       difficulty_level, estimated_study_hours "
            "FROM topics WHERE id=%s",
            (topic_id,),
        )
        row = cur.fetchone()
        cur.close(); conn.close()
        return dict(row) if row else {}
    except Exception:
        return {}


# ── POST /api/ai/quiz/start ───────────────────────────────────────────────────

@router.post("/start")
def start_quiz(req: StartQuizRequest):
    """
    Initialise an adaptive quiz session.
    Selects the first question via maximum Fisher Information.
    Stores session state in Redis (TTL 2h).
    Never exposes correct answers or IRT parameters to the client.
    """
    qb  = get_question_bank_service()
    r   = _redis()

    # 1. Prior ability estimate
    theta = _get_prior_theta(req.student_id, req.topic_id)

    # 2. Fetch question pool
    questions = qb.get_questions_for_adaptive_quiz(req.topic_id, count=20)
    if not questions:
        raise HTTPException(status_code=404, detail="No questions available for this topic.")

    # Normalize IDs and IRT keys
    questions = [_normalize_question(q) for q in questions]

    # 3. Select first question
    first_q = select_next_question(theta, questions, [])
    if not first_q:
        raise HTTPException(status_code=500, detail="Could not select initial question.")

    # 4. Build session
    session_id = str(uuid.uuid4())
    session = {
        "session_id":        session_id,
        "student_id":        req.student_id,
        "topic_id":          req.topic_id,
        "mode":              req.mode,
        "theta_current":     theta,
        "se_current":        999.0,
        "responses":         [],           # {a, b, c, correct}
        "questions_answered": [],          # question_ids in order
        "question_details":  [],           # {question_id, selected_option, is_correct, time_taken_sec, theta_before, theta_after, info_val}
        "start_time":        datetime.now(timezone.utc).isoformat(),
        "status":            "active",
        "questions_pool":    questions,    # full pool stored in session
        "correct_count":     0,
    }

    # Store under two keys: by session_id (for answer lookup) and by student/topic
    r.setex(_session_key(req.student_id, req.topic_id), SESSION_TTL, json.dumps(session))
    r.setex(_session_key_by_id(session_id), SESSION_TTL, _session_key(req.student_id, req.topic_id))

    return {
        "success":       True,
        "session_id":    session_id,
        "theta_start":   round(theta, 4),
        "mode":          req.mode,
        "first_question": _sanitize_question(first_q, 1),
        "total_available": len(questions),
    }


# ── POST /api/ai/quiz/answer ──────────────────────────────────────────────────

@router.post("/answer")
def answer_question(req: AnswerRequest):
    """
    Process one student answer, update theta via MLE, select next question,
    and terminate + finalise when stopping criteria are met.
    """
    r = _redis()
    qb = get_question_bank_service()

    # 1. Load session
    pointer_key = _session_key_by_id(req.session_id)
    main_key    = r.get(pointer_key)
    if not main_key:
        raise HTTPException(status_code=404, detail="Quiz session not found or expired.")
    raw = r.get(main_key)
    if not raw:
        raise HTTPException(status_code=404, detail="Quiz session data missing.")
    session = json.loads(raw)

    if session["status"] != "active":
        raise HTTPException(status_code=400, detail="Quiz session is already completed.")

    # 2. Find the answered question in pool
    pool = session["questions_pool"]
    q_map = {q["id"]: q for q in pool}
    q = q_map.get(req.question_id)
    if not q:
        raise HTTPException(status_code=404, detail="Question not found in this session.")
    q = _normalize_question(q)   # ensure a/b/c keys present

    a, b, c = q["a"], q["b"], q["c"]
    is_correct = (req.selected_option.upper() == q["correct_option"].upper())

    theta_before = session["theta_current"]

    # 3. Append response and update theta
    session["responses"].append({"a": a, "b": b, "c": c, "correct": is_correct})
    session["questions_answered"].append(req.question_id)
    if is_correct:
        session["correct_count"] = session.get("correct_count", 0) + 1

    new_theta = update_theta_mle(theta_before, session["responses"])
    new_se    = compute_standard_error(new_theta, session["responses"])

    # Log Fisher Information of this item
    from services.irt_service import fisher_information
    info_val = fisher_information(theta_before, a, b, c)

    session["question_details"].append({
        "question_id":    req.question_id,
        "selected_option": req.selected_option.upper(),
        "is_correct":     is_correct,
        "time_taken_sec": req.time_taken_sec,
        "theta_before":   round(theta_before, 4),
        "theta_after":    round(new_theta, 4),
        "info_val":       round(info_val, 4),
    })
    session["theta_current"] = new_theta
    session["se_current"]    = new_se

    # 4. Update question empirical stats (non-blocking)
    try:
        qb.update_question_stats(req.question_id, is_correct)
    except Exception:
        pass

    answered_count = len(session["questions_answered"])
    terminate = should_terminate(new_se, answered_count)

    if not terminate:
        # 5a. Select next question
        next_q = select_next_question(new_theta, pool, session["questions_answered"])
        if next_q is None:
            terminate = True  # exhausted pool

    # Save updated session
    r.setex(main_key, SESSION_TTL, json.dumps(session))
    r.setex(pointer_key, SESSION_TTL, main_key)

    base_response = {
        "is_correct":     is_correct,
        "correct_option": q["correct_option"],
        "explanation":    q.get("explanation", ""),
        "theta_updated":  round(new_theta, 4),
        "se":             round(new_se, 4),
        "questions_answered": answered_count,
    }

    if not terminate:
        est_remaining = max(0, 20 - answered_count)
        return {
            **base_response,
            "terminated": False,
            "next_question": _sanitize_question(next_q, answered_count + 1),
            "progress": {
                "answered":           answered_count,
                "estimated_remaining": est_remaining,
            },
        }
    else:
        # 5b. Finalise
        result = _finalize_quiz(session, r, main_key, pointer_key)
        return {
            **base_response,
            "terminated": True,
            "final_result": result,
        }


# ── Internal: finalize_quiz ───────────────────────────────────────────────────

def _finalize_quiz(session: dict, r, main_key: str, pointer_key: str) -> dict:
    """
    Compute final IRT metrics, classify gaps, save to DB, update twin, clean Redis.
    """
    student_id  = session["student_id"]
    topic_id    = session["topic_id"]
    responses   = session["responses"]
    details     = session["question_details"]
    answered_n  = len(responses)
    correct_n   = session.get("correct_count", sum(1 for r_ in responses if r_["correct"]))

    final_theta = session["theta_current"]
    final_se    = session["se_current"]
    score_pct   = round((correct_n / answered_n) * 100, 1) if answered_n else 0.0

    # Topic metadata
    meta = _get_topic_meta(topic_id)
    topic_name    = meta.get("topic_name", "Unknown Topic")
    subject       = meta.get("subject", "Mathematics")
    board         = meta.get("board", "CBSE")
    grade         = meta.get("grade_level", "Class 12")
    base_hours    = float(meta.get("estimated_study_hours") or 2.0)

    # Knowledge graph: difficulty avg, gap classification, root cause
    kg  = get_knowledge_graph_service()
    diff_avg = kg.get_topic_difficulty_avg(topic_id, subject, board, grade)
    # Map difficulty_level (1-5) to IRT b scale (-3 to +3): b = (d - 3)
    diff_avg_b = (diff_avg - 3.0)

    gap_result = classify_gap(final_theta, diff_avg_b, final_se)
    rev_hours  = estimate_revision_hours(final_theta, diff_avg_b, base_hours)

    # Find prerequisite root causes
    # Get other gap topics from recent quiz attempts
    prereq_gaps = []
    try:
        conn = _db()
        cur = conn.cursor()
        cur.execute(
            "SELECT DISTINCT ON (topic_id) topic_id "
            "FROM quiz_attempts WHERE student_id=%s AND gap_detected=TRUE "
            "AND completed_at > NOW() - INTERVAL '30 days' "
            "ORDER BY topic_id, completed_at DESC",
            (student_id,),
        )
        gap_topic_ids = [str(r_["topic_id"]) for r_ in cur.fetchall()]
        if gap_result["has_gap"]:
            gap_topic_ids.append(topic_id)
        cur.close(); conn.close()

        prereq_gaps = kg.find_root_cause_gaps(gap_topic_ids, subject, board, grade)
    except Exception:
        pass

    # Persist quiz_attempts
    attempt_id = str(uuid.uuid4())
    try:
        conn = _db()
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO quiz_attempts
               (id, student_id, topic_id, theta_estimate, score_percent,
                questions_attempted, gap_detected, completed_at)
               VALUES (%s,%s,%s,%s,%s,%s,%s,NOW())""",
            (attempt_id, student_id, topic_id,
             float(final_theta), float(score_pct), int(answered_n), bool(gap_result["has_gap"])),
        )
        # Persist item responses
        for d in details:
            cur.execute(
                """INSERT INTO quiz_item_responses
                   (attempt_id, student_id, question_id, selected_option,
                    is_correct, time_taken_sec, theta_before, theta_after,
                    information_value, answered_at)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW())""",
                (attempt_id, student_id, d["question_id"],
                 d["selected_option"], bool(d["is_correct"]), int(d["time_taken_sec"]),
                 float(d["theta_before"]), float(d["theta_after"]), float(d["info_val"])),
            )
        conn.commit()
        cur.close(); conn.close()
    except Exception as e:
        print(f"[finalize_quiz] DB error: {e}")

    # Fire-and-forget: update digital twin
    try:
        with httpx.Client(timeout=3.0) as client:
            client.post(f"{AI_ENGINE_URL}/api/ai/twin/update", json={
                "student_id":   student_id,
                "session_data": {"duration_min": 0, "completed": True},
                "quiz_data": {
                    "topic_id":    topic_id,
                    "score_pct":   float(score_pct),
                    "theta_final": float(final_theta),
                    "gap_detected": bool(gap_result["has_gap"]),
                },
            })
    except Exception as e:
        print(f"[finalize_quiz] Twin update error: {e}")

    # Clean Redis
    try:
        r.delete(main_key)
        r.delete(pointer_key)
    except Exception:
        pass

    # Next suggested topic
    next_topic = None
    try:
        dependents = kg.get_dependent_topics(topic_id, subject, board, grade)
        if dependents and not gap_result["has_gap"]:
            conn = _db()
            cur = conn.cursor()
            cur.execute("SELECT id, topic_name FROM topics WHERE id=%s", (dependents[0],))
            nt = cur.fetchone()
            if nt:
                next_topic = {"topic_id": str(nt["id"]), "topic_name": nt["topic_name"]}
            cur.close(); conn.close()
    except Exception:
        pass

    label = _performance_label(final_theta)
    recs  = _build_recommendations(gap_result, prereq_gaps, topic_name)

    return {
        "session_id":        session["session_id"],
        "topic_name":        topic_name,
        "subject":           subject,
        "final_theta":       round(final_theta, 4),
        "standard_error":    round(final_se, 4),
        "score_percent":     score_pct,
        "questions_answered": answered_n,
        "correct_count":     correct_n,
        "gap_analysis": {
            "has_gap":              gap_result["has_gap"],
            "severity":             gap_result["severity"],
            "confidence":           round(gap_result["confidence"], 3),
            "revision_hours_needed": round(rev_hours, 1),
        },
        "prerequisite_gaps": prereq_gaps[:5],
        "performance_label": label,
        "recommendations":   recs,
        "next_suggested_topic": next_topic,
        "completed_at":      datetime.now(timezone.utc).isoformat(),
    }


# ── GET /api/ai/quiz/gap-report/{student_id} ─────────────────────────────────

@router.get("/gap-report/{student_id}")
def get_gap_report(student_id: str):
    """
    Aggregated gap report across all topics for a student.
    Uses last 60 days of quiz_attempts, one per topic (most recent).
    """
    try:
        conn = _db()
        cur = conn.cursor()
        cur.execute(
            """SELECT DISTINCT ON (qa.topic_id)
                 qa.topic_id, qa.theta_estimate, qa.score_percent,
                 qa.gap_detected, qa.completed_at,
                 t.topic_name, t.subject, t.board, t.grade_level,
                 t.estimated_study_hours, t.difficulty_level
               FROM quiz_attempts qa
               JOIN topics t ON t.id = qa.topic_id
               WHERE qa.student_id = %s
                 AND qa.completed_at > NOW() - INTERVAL '60 days'
               ORDER BY qa.topic_id, qa.completed_at DESC""",
            (student_id,),
        )
        rows = [dict(r) for r in cur.fetchall()]
        cur.close(); conn.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error: {str(e)}")

    if not rows:
        return {
            "success": True,
            "overall_mastery_percent": 0.0,
            "topics_assessed": 0,
            "subjects": [],
            "priority_gaps": [],
            "total_revision_hours_needed": 0.0,
            "message": "No quiz attempts found in the last 60 days.",
        }

    kg = get_knowledge_graph_service()

    # Group by subject
    by_subject: dict[str, list] = {}
    for row in rows:
        subj = row["subject"] or "Unknown"
        by_subject.setdefault(subj, []).append(row)

    # All-theta for mastery %
    all_thetas = [float(r["theta_estimate"] or 0.0) for r in rows]
    # Map theta [-3,+3] → [0,100]
    overall_mastery = round(sum((t + 3) / 6 * 100 for t in all_thetas) / len(all_thetas), 1)

    subjects_out = []
    all_gap_ids  = []
    total_rev_hours = 0.0

    for subj, topic_rows in by_subject.items():
        topics_out = []
        thetas = []

        for tr in topic_rows:
            theta  = float(tr["theta_estimate"] or 0.0)
            board  = tr["board"] or "CBSE"
            grade  = tr["grade_level"] or "Class 12"
            d_lvl  = float(tr["difficulty_level"] or 3)
            d_b    = d_lvl - 3.0
            base_h = float(tr["estimated_study_hours"] or 2.0)

            gap    = classify_gap(theta, d_b, 0.5)
            rev_h  = estimate_revision_hours(theta, d_b, base_h)
            total_rev_hours += rev_h

            if gap["has_gap"]:
                all_gap_ids.append(str(tr["topic_id"]))

            thetas.append(theta)
            topics_out.append({
                "topic_id":       str(tr["topic_id"]),
                "topic_name":     tr["topic_name"],
                "theta":          round(theta, 3),
                "score_percent":  float(tr["score_percent"] or 0),
                "gap_severity":   gap["severity"],
                "gap_confidence": round(gap["confidence"], 3),
                "revision_hours": round(rev_h, 1),
                "last_assessed":  tr["completed_at"].isoformat() if tr["completed_at"] else None,
                "performance":    _performance_label(theta),
            })

        avg_theta = sum(thetas) / len(thetas)
        weakest   = min(topics_out, key=lambda x: x["theta"])
        strongest = max(topics_out, key=lambda x: x["theta"])

        # Root cause gaps for this subject
        sample = topics_out[0] if topics_out else {}
        root_causes = []
        if all_gap_ids:
            root_causes = kg.find_root_cause_gaps(
                all_gap_ids, subj, board, grade
            )[:3]

        subjects_out.append({
            "subject_name":   subj,
            "topics":         topics_out,
            "avg_theta":      round(avg_theta, 3),
            "weakest_topic":  weakest,
            "strongest_topic": strongest,
            "root_cause_gaps": root_causes,
        })

    # Global priority gaps: top 5 by revision hours
    priority_gaps = sorted(
        [t for s in subjects_out for t in s["topics"] if t["gap_severity"] != "none"],
        key=lambda x: x["revision_hours"],
        reverse=True,
    )[:5]

    return {
        "success":                   True,
        "student_id":                student_id,
        "overall_mastery_percent":   overall_mastery,
        "topics_assessed":           len(rows),
        "subjects":                  subjects_out,
        "priority_gaps":             priority_gaps,
        "total_revision_hours_needed": round(total_rev_hours, 1),
        "generated_at":              datetime.now(timezone.utc).isoformat(),
    }
