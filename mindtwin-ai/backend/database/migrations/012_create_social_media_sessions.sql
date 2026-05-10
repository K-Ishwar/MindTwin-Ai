-- Migration: Create social_media_sessions table
-- Tracks individual social media unlock sessions per student

CREATE TABLE IF NOT EXISTS social_media_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  app_name        VARCHAR(60) NOT NULL,
  minutes_granted INTEGER NOT NULL,
  session_token   UUID NOT NULL DEFAULT gen_random_uuid(),
  used            BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMP DEFAULT NOW(),
  expires_at      TIMESTAMP DEFAULT (NOW() + INTERVAL '1 day')
);

CREATE INDEX IF NOT EXISTS idx_social_sessions_student
  ON social_media_sessions(student_id, created_at DESC);
