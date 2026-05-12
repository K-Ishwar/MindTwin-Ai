-- Guardian accounts for parents and teachers
CREATE TABLE IF NOT EXISTS guardian_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('parent', 'teacher')),
    institution_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Links between students and guardians (pending / approved / rejected)
CREATE TABLE IF NOT EXISTS student_guardian_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES students(id) ON DELETE CASCADE,
    guardian_id UUID REFERENCES guardian_accounts(id) ON DELETE CASCADE,
    link_status VARCHAR(20) DEFAULT 'pending' CHECK (link_status IN ('pending', 'approved', 'rejected')),
    linked_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(student_id, guardian_id)
);

-- Audit log: every time a guardian views student data
CREATE TABLE IF NOT EXISTS guardian_access_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guardian_id UUID REFERENCES guardian_accounts(id),
    student_id UUID REFERENCES students(id),
    action VARCHAR(100),
    accessed_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sgl_student_id    ON student_guardian_links(student_id);
CREATE INDEX IF NOT EXISTS idx_sgl_guardian_id   ON student_guardian_links(guardian_id);
CREATE INDEX IF NOT EXISTS idx_gal_guardian_id   ON guardian_access_logs(guardian_id);
CREATE INDEX IF NOT EXISTS idx_gal_student_id    ON guardian_access_logs(student_id);
