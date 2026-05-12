-- Migration 020: Performance indexes — Phase 9.3
-- Covers the most frequent query patterns identified across all services.
-- All indexes use IF NOT EXISTS so re-running is safe.

-- ── study_sessions ────────────────────────────────────────────────────────────
-- Queried by student + date in getTodaySessions and twin batch update
CREATE INDEX IF NOT EXISTS idx_sessions_student_date
    ON study_sessions(student_id, started_at DESC);

-- Queried by student + completed flag in streak calculation and replan
CREATE INDEX IF NOT EXISTS idx_sessions_student_completed
    ON study_sessions(student_id, completed, started_at DESC);

-- Queried by student + topic in session history lookups
CREATE INDEX IF NOT EXISTS idx_sessions_student_topic
    ON study_sessions(student_id, topic_id);

-- ── quiz_attempts ─────────────────────────────────────────────────────────────
-- Queried by student + topic in IRT and gap detection
CREATE INDEX IF NOT EXISTS idx_quiz_student_topic
    ON quiz_attempts(student_id, topic_id, created_at DESC);

-- Queried by student + gap_detected in replan and analytics
CREATE INDEX IF NOT EXISTS idx_quiz_student_gap
    ON quiz_attempts(student_id, gap_detected, created_at DESC);

-- ── stress_logs ───────────────────────────────────────────────────────────────
-- Queried by student + time in nightly stress checks
CREATE INDEX IF NOT EXISTS idx_stress_student_time
    ON stress_logs(student_id, created_at DESC);

-- ── mood_logs ─────────────────────────────────────────────────────────────────
-- Queried by student + date in behavioral pipeline
CREATE INDEX IF NOT EXISTS idx_mood_student_date
    ON mood_logs(student_id, logged_at DESC);

-- ── token_history ─────────────────────────────────────────────────────────────
-- Queried by student for recent events in getBalance
CREATE INDEX IF NOT EXISTS idx_token_history_student
    ON token_history(student_id, created_at DESC);

-- ── notifications ─────────────────────────────────────────────────────────────
-- Queried by recipient + read status in getNotifications
CREATE INDEX IF NOT EXISTS idx_notifications_recipient
    ON notifications(student_id, read, created_at DESC);

-- ── topics ────────────────────────────────────────────────────────────────────
-- Frequently joined with sessions and quiz_attempts; filtered by subject/board
CREATE INDEX IF NOT EXISTS idx_topics_subject_board
    ON topics(subject, board, grade_level);

-- ── study_plans ───────────────────────────────────────────────────────────────
-- Partial index — only active plans are ever queried in hot paths
CREATE INDEX IF NOT EXISTS idx_active_plans
    ON study_plans(student_id)
    WHERE is_active = TRUE;

-- ── exams ─────────────────────────────────────────────────────────────────────
-- Queried by student + upcoming date in stress checks and scheduler
CREATE INDEX IF NOT EXISTS idx_exams_student_date
    ON exams(student_id, exam_date ASC)
    WHERE exam_date >= CURRENT_DATE;

-- ── quiz_item_responses ───────────────────────────────────────────────────────
-- Queried by student + time in IRT theta history
CREATE INDEX IF NOT EXISTS idx_item_responses_student_time
    ON quiz_item_responses(student_id, answered_at DESC);

-- ── insight_dismissals ────────────────────────────────────────────────────────
-- Queried by student in getInsights
CREATE INDEX IF NOT EXISTS idx_insight_dismissals_student
    ON insight_dismissals(student_id);

-- ── digital_twins ─────────────────────────────────────────────────────────────
-- Queried by student in twin update batch and profile
CREATE INDEX IF NOT EXISTS idx_digital_twins_student
    ON digital_twins(student_id);

-- ── focus_tokens ──────────────────────────────────────────────────────────────
-- Queried by student in getBalance and daily reset
CREATE INDEX IF NOT EXISTS idx_focus_tokens_student
    ON focus_tokens(student_id);

-- ── Update query planner statistics ──────────────────────────────────────────
-- ANALYZE is non-blocking and safe to run at any time
ANALYZE students;
ANALYZE study_sessions;
ANALYZE quiz_attempts;
ANALYZE stress_logs;
ANALYZE mood_logs;
ANALYZE topics;
ANALYZE questions;
ANALYZE token_history;
ANALYZE notifications;
ANALYZE study_plans;
ANALYZE exams;
ANALYZE digital_twins;
ANALYZE focus_tokens;
