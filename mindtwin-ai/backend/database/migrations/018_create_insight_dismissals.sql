-- Migration 018: Insight dismissals — tracks which AI-generated insights a student has dismissed
-- Prevents re-surfacing dismissed insights in the analytics dashboard.

CREATE TABLE IF NOT EXISTS insight_dismissals (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id   UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    insight_id   VARCHAR(255) NOT NULL,   -- opaque ID from AI engine insight payload
    dismissed_at TIMESTAMP DEFAULT NOW(),

    CONSTRAINT uq_insight_dismissal UNIQUE (student_id, insight_id)
);

CREATE INDEX IF NOT EXISTS idx_insight_dismissals_student
    ON insight_dismissals(student_id);
