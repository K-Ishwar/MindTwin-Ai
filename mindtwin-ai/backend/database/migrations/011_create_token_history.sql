-- Migration: Add updated_at to focus_tokens + create token_history
-- Alters focus_tokens to add updated_at column (safe with IF NOT EXISTS guard)

ALTER TABLE focus_tokens
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Token history audit log
CREATE TABLE IF NOT EXISTS token_history (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id              UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  action                  VARCHAR(60) NOT NULL,
  tokens_delta            INTEGER NOT NULL DEFAULT 0,
  social_media_mins_delta INTEGER NOT NULL DEFAULT 0,
  balance_after           INTEGER NOT NULL DEFAULT 0,
  created_at              TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_token_history_student
  ON token_history(student_id, created_at DESC);
