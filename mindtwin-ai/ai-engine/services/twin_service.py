import numpy as np
from datetime import date, datetime
from typing import List, Dict, Any, Optional, Tuple
import json


# Peer cluster thresholds
PEER_CLUSTERS = [
    (-float("inf"), -1.0, 0, "Struggling Starter"),
    (-1.0,           0.0, 1, "Average Learner"),
    (0.0,            0.5, 2, "Capable but Inconsistent"),
    (0.5,            1.2, 3, "Strong Performer"),
    (1.2,   float("inf"), 4, "High Achiever"),
]


def _normalize(vec: np.ndarray) -> np.ndarray:
    """Clip all values to [0, 1]."""
    return np.clip(vec, 0.0, 1.0)


def _score_to_theta(score_percent: float) -> float:
    """Map 0–100 → -2 to +2 (IRT-style ability estimate)."""
    return (score_percent / 100.0) * 4.0 - 2.0


def _theta_to_normalized(theta: float) -> float:
    """Map -2..+2 → 0..1."""
    return (theta + 2.0) / 4.0


def assign_cluster(overall_theta: float) -> int:
    for lo, hi, cluster_id, _ in PEER_CLUSTERS:
        if lo <= overall_theta < hi:
            return cluster_id
    return 4


def build_initial_behavioral_features() -> Dict[str, Any]:
    return {
        "avg_daily_study_hours": 0,
        "avg_mood": 0,
        "sessions_this_week": 0,
        "quizzes_this_week": 0,
        "streak_days": 0,
        "last_active": date.today().isoformat(),
    }


def build_twin_vector(
    baseline_results: List[Dict],
    overall_theta: float,
) -> np.ndarray:
    """
    Construct a 64-dimension twin vector.

    dims  0– 9  : subject performance (average theta per topic bucket, 10 subjects)
    dims 10–19  : topic difficulty comfort (how well they did per difficulty bucket 1-5, doubled)
    dims 20–29  : time-of-day preference (0.5 initially)
    dims 30–39  : learning pace indicators (0.5 initially)
    dims 40–49  : stress indicators (0.0 initially)
    dims 50–59  : consistency indicators (0.5 initially)
    dims 60–63  : overall ability [normalized_theta, 0.5, 0.5, 0.5]
    """
    vec = np.zeros(64, dtype=float)

    # dims 0–9: distribute topic scores across 10 buckets round-robin
    if baseline_results:
        buckets = [[] for _ in range(10)]
        for i, r in enumerate(baseline_results):
            bucket = i % 10
            theta = _score_to_theta(r["score_percent"])
            buckets[bucket].append(theta)

        for i, bucket in enumerate(buckets):
            if bucket:
                vec[i] = _theta_to_normalized(float(np.mean(bucket)))
            else:
                vec[i] = 0.5  # neutral when no data

    # dims 10–19: difficulty comfort (score bucketed by which difficulty 1-5 → doubled to fill 10)
    if baseline_results:
        diff_scores = [[] for _ in range(10)]
        for i, r in enumerate(baseline_results):
            idx = i % 10
            diff_scores[idx].append(r["score_percent"] / 100.0)
        for i, scores in enumerate(diff_scores):
            vec[10 + i] = float(np.mean(scores)) if scores else 0.5
    else:
        vec[10:20] = 0.5

    # dims 20–29: time-of-day preference (neutral)
    vec[20:30] = 0.5

    # dims 30–39: learning pace indicators (neutral)
    vec[30:40] = 0.5

    # dims 40–49: stress indicators (zero = low stress at start)
    vec[40:50] = 0.0

    # dims 50–59: consistency indicators (neutral)
    vec[50:60] = 0.5

    # dims 60–63: overall ability indicators
    vec[60] = _theta_to_normalized(overall_theta)
    vec[61] = 0.5
    vec[62] = 0.5
    vec[63] = 0.5

    return _normalize(vec)


