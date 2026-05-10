CREATE TABLE IF NOT EXISTS mood_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES students(id) ON DELETE CASCADE,
    mood_score INTEGER NOT NULL,
    notes TEXT,
    logged_at TIMESTAMP DEFAULT NOW()
);
