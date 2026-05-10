CREATE TABLE IF NOT EXISTS stress_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES students(id) ON DELETE CASCADE,
    stress_score FLOAT,
    severity VARCHAR(20),
    behavioral_snapshot JSONB,
    intervention_triggered VARCHAR(100),
    logged_at TIMESTAMP DEFAULT NOW()
);