def initialize_twin(
    student_id: str,
    baseline_results: List[Dict],
) -> Dict[str, Any]:
    """Core algorithm for twin initialization."""

    # Step 1: Estimate theta per topic → average
    if baseline_results:
        thetas = [_score_to_theta(r["score_percent"]) for r in baseline_results]
        overall_theta = float(np.mean(thetas))
    else:
        overall_theta = 0.0  # neutral if no baseline

    # Step 2: Build 64-dim vector
    twin_vector = build_twin_vector(baseline_results, overall_theta)

    # Step 3: Assign peer cluster
    peer_cluster_id = assign_cluster(overall_theta)

    # Step 4: Initial behavioral features
    behavioral_features = build_initial_behavioral_features()

    return {
        "student_id": student_id,
        "twin_vector": twin_vector.tolist(),
        "peer_cluster_id": peer_cluster_id,
        "behavioral_features": behavioral_features,
        "theta_estimate": overall_theta,
    }


def update_twin(
    current_vector: List[float],
    current_behavioral: Dict[str, Any],
    session_data: Dict,
    quiz_data: Optional[Dict],
) -> Tuple[List[float], Dict[str, Any], List[int]]:
    """
    Partial update of the twin vector based on new session/quiz data.
    Returns (new_vector, new_behavioral, updated_dims)
    """
    vec = np.array(current_vector, dtype=float)
    updated_dims: List[int] = []
    bf = dict(current_behavioral) if current_behavioral else build_initial_behavioral_features()

    duration_min = session_data.get("duration_min", 0)
    mood_after = session_data.get("mood_after")
    completed = session_data.get("completed", False)
    planned_duration_min = session_data.get("planned_duration_min") or 30

    # ── Consistency dims (50-59): bump if session was completed ────────────
    if completed:
        for i in range(50, 60):
            vec[i] = min(1.0, vec[i] + 0.02)
            updated_dims.append(i)

    # ── Stress dims (40-49): derive from mood ──────────────────────────────
    if mood_after is not None:
        # mood 1-5; low mood → higher stress
        stress_value = (5 - mood_after) / 4.0
        for i in range(40, 50):
            # Exponential moving average
            vec[i] = vec[i] * 0.8 + stress_value * 0.2
            updated_dims.append(i)

    # ── Pace dims (30-39): based on actual vs planned duration ─────────────
    pace_ratio = min(duration_min / max(planned_duration_min, 1), 2.0)
    pace_norm = pace_ratio / 2.0  # 0..1
    for i in range(30, 40):
        vec[i] = vec[i] * 0.85 + pace_norm * 0.15
        updated_dims.append(i)

    # ── Quiz dims: update subject performance (0-9) ────────────────────────
    if quiz_data:
        score = quiz_data.get("score_percent", 50)
        theta = _score_to_theta(score)
        norm = _theta_to_normalized(theta)
        # Update first subject bucket as a quick proxy (real system would track topic→subject map)
        bucket = hash(quiz_data.get("topic_id", "")) % 10
        vec[bucket] = vec[bucket] * 0.8 + norm * 0.2
        updated_dims.append(bucket)

        # Update overall ability dim 60
        vec[60] = vec[60] * 0.85 + norm * 0.15
        updated_dims.append(60)

    # ── Behavioral features running averages ───────────────────────────────
    sessions = bf.get("sessions_this_week", 0) + 1
    bf["sessions_this_week"] = sessions

    current_avg_hours = bf.get("avg_daily_study_hours", 0)
    new_hours = duration_min / 60.0
    bf["avg_daily_study_hours"] = round(
        (current_avg_hours * (sessions - 1) + new_hours) / sessions, 2
    )

    if mood_after is not None:
        current_avg_mood = bf.get("avg_mood", 0)
        bf["avg_mood"] = round(
            (current_avg_mood * (sessions - 1) + mood_after) / sessions, 2
        )

    if quiz_data:
        bf["quizzes_this_week"] = bf.get("quizzes_this_week", 0) + 1

    bf["last_active"] = date.today().isoformat()

    vec = _normalize(vec)
    return vec.tolist(), bf, sorted(list(set(updated_dims)))
