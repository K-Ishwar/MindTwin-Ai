CREATE TABLE IF NOT EXISTS wellness_interventions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    intervention_type VARCHAR(100),
    action_taken VARCHAR(50),
    stress_score_at_time FLOAT,
    acknowledged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_wellness_interventions_student ON wellness_interventions(student_id);
