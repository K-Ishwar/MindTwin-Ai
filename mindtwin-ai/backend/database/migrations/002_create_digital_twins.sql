CREATE TABLE IF NOT EXISTS digital_twins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES students(id) ON DELETE CASCADE,
    twin_vector JSONB,
    behavioral_features JSONB,
    peer_cluster_id INTEGER DEFAULT 0,
    last_updated TIMESTAMP DEFAULT NOW()
);
