CREATE TABLE IF NOT EXISTS focus_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID UNIQUE REFERENCES students(id) ON DELETE CASCADE,
    balance INTEGER DEFAULT 0,
    earned_today INTEGER DEFAULT 0,
    social_media_mins_unlocked INTEGER DEFAULT 0,
    last_reset DATE DEFAULT CURRENT_DATE
);
