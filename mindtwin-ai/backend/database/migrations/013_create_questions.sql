-- Migration 013: Questions table with IRT parameters
-- Stores MCQ questions calibrated with 3PL IRT item parameters

CREATE TABLE IF NOT EXISTS questions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic_id        UUID REFERENCES topics(id) ON DELETE SET NULL,
    subject         VARCHAR(100) NOT NULL,
    board           VARCHAR(30)  NOT NULL,
    grade_level     VARCHAR(20)  NOT NULL,
    question_text   TEXT NOT NULL,
    option_a        TEXT NOT NULL,
    option_b        TEXT NOT NULL,
    option_c        TEXT NOT NULL,
    option_d        TEXT NOT NULL,
    correct_option  CHAR(1) NOT NULL CHECK (correct_option IN ('A','B','C','D')),
    explanation     TEXT,
    -- IRT Parameters (3PL model, calibrated)
    irt_a           FLOAT DEFAULT 1.0,   -- discrimination [0.5, 2.5]
    irt_b           FLOAT DEFAULT 0.0,   -- difficulty     [-3, +3]
    irt_c           FLOAT DEFAULT 0.25,  -- guessing       [0, 0.35]
    -- Human-readable difficulty label
    difficulty_label VARCHAR(10) DEFAULT 'medium',  -- easy / medium / hard
    -- Stats for empirical recalibration
    times_answered  INTEGER DEFAULT 0,
    times_correct   INTEGER DEFAULT 0,
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_questions_topic
    ON questions(topic_id);
CREATE INDEX IF NOT EXISTS idx_questions_subject_board
    ON questions(subject, board, grade_level);
CREATE INDEX IF NOT EXISTS idx_questions_irt_b
    ON questions(irt_b);
