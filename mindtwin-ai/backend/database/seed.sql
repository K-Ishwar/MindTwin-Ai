-- 3 Sample students
INSERT INTO students (id, name, email, password_hash, grade_level, board) VALUES
('11111111-1111-1111-1111-111111111111', 'Arjun Kumar', 'arjun@example.com', '$2b$10$xyzFakeHashForTest123...', 'Class 12', 'CBSE'),
('22222222-2222-2222-2222-222222222222', 'Priya Sharma', 'priya@example.com', '$2b$10$xyzFakeHashForTest123...', 'Class 12', 'CBSE'),
('33333333-3333-3333-3333-333333333333', 'Rahul Singh', 'rahul@example.com', '$2b$10$xyzFakeHashForTest123...', 'Class 12', 'CBSE')
ON CONFLICT DO NOTHING;

-- 20 Sample topics for Class 12 CBSE Mathematics
INSERT INTO topics (subject, topic_name, subtopic_name, board, grade_level, weightage_percent, estimated_study_hours, difficulty_level) VALUES
('Mathematics', 'Relations and Functions', 'Types of Relations', 'CBSE', 'Class 12', 4.0, 2.0, 3),
('Mathematics', 'Relations and Functions', 'Types of Functions', 'CBSE', 'Class 12', 4.0, 2.5, 3),
('Mathematics', 'Inverse Trigonometric Functions', 'Basic Concepts', 'CBSE', 'Class 12', 3.0, 1.5, 2),
('Mathematics', 'Inverse Trigonometric Functions', 'Properties', 'CBSE', 'Class 12', 4.0, 2.0, 4),
('Mathematics', 'Matrices', 'Types of Matrices', 'CBSE', 'Class 12', 2.0, 1.0, 1),
('Mathematics', 'Matrices', 'Operations on Matrices', 'CBSE', 'Class 12', 3.0, 1.5, 2),
('Mathematics', 'Determinants', 'Properties of Determinants', 'CBSE', 'Class 12', 5.0, 3.0, 4),
('Mathematics', 'Determinants', 'Inverse of a Matrix', 'CBSE', 'Class 12', 5.0, 2.5, 3),
('Mathematics', 'Continuity and Differentiability', 'Continuity', 'CBSE', 'Class 12', 4.0, 2.0, 3),
('Mathematics', 'Continuity and Differentiability', 'Derivatives', 'CBSE', 'Class 12', 5.0, 3.0, 4),
('Mathematics', 'Applications of Derivatives', 'Rate of Change', 'CBSE', 'Class 12', 3.0, 1.5, 3),
('Mathematics', 'Applications of Derivatives', 'Maxima and Minima', 'CBSE', 'Class 12', 6.0, 4.0, 5),
('Mathematics', 'Integrals', 'Indefinite Integrals', 'CBSE', 'Class 12', 7.0, 5.0, 4),
('Mathematics', 'Integrals', 'Definite Integrals', 'CBSE', 'Class 12', 7.0, 4.5, 5),
('Mathematics', 'Applications of the Integrals', 'Area under Simple Curves', 'CBSE', 'Class 12', 5.0, 3.0, 4),
('Mathematics', 'Differential Equations', 'Formation of Differential Equations', 'CBSE', 'Class 12', 3.0, 2.0, 3),
('Mathematics', 'Differential Equations', 'Solving Linear Differential Equations', 'CBSE', 'Class 12', 6.0, 4.0, 5),
('Mathematics', 'Vector Algebra', 'Addition of Vectors', 'CBSE', 'Class 12', 2.0, 1.0, 2),
('Mathematics', 'Vector Algebra', 'Dot and Cross Products', 'CBSE', 'Class 12', 4.0, 2.5, 3),
('Mathematics', 'Three-dimensional Geometry', 'Direction Cosines and Ratios', 'CBSE', 'Class 12', 4.0, 2.0, 4);

-- 10 Sample topics for Class 12 CBSE Physics
INSERT INTO topics (subject, topic_name, subtopic_name, board, grade_level, weightage_percent, estimated_study_hours, difficulty_level) VALUES
('Physics', 'Electric Charges and Fields', 'Coulombs Law', 'CBSE', 'Class 12', 4.0, 2.0, 3),
('Physics', 'Electric Charges and Fields', 'Electric Flux and Gauss Law', 'CBSE', 'Class 12', 5.0, 3.0, 4),
('Physics', 'Electrostatic Potential and Capacitance', 'Electric Potential', 'CBSE', 'Class 12', 4.0, 2.5, 3),
('Physics', 'Electrostatic Potential and Capacitance', 'Capacitors', 'CBSE', 'Class 12', 5.0, 3.5, 4),
('Physics', 'Current Electricity', 'Ohms Law and Resistance', 'CBSE', 'Class 12', 4.0, 2.0, 2),
('Physics', 'Current Electricity', 'Kirchhoffs Rules', 'CBSE', 'Class 12', 6.0, 4.0, 5),
('Physics', 'Moving Charges and Magnetism', 'Magnetic Force', 'CBSE', 'Class 12', 4.0, 2.5, 3),
('Physics', 'Moving Charges and Magnetism', 'Amperes Circuital Law', 'CBSE', 'Class 12', 5.0, 3.0, 4),
('Physics', 'Magnetism and Matter', 'Earths Magnetism', 'CBSE', 'Class 12', 3.0, 1.5, 2),
('Physics', 'Electromagnetic Induction', 'Faradays Law of Induction', 'CBSE', 'Class 12', 5.0, 3.0, 4);
