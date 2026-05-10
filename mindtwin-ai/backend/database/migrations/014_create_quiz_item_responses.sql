-- Migration 014: Quiz item responses — per-question IRT tracking
-- Records every question a student answers during an adaptive quiz,
-- capturing IRT theta before/after and Fisher Information for that item.

CREATE TABLE IF NOT EXISTS quiz_item_responses (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id        UUID REFERENCES quiz_attempts(id) ON DELETE CASCADE,
    student_id        UUID REFERENCES students(id) ON DELETE CASCADE,
    question_id       UUID REFERENCES questions(id) ON DELETE SET NULL,
    selected_option   CHAR(1) CHECK (selected_option IN ('A','B','C','D')),
    is_correct        BOOLEAN,
    time_taken_sec    INTEGER,              -- seconds student spent on question
    theta_before      FLOAT,               -- ability estimate before this answer
    theta_after       FLOAT,               -- ability estimate after MLE update
    information_value FLOAT,               -- Fisher Information of this item at theta_before
    answered_at       TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_item_responses_attempt
    ON quiz_item_responses(attempt_id);
CREATE INDEX IF NOT EXISTS idx_item_responses_student
    ON quiz_item_responses(student_id, answered_at DESC);
CREATE INDEX IF NOT EXISTS idx_item_responses_question
    ON quiz_item_responses(question_id);
