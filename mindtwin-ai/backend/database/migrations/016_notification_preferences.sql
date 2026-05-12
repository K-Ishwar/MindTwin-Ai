-- Migration 016: Per-user notification preferences per category

CREATE TABLE IF NOT EXISTS notification_preferences (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Exactly one of student_id / guardian_id must be set
    student_id   UUID REFERENCES students(id) ON DELETE CASCADE,
    guardian_id  UUID REFERENCES guardian_accounts(id) ON DELETE CASCADE,
    category     VARCHAR(50) NOT NULL,
    enabled      BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at   TIMESTAMP DEFAULT NOW(),
    CONSTRAINT chk_one_owner CHECK (
        (student_id IS NOT NULL)::int + (guardian_id IS NOT NULL)::int = 1
    ),
    UNIQUE (student_id, category),
    UNIQUE (guardian_id, category)
);

CREATE INDEX IF NOT EXISTS idx_notif_prefs_student  ON notification_preferences(student_id);
CREATE INDEX IF NOT EXISTS idx_notif_prefs_guardian ON notification_preferences(guardian_id);

-- Guardian notifications table (separate from student notifications)
CREATE TABLE IF NOT EXISTS guardian_notifications (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guardian_id UUID NOT NULL REFERENCES guardian_accounts(id) ON DELETE CASCADE,
    student_id  UUID REFERENCES students(id) ON DELETE SET NULL,
    type        VARCHAR(100),
    title       VARCHAR(255),
    body        TEXT,
    data        JSONB,
    read        BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_guardian_notif_guardian_id ON guardian_notifications(guardian_id);
CREATE INDEX IF NOT EXISTS idx_guardian_notif_created_at  ON guardian_notifications(created_at);
