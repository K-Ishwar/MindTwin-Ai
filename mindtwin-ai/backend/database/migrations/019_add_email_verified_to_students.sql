-- Migration 019: Add email_verified column to students table
-- Required for Phase 8.5 — weekly digest emails only sent to verified addresses.

ALTER TABLE students ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for fast lookup of verified students during digest fan-out
CREATE INDEX IF NOT EXISTS idx_students_email_verified
    ON students(email_verified)
    WHERE email_verified = TRUE;
