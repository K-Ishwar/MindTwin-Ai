CREATE TABLE IF NOT EXISTS exams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES students(id) ON DELETE CASCADE,
    subject VARCHAR(100) NOT NULL,
    exam_date DATE NOT NULL,
    board VARCHAR(30),
    syllabus_ref VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);
