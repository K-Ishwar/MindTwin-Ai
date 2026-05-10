"""
Quick local smoke-test for the scheduler algorithm.
Run from ai-engine directory: python test_scheduler_local.py
"""

import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from datetime import date, timedelta
from services.scheduler_service import generate_schedule
from models.scheduler_models import (
    ExamInput, StudentProfile, TopicDetail, QuizGap
)

today = date.today()

exams = [
    ExamInput(subject="Mathematics", exam_date=(today + timedelta(days=20)).isoformat(), topic_ids=[]),
    ExamInput(subject="Physics",     exam_date=(today + timedelta(days=30)).isoformat(), topic_ids=[]),
]

profile = StudentProfile(max_daily_hours=6, preferred_start_time="08:00", peer_cluster_id=2)

topics = [
    TopicDetail(id="t1", topic_name="Algebra",         subject="Mathematics", weightage_percent=20, estimated_study_hours=3, difficulty_level=3),
    TopicDetail(id="t2", topic_name="Calculus",        subject="Mathematics", weightage_percent=15, estimated_study_hours=4, difficulty_level=4, prerequisite_topic_ids=["t1"]),
    TopicDetail(id="t3", topic_name="Mechanics",       subject="Physics",     weightage_percent=20, estimated_study_hours=3, difficulty_level=3),
    TopicDetail(id="t4", topic_name="Thermodynamics",  subject="Physics",     weightage_percent=15, estimated_study_hours=2, difficulty_level=4),
    TopicDetail(id="t5", topic_name="Trigonometry",    subject="Mathematics", weightage_percent=10, estimated_study_hours=2, difficulty_level=2),
]

gaps = [
    QuizGap(topic_id="t1", gap_score=0.8),
    QuizGap(topic_id="t3", gap_score=0.9),
]

schedule, stats, warnings = generate_schedule(
    student_id="test-student",
    exams=exams,
    student_profile=profile,
    topic_details=topics,
    quiz_gaps=gaps,
    start_date=today.isoformat(),
)

print(f"\n✅ Schedule generated: {len(schedule)} days")
print(f"   Coverage: {stats.scheduled_topics}/{stats.total_topics} topics ({stats.estimated_completion_percent}%)")
if warnings:
    print(f"   Warnings: {warnings}")

# Assertions
assert len(schedule) > 0, "Schedule must not be empty"
assert stats.total_topics == 5
assert stats.scheduled_topics > 0
assert stats.estimated_completion_percent > 0

# Prerequisite check: t1 (Algebra) must appear before t2 (Calculus)
t1_first_date = None
t2_first_date = None
for day in schedule:
    for slot in day.slots:
        if slot.topic_id == "t1" and t1_first_date is None:
            t1_first_date = day.date
        if slot.topic_id == "t2" and t2_first_date is None:
            t2_first_date = day.date

if t1_first_date and t2_first_date:
    assert t1_first_date <= t2_first_date, \
        f"Prerequisite violation: Calculus ({t2_first_date}) scheduled before Algebra ({t1_first_date})"
    print(f"   ✅ Prerequisite order correct: Algebra ({t1_first_date}) → Calculus ({t2_first_date})")

# Revision check: buffer slots should exist before exams
revision_slots = [s for d in schedule for s in d.slots if s.is_revision]
assert len(revision_slots) > 0, "No revision slots found"
print(f"   ✅ Revision slots: {len(revision_slots)}")

# Print first 3 days as sample
print("\nSample schedule (first 3 days):")
for day in schedule[:3]:
    print(f"  {day.date}:")
    for slot in day.slots:
        rev = "[REV]" if slot.is_revision else "     "
        name = slot.topic_name or "(free)"
        print(f"    {rev} Slot {slot.slot_number} @ {slot.start_time} — {name}")

print("\n🎉 All assertions passed!\n")
