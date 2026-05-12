-- Migration 017: Admin accounts

CREATE TABLE IF NOT EXISTS admins (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          VARCHAR(100) NOT NULL,
    email         VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at    TIMESTAMP DEFAULT NOW()
);

-- Default admin account.
-- Password: AdminMindTwin2025!
-- Replace the hash below with the output of:
--   node -e "const b=require('bcrypt');b.hash('AdminMindTwin2025!',12).then(console.log)"
INSERT INTO admins (name, email, password_hash)
VALUES (
    'Platform Admin',
    'admin@mindtwin.ai',
    '$2b$12$placeholder_hash_replace_with_real'
)
ON CONFLICT (email) DO NOTHING;
