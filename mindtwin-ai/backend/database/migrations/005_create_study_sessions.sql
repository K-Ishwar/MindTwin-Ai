CREATE TABLE IF NOT EXISTS study_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES students(id) ON DELETE CASCADE,
    topic_id UUID REFERENCES topics(id) ON DELETE CASCADE,
    planned_duration_min INTEGER,
    actual_duration_min INTEGER DEFAULT 0,
    completed BOOLEAN DEFAULT FALSE,
    skipped BOOLEAN DEFAULT FALSE,
    skip_reason VARCHAR(100),
    session_date DATE,
    started_at TIMESTAMP,
    ended_at TIMESTAMP,
    pomodoro_count INTEGER DEFAULT 0,
    mood_after INTEGER
);
