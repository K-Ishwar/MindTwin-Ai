CREATE TABLE IF NOT EXISTS quiz_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES students(id) ON DELETE CASCADE,
    topic_id UUID REFERENCES topics(id) ON DELETE CASCADE,
    theta_estimate FLOAT DEFAULT 0.0,
    score_percent FLOAT,
    questions_attempted INTEGER,
    gap_detected BOOLEAN DEFAULT FALSE,
    completed_at TIMESTAMP DEFAULT NOW()
);
