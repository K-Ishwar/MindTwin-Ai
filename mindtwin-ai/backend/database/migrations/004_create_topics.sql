CREATE TABLE IF NOT EXISTS topics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject VARCHAR(100) NOT NULL,
    topic_name VARCHAR(255) NOT NULL,
    subtopic_name VARCHAR(255),
    board VARCHAR(30),
    grade_level VARCHAR(20),
    weightage_percent FLOAT DEFAULT 5.0,
    estimated_study_hours FLOAT DEFAULT 2.0,
    difficulty_level INTEGER DEFAULT 3,
    prerequisite_topic_ids JSONB DEFAULT '[]'
);
