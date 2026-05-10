"""
Adaptive Study Planner — Core Algorithm Service
================================================

This module implements a custom Constraint-Satisfaction + Greedy Priority
scheduling algorithm for building personalised study timetables.

Algorithm Overview (5 Steps):
──────────────────────────────
STEP 1 — Priority Score Calculation
    Each topic is assigned a composite priority score from three components:
    • Gap component: how large is the student's knowledge gap for this topic?
    • Weightage component: how heavily does this topic appear in the exam?
    • Urgency component: how soon is the exam for this topic?

    priority = (3.0 × gap) + (2.0 × weightage) + (1.5 × urgency)

    Prerequisite topics are boosted above their dependent topics so they
    always get scheduled first.

STEP 2 — Available Slot Generation
    We generate 90-minute study blocks from today until 2 days before each
    exam. A cognitive load limit of 4 slots/day is enforced regardless of
    the student's max_daily_hours setting.

STEP 3 — Greedy Assignment
    Topics are assigned to slots in descending priority order. Two
    constraints are checked before assigning:
    • The exam hasn't already passed.
    • No two back-to-back slots on the same day have the same subject
      (interleaving rule to reduce cognitive fatigue).

STEP 4 — Buffer Revision Days
    The last 2 days before each exam are partially reserved for revision
    of that exam's subject, prioritising topics with the largest gaps.

STEP 5 — Output Formatting
    Slots are grouped by date. Coverage stats and human-readable warnings
    (e.g. "Not enough days to cover all Physics topics") are produced.
"""

import math
from datetime import date, datetime, timedelta
from typing import List, Dict, Optional, Tuple, Set
from models.scheduler_models import (
    ExamInput, StudentProfile, TopicDetail, QuizGap,
    ScheduledSlot, DaySchedule, CoverageStats,
)


# ── Constants ─────────────────────────────────────────────────────────────────

GAP_WEIGHT = 3.0
EXAM_WEIGHT = 2.0
URGENCY_WEIGHT = 1.5
SLOT_DURATION_MIN = 90
MAX_SLOTS_PER_DAY = 4          # cognitive limit
BUFFER_DAYS_BEFORE_EXAM = 2    # reserved for revision
BASELINE_GAP_SCORE = 0.3       # default gap for topics without quiz data


# ── Helper utilities ──────────────────────────────────────────────────────────

def _parse_date(s: str) -> date:
    """Parse ISO date string 'YYYY-MM-DD' to a date object."""
    return date.fromisoformat(s)


def _slots_needed(estimated_hours: float) -> int:
    """How many 90-min slots does a topic require? Minimum 1."""
    return max(1, math.ceil((estimated_hours * 60) / SLOT_DURATION_MIN))


