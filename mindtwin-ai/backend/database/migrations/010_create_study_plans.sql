-- Migration: Create study_plans table
-- Stores AI-generated personalised study schedules per student

CREATE TABLE IF NOT EXISTS study_plans (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  plan_data        JSONB NOT NULL,
  generated_at     TIMESTAMP DEFAULT NOW(),
  is_active        BOOLEAN DEFAULT TRUE,
  generation_reason VARCHAR(50) DEFAULT 'initial'
);

-- Index for fast active plan lookups
CREATE INDEX IF NOT EXISTS idx_study_plans_student_active
  ON study_plans(student_id, is_active);