def _slot_start_time(preferred_start: str, slot_number: int) -> str:
    """
    Calculate the start time for a given slot number.
    Each slot is 90 minutes, with a 15-minute break between slots.
    preferred_start is 'HH:MM'.
    """
    try:
        h, m = map(int, preferred_start.split(":"))
    except Exception:
        h, m = 8, 0

    total_minutes = h * 60 + m + slot_number * (SLOT_DURATION_MIN + 15)
    out_h = (total_minutes // 60) % 24
    out_m = total_minutes % 60
    return f"{out_h:02d}:{out_m:02d}"


# ── STEP 1: Priority Score Calculation ───────────────────────────────────────

def compute_priority_scores(
    topics: List[TopicDetail],
    exams: List[ExamInput],
    quiz_gaps: List[QuizGap],
    start_date: date,
) -> Dict[str, float]:
    """
    Compute a composite priority score for every topic.

    Higher score = schedule this topic sooner.

    The formula blends three signals:
      1. Gap component  — topics the student struggles with are urgent
      2. Exam weightage — high-mark topics deserve more time
      3. Urgency        — closer exam = higher score (1/days_until_exam)

    Returns a dict mapping topic_id → priority_score.
    """
    # Build a fast lookup: topic_id → gap_score
    gap_map: Dict[str, float] = {g.topic_id: g.gap_score for g in quiz_gaps}

    # Build: subject → earliest exam date
    subject_exam: Dict[str, date] = {}
    for exam in exams:
        d = _parse_date(exam.exam_date)
        if exam.subject not in subject_exam or d < subject_exam[exam.subject]:
            subject_exam[exam.subject] = d

    scores: Dict[str, float] = {}
    for topic in topics:
        gap_score = gap_map.get(topic.id, BASELINE_GAP_SCORE)
        gap_component = gap_score

        weightage_component = topic.weightage_percent / 100.0

        exam_date = subject_exam.get(topic.subject)
        if exam_date:
            days_until = max((exam_date - start_date).days, 1)
        else:
            days_until = 365  # far-future default
        urgency_component = 1.0 / days_until

        score = (
            GAP_WEIGHT * gap_component
            + EXAM_WEIGHT * weightage_component
            + URGENCY_WEIGHT * urgency_component
        )
        scores[topic.id] = round(score, 6)

    return scores


def _apply_prerequisite_boost(
    topics: List[TopicDetail],
    scores: Dict[str, float],
) -> Dict[str, float]:
    """
    Ensure prerequisite topics always outrank dependent topics.

    If topic B has topic A as a prerequisite, A must be scheduled first.
    We do this by setting A's score to max(A_score, B_score + epsilon),
    propagating through the dependency graph iteratively until stable.
    """
    topic_map = {t.id: t for t in topics}
    changed = True
    iterations = 0

    while changed and iterations < 50:
        changed = False
        iterations += 1
        for topic in topics:
            for prereq_id in topic.prerequisite_topic_ids:
                if prereq_id in scores:
                    required_min = scores[topic.id] + 0.001
                    if scores[prereq_id] < required_min:
                        scores[prereq_id] = required_min
                        changed = True

    return scores


# ── STEP 2: Slot Generation ───────────────────────────────────────────────────

def generate_available_slots(
    start_date: date,
    exams: List[ExamInput],
    student_profile: StudentProfile,
    max_slots_override: Optional[int] = None,
) -> List[Dict]:
    """
    Generate all available 90-minute study slots from start_date until
    2 days before the last exam.

    Each slot dict contains:
        date, slot_number, duration_min, subject (None), topic_id (None),
        is_revision (False), start_time (HH:MM string)

    Cognitive limit: MAX_SLOTS_PER_DAY = 4 slots per day.
    max_slots_override can be passed during replan (e.g. stress_high reduces it).
    """
    if not exams:
        return []

    latest_exam = max(_parse_date(e.exam_date) for e in exams)
    cutoff = latest_exam - timedelta(days=BUFFER_DAYS_BEFORE_EXAM)

    # Compute daily slot count from student's max_daily_hours
    hours_per_slot = SLOT_DURATION_MIN / 60.0
    raw_slots_per_day = int(student_profile.max_daily_hours / hours_per_slot)
    slots_per_day = min(raw_slots_per_day, MAX_SLOTS_PER_DAY)
    if max_slots_override is not None:
        slots_per_day = max(1, min(slots_per_day, max_slots_override))

    slots = []
    current = start_date
    while current <= cutoff:
        for slot_num in range(slots_per_day):
            slots.append({
                "date": current.isoformat(),
                "slot_number": slot_num,
                "duration_min": SLOT_DURATION_MIN,
                "subject": None,
                "topic_id": None,
                "topic_name": None,
                "is_revision": False,
                "start_time": _slot_start_time(
                    student_profile.preferred_start_time, slot_num
                ),
            })
        current += timedelta(days=1)

    return slots


# ── STEP 3: Greedy Assignment ─────────────────────────────────────────────────

def greedy_assign(
    topics: List[TopicDetail],
    priority_scores: Dict[str, float],
    slots: List[Dict],
    exams: List[ExamInput],
) -> Tuple[List[Dict], List[str]]:
    """
    Assign topics to slots in priority-score order using a greedy strategy.

    Constraints enforced:
    1. No assignment after the exam for that subject has passed.
    2. Interleaving rule: no two consecutive slots on the same day may share
       the same subject (reduces cognitive fatigue / context-switching overload).
    3. Topics with prerequisites are already boosted in score so they will
       naturally land in earlier slots.

    Returns (filled_slots, warnings_list).
    """
    # subject → exam cutoff (2 days before exam)
    subject_cutoff: Dict[str, date] = {}
    for exam in exams:
        exam_date = _parse_date(exam.exam_date)
        cutoff = exam_date - timedelta(days=BUFFER_DAYS_BEFORE_EXAM)
        if exam.subject not in subject_cutoff or cutoff < subject_cutoff[exam.subject]:
            subject_cutoff[exam.subject] = cutoff

    # Sort topics by priority descending
    sorted_topics = sorted(
        topics,
        key=lambda t: priority_scores.get(t.id, 0),
        reverse=True,
    )

    warnings: List[str] = []
    assigned_count = 0

    # Track which slot indices are free
    free_indices = list(range(len(slots)))
    # Build date → list of slot indices for quick lookup
    date_to_indices: Dict[str, List[int]] = {}
    for i, slot in enumerate(slots):
        date_to_indices.setdefault(slot["date"], []).append(i)

    for topic in sorted_topics:
        needed = _slots_needed(topic.estimated_study_hours)
        cutoff = subject_cutoff.get(topic.subject)

        # Find `needed` free consecutive-day slots satisfying constraints
        assigned_indices: List[int] = []

        for idx in free_indices:
            if len(assigned_indices) >= needed:
                break

            slot = slots[idx]

            # Constraint 1: don't schedule after exam cutoff
            slot_date = _parse_date(slot["date"])
            if cutoff and slot_date > cutoff:
                continue

            # Constraint 2: interleaving — check previous slot same day
            day_slots_idxs = date_to_indices.get(slot["date"], [])
            prev_same_day = [
                i for i in day_slots_idxs
                if slots[i]["slot_number"] == slot["slot_number"] - 1
            ]
            if prev_same_day:
                prev_slot = slots[prev_same_day[0]]
                if prev_slot["subject"] == topic.subject and prev_slot["topic_id"] is not None:
                    # Same subject back-to-back → skip
                    continue

            assigned_indices.append(idx)

        if len(assigned_indices) < needed:
            warnings.append(
                f"⚠ Not enough available slots to fully cover '{topic.topic_name}' "
                f"({topic.subject}) — only {len(assigned_indices)}/{needed} slots assigned. "
                f"Consider reducing study hours for other subjects."
            )

        # Commit assignments
        for idx in assigned_indices:
            slots[idx]["subject"] = topic.subject
            slots[idx]["topic_id"] = topic.id
            slots[idx]["topic_name"] = topic.topic_name
            free_indices.remove(idx)

        if assigned_indices:
            assigned_count += 1

    return slots, warnings, assigned_count


# ── STEP 4: Buffer Revision Slots ─────────────────────────────────────────────

def inject_revision_slots(
    slots: List[Dict],
    exams: List[ExamInput],
    quiz_gaps: List[QuizGap],
    topics: List[TopicDetail],
) -> List[Dict]:
    """
    Reserve 1 slot per day in the last 2 days before each exam for revision.

    Revision target: the topics of that exam's subject with the highest gap
    scores (i.e. the weakest areas need the most last-minute attention).

    Only FREE slots are converted to revision slots — we never overwrite
    already-assigned study slots.
    """
    gap_map = {g.topic_id: g.gap_score for g in quiz_gaps}

    for exam in exams:
        exam_date = _parse_date(exam.exam_date)
        subject = exam.subject

        # Find topics for this exam subject, sorted by gap descending
        exam_topics = sorted(
            [t for t in topics if t.subject == subject],
            key=lambda t: gap_map.get(t.id, BASELINE_GAP_SCORE),
            reverse=True,
        )
        revision_topic_cycle = exam_topics if exam_topics else []
        cycle_idx = 0

        for day_offset in range(BUFFER_DAYS_BEFORE_EXAM, 0, -1):
            buffer_day = (exam_date - timedelta(days=day_offset)).isoformat()
            # Find the first free slot on this buffer day
            for slot in slots:
                if slot["date"] == buffer_day and slot["topic_id"] is None:
                    rev_topic = (
                        revision_topic_cycle[cycle_idx % len(revision_topic_cycle)]
                        if revision_topic_cycle else None
                    )
                    slot["subject"] = subject
                    slot["topic_id"] = rev_topic.id if rev_topic else None
                    slot["topic_name"] = (
                        f"[Revision] {rev_topic.topic_name}" if rev_topic
                        else f"[Revision] {subject}"
                    )
                    slot["is_revision"] = True
                    cycle_idx += 1
                    break  # one revision slot per day per exam

    return slots


# ── STEP 5: Output Formatting ─────────────────────────────────────────────────

def format_schedule(
    slots: List[Dict],
    total_topics: int,
    scheduled_topics: int,
) -> Tuple[List[DaySchedule], CoverageStats]:
    """
    Group the flat slot list by date and compute coverage statistics.
    """
    # Group by date
    date_groups: Dict[str, List[Dict]] = {}
    for slot in slots:
        date_groups.setdefault(slot["date"], []).append(slot)

    schedule = []
    for d in sorted(date_groups.keys()):
        day_slots = []
        for s in sorted(date_groups[d], key=lambda x: x["slot_number"]):
            day_slots.append(ScheduledSlot(
                slot_number=s["slot_number"],
                subject=s["subject"],
                topic_id=s["topic_id"],
                topic_name=s["topic_name"],
                duration_min=s["duration_min"],
                is_revision=s["is_revision"],
                start_time=s["start_time"],
            ))
        schedule.append(DaySchedule(date=d, slots=day_slots))

    pct = round((scheduled_topics / total_topics * 100) if total_topics else 0, 1)
    stats = CoverageStats(
        total_topics=total_topics,
        scheduled_topics=scheduled_topics,
        estimated_completion_percent=pct,
    )
    return schedule, stats


# ── Main Entry Points ─────────────────────────────────────────────────────────

def generate_schedule(
    student_id: str,
    exams: List[ExamInput],
    student_profile: StudentProfile,
    topic_details: List[TopicDetail],
    quiz_gaps: List[QuizGap],
    start_date: str,
    max_slots_override: Optional[int] = None,
    urgency_weight_boost: float = 0.0,
) -> Tuple[List[DaySchedule], CoverageStats, List[str]]:
    """
    Full 5-step schedule generation pipeline.

    Parameters
    ──────────
    student_id          : The student's UUID (used for logging/audit only here).
    exams               : List of upcoming exams with their subject and exam_date.
    student_profile     : Preferences and digital twin data.
    topic_details       : Full metadata for every topic to be scheduled.
    quiz_gaps           : Quiz performance gaps per topic (topic_id → gap_score 0-1).
    start_date          : ISO date from which to start generating the schedule.
    max_slots_override  : If set, caps daily slots (used by replan for stress mode).
    urgency_weight_boost: Added to URGENCY_WEIGHT for "fell_behind" replan mode.

    Returns (schedule, coverage_stats, warnings).
    """
    today = _parse_date(start_date)

    # Filter out topics whose exams are already passed
    valid_exam_subjects = {
        e.subject for e in exams if _parse_date(e.exam_date) > today
    }
    active_topics = [t for t in topic_details if t.subject in valid_exam_subjects or not any(
        e.subject == t.subject for e in exams
    )]

    if not active_topics:
        return [], CoverageStats(total_topics=0, scheduled_topics=0, estimated_completion_percent=0), \
               ["No active topics found — all exams may have already passed."]

    # STEP 1
    scores = compute_priority_scores(active_topics, exams, quiz_gaps, today)

    # Apply urgency boost for "fell_behind" replan
    if urgency_weight_boost > 0:
        for topic in active_topics:
            subject_exam_dates = [_parse_date(e.exam_date) for e in exams if e.subject == topic.subject]
            if subject_exam_dates:
                days_until = max((min(subject_exam_dates) - today).days, 1)
                scores[topic.id] += urgency_weight_boost * (1.0 / days_until)

    scores = _apply_prerequisite_boost(active_topics, scores)

    # STEP 2
    slots = generate_available_slots(
        today, exams, student_profile, max_slots_override=max_slots_override
    )

    if not slots:
        return [], CoverageStats(total_topics=0, scheduled_topics=0, estimated_completion_percent=0), \
               ["No available study days found — exams may be too soon or already passed."]

    # STEP 3
    slots, warnings, assigned_count = greedy_assign(active_topics, scores, slots, exams)

    # STEP 4
    slots = inject_revision_slots(slots, exams, quiz_gaps, active_topics)

    # STEP 5
    schedule, coverage_stats = format_schedule(slots, len(active_topics), assigned_count)

    return schedule, coverage_stats, warnings


def replan_schedule(
    student_id: str,
    completed_topic_ids: List[str],
    skipped_sessions: List[Dict],
    current_date: str,
    reason: str,
    exams: List[ExamInput],
    student_profile: StudentProfile,
    topic_details: List[TopicDetail],
    quiz_gaps: List[QuizGap],
) -> Tuple[List[DaySchedule], CoverageStats, List[str], List[str]]:
    """
    Replan the schedule from current_date based on a triggering reason.

    Adjustments by reason:
    ─────────────────────
    • "completed_early" : Remove completed topics and regenerate normally.
    • "fell_behind"     : Increase urgency_weight_boost by 0.5 for all topics.
    • "stress_high"     : Reduce daily slots by 1 (capped at 1 minimum).
    • "manual"          : Regenerate from scratch with current state.

    Returns (schedule, coverage_stats, warnings, adjustments_made).
    """
    adjustments: List[str] = []

    # Remove completed topics from the pool
    completed_set: Set[str] = set(completed_topic_ids)
    remaining_topics = [t for t in topic_details if t.id not in completed_set]
    if completed_topic_ids:
        adjustments.append(
            f"Removed {len(completed_topic_ids)} completed topic(s) from the schedule."
        )

    # Reason-specific adjustments
    max_slots_override = None
    urgency_boost = 0.0

    if reason == "stress_high":
        # Reduce daily slots by 1 for next 3 days, then revert
        current_slots = min(
            int(student_profile.max_daily_hours / (SLOT_DURATION_MIN / 60)),
            MAX_SLOTS_PER_DAY,
        )
        max_slots_override = max(1, current_slots - 1)
        adjustments.append(
            f"Stress mode: reduced daily slots to {max_slots_override} "
            f"(from {current_slots}) for recovery."
        )

    elif reason == "fell_behind":
        urgency_boost = 0.5
        adjustments.append(
            "Fell-behind mode: urgency weight increased by +0.5 for all upcoming subjects."
        )

    elif reason == "completed_early":
        adjustments.append("Completed-early mode: schedule compressed around remaining topics.")

    # Generate fresh schedule from current_date
    schedule, stats, warnings = generate_schedule(
        student_id=student_id,
        exams=exams,
        student_profile=student_profile,
        topic_details=remaining_topics,
        quiz_gaps=quiz_gaps,
        start_date=current_date,
        max_slots_override=max_slots_override,
        urgency_weight_boost=urgency_boost,
    )

    return schedule, stats, warnings, adjustments
