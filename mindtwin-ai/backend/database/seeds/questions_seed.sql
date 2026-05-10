-- ============================================================
-- Question Bank Seed (v2 — clean single-topic-id insert)
-- Uses DISTINCT ON to resolve exactly one topic_id per topic name.
-- ============================================================

-- Helper: Resolve canonical topic IDs
WITH topic_ids AS (
  SELECT DISTINCT ON (topic_name)
    id, topic_name
  FROM topics
  WHERE board = 'CBSE' AND grade_level = 'Class 12'
  ORDER BY topic_name, id
)

-- ── MATRICES (15 questions) ───────────────────────────────────────────────────
INSERT INTO questions
  (topic_id, subject, board, grade_level,
   question_text, option_a, option_b, option_c, option_d,
   correct_option, explanation, irt_a, irt_b, irt_c, difficulty_label)

SELECT t.id, 'Mathematics','CBSE','Class 12', v.*
FROM topic_ids t, (VALUES
  -- EASY  (irt_b -2.0 to -0.5)
  ('A matrix with only one row is called a:',
   'Column matrix','Row matrix','Square matrix','Null matrix',
   'B','A matrix with a single row is a row matrix.',
   1.0,-1.8,0.25,'easy'),
  ('If a matrix A has 3 rows and 4 columns, what is its order?',
   '4×3','3×4','7×1','12×1',
   'B','Order = rows × columns = 3×4.',
   0.9,-1.5,0.25,'easy'),
  ('The transpose of matrix A is obtained by:',
   'Multiplying by −1','Interchanging rows and columns','Adding identity','Squaring each element',
   'B','The transpose is formed by interchanging rows and columns.',
   0.8,-1.6,0.25,'easy'),
  ('A square matrix with all off-diagonal elements zero is called:',
   'Identity matrix','Diagonal matrix','Scalar matrix','Null matrix',
   'B','A diagonal matrix has aᵢⱼ = 0 for all i ≠ j.',
   1.1,-1.2,0.25,'easy'),
  ('If A = [[1,2],[3,4]], then 2A equals:',
   '[[1,2],[3,4]]','[[2,4],[6,8]]','[[4,8],[12,16]]','[[0,0],[0,0]]',
   'B','Scalar multiplication: 2A multiplies every element by 2.',
   1.0,-0.9,0.25,'easy'),
  -- MEDIUM (irt_b -0.5 to 0.5)
  ('If A is 2×3 and B is 3×2, the order of AB is:',
   '2×2','3×3','2×3','3×2',
   'A','Product of m×n and n×p matrices is m×p. Here 2×2.',
   1.2,-0.3,0.25,'medium'),
  ('If A=[[0,1],[−1,0]], then A² equals:',
   '[[1,0],[0,1]]','[[−1,0],[0,−1]]','[[0,−1],[1,0]]','[[0,0],[0,0]]',
   'B','A·A = [[0·0+1·(−1), 0·1+1·0],[−1·0+0·(−1), −1·1+0·0]] = [[−1,0],[0,−1]].',
   1.3,-0.1,0.25,'medium'),
  ('For same-order matrices A and B, which always holds?',
   'AB = BA','(A+B)ᵀ = Aᵀ+Bᵀ','(AB)ᵀ = AᵀBᵀ','A(B+C) ≠ AB+AC',
   'B','Transpose of sum equals sum of transposes. Multiplication is not commutative.',
   1.4,0.2,0.25,'medium'),
  ('If A is symmetric, Aᵀ equals:',
   '−A','A','A⁻¹','2A',
   'B','Symmetric matrix satisfies Aᵀ = A by definition.',
   1.2,-0.2,0.25,'medium'),
  ('A matrix A is skew-symmetric if:',
   'Aᵀ=A','Aᵀ=−A','A=A⁻¹','A+Aᵀ=I',
   'B','Skew-symmetric: Aᵀ = −A, so diagonal elements are 0.',
   1.5,0.4,0.25,'medium'),
  -- HARD (irt_b 0.5 to 2.0)
  ('AB is symmetric iff A and B are symmetric and:',
   'A=B','AB=BA','A+B=I','AB=A',
   'B','(AB)ᵀ=BᵀAᵀ=BA. For AB symmetric, need AB=BA.',
   1.6,0.8,0.25,'hard'),
  ('Number of possible orders of a matrix with 24 elements:',
   '4','6','8','10',
   'C','Divisors of 24: 1,2,3,4,6,8,12,24 → 8 ordered pairs.',
   1.4,0.7,0.25,'hard'),
  ('The (2,1) element of AB where A=[[1,2],[3,4]], B=[[5,6],[7,8]] is:',
   '19','31','39','43',
   'D','Row2·Col1 = 3×5 + 4×7 = 15+28 = 43.',
   1.7,1.0,0.25,'hard'),
  ('Which is NOT always true for invertible A and B?',
   '(AB)⁻¹=B⁻¹A⁻¹','(Aᵀ)⁻¹=(A⁻¹)ᵀ','AB=BA','(A⁻¹)⁻¹=A',
   'C','Matrix multiplication is not commutative in general.',
   1.8,1.3,0.25,'hard'),
  ('If A³=I for a square matrix A, then A⁻¹ equals:',
   'A','A²','Aᵀ','3A',
   'B','A·A²=I ⟹ A⁻¹=A².',
   1.9,1.6,0.25,'hard')
) AS v(question_text,option_a,option_b,option_c,option_d,
       correct_option,explanation,irt_a,irt_b,irt_c,difficulty_label)
WHERE t.topic_name = 'Matrices'
ON CONFLICT (question_text) DO NOTHING;


-- ── DETERMINANTS (15 questions) ───────────────────────────────────────────────
WITH topic_ids AS (
  SELECT DISTINCT ON (topic_name)
    id, topic_name
  FROM topics
  WHERE board = 'CBSE' AND grade_level = 'Class 12'
  ORDER BY topic_name, id
)
INSERT INTO questions
  (topic_id, subject, board, grade_level,
   question_text, option_a, option_b, option_c, option_d,
   correct_option, explanation, irt_a, irt_b, irt_c, difficulty_label)
SELECT t.id, 'Mathematics','CBSE','Class 12', v.*
FROM topic_ids t, (VALUES
  -- EASY
  ('The determinant of a 1×1 matrix [k] is:',
   '0','1','k','k²','C','det([k]) = k.',0.9,-1.9,0.25,'easy'),
  ('If any row of a determinant is entirely zero, its value is:',
   '1','undefined','infinity','0','D','A zero row makes the determinant 0.',1.0,-1.5,0.25,'easy'),
  ('det([[1,0],[0,1]]) equals:',
   '0','1','−1','2','B','det of 2×2 identity = 1.',0.8,-1.7,0.25,'easy'),
  ('If two rows of a determinant are identical, the value is:',
   '2','0','1','doubled','B','Identical rows → determinant = 0.',1.0,-1.3,0.25,'easy'),
  ('det([[a,b],[c,d]]) equals:',
   'ac−bd','ad−bc','ab−cd','bc−ad','B','det = ad − bc for 2×2.',0.9,-1.1,0.25,'easy'),
  -- MEDIUM
  ('If det(A)=5 for a 3×3 matrix, then det(2A) equals:',
   '10','20','40','5','C','det(kA)=kⁿ·det(A). det(2A)=2³×5=40.',1.3,-0.2,0.25,'medium'),
  ('det(Aᵀ) equals det(A) for:',
   'Only square matrices','Only symmetric matrices','All matrices','Only invertible matrices',
   'C','det(Aᵀ) = det(A) for all square matrices.',1.2,-0.4,0.25,'medium'),
  ('For a singular matrix A, det(A) equals:',
   '1','−1','undefined','0','D','Singular ↔ det = 0 ↔ no inverse.',1.4,0.1,0.25,'medium'),
  ('det([[1,2,3],[0,4,5],[0,0,6]]) equals:',
   '0','24','18','6','B','Upper triangular: det = 1×4×6 = 24.',1.3,0.3,0.25,'medium'),
  ('The cofactor C₁₁ of [[1,2],[3,4]] is:',
   '4','−4','−3','3','A','C₁₁=(−1)^(1+1)×M₁₁=1×4=4.',1.5,0.4,0.25,'medium'),
  -- HARD
  ('det([[1,ω,ω²],[ω,ω²,1],[ω²,1,ω]]) where ω is a primitive cube root of unity:',
   'ω','0','3ω','−3','B','Rows sum to 0 since 1+ω+ω²=0, so det=0.',1.7,0.9,0.25,'hard'),
  ('If det(A)=4 for a 3×3 matrix, det(A⁻¹) equals:',
   '4','0.25','−4','16','B','det(A⁻¹)=1/det(A)=1/4.',1.6,0.8,0.25,'hard'),
  ('The adjoint of A=[[2,3],[1,4]] is:',
   '[[4,−3],[−1,2]]','[[4,3],[1,2]]','[[−4,3],[1,−2]]','[[2,−3],[−1,4]]',
   'A','adj = transpose of cofactor matrix = [[4,−3],[−1,2]].',1.7,1.1,0.25,'hard'),
  ('If det([[x,2],[3,x]])=1 (det of identity), find x:',
   '±√7','±√5','±√3','±2',
   'A','x²−6=1 → x²=7 → x=±√7.',1.8,1.2,0.25,'hard'),
  ('AX=B has a unique solution when:',
   'det(A)=0','det(A)≠0','A is symmetric','B=0',
   'B','Unique solution ↔ A invertible ↔ det(A)≠0.',1.9,1.5,0.25,'hard')
) AS v(question_text,option_a,option_b,option_c,option_d,
       correct_option,explanation,irt_a,irt_b,irt_c,difficulty_label)
WHERE t.topic_name = 'Determinants'
ON CONFLICT (question_text) DO NOTHING;


-- ── APPLICATIONS OF DERIVATIVES (10 questions) ───────────────────────────────
WITH topic_ids AS (
  SELECT DISTINCT ON (topic_name)
    id, topic_name
  FROM topics
  WHERE board = 'CBSE' AND grade_level = 'Class 12'
  ORDER BY topic_name, id
)
INSERT INTO questions
  (topic_id, subject, board, grade_level,
   question_text, option_a, option_b, option_c, option_d,
   correct_option, explanation, irt_a, irt_b, irt_c, difficulty_label)
SELECT t.id, 'Mathematics','CBSE','Class 12', v.*
FROM topic_ids t, (VALUES
  -- EASY
  ('A function f(x) is increasing on an interval where:',
   'f''(x)<0','f''(x)=0','f''(x)>0','f(x)<0','C','Increasing ↔ f''(x)>0.',1.0,-1.4,0.25,'easy'),
  ('At a local maximum, f''(x) must be:',
   'Positive','Negative','Zero','Undefined','C','Necessary condition for extremum: f''(x)=0.',0.9,-1.2,0.25,'easy'),
  ('Rate of change of area A=πr² with respect to r:',
   '2r','2πr','πr²','πr','B','dA/dr=2πr.',1.0,-0.8,0.25,'easy'),
  -- MEDIUM
  ('f(x)=x³, f(3)=27, f''(3)=27. Approximate f(3.02) using differentials:',
   '27.54','27.81','28.08','27.27','A','f(3.02)≈27+27×0.02=27.54.',1.3,-0.1,0.25,'medium'),
  ('Maximum value of f(x)=sin x+cos x:',
   '1','√2','2','1/√2','B','f(x)=√2·sin(x+π/4), max=√2.',1.4,0.3,0.25,'medium'),
  ('Local minimum value of f(x)=x³−3x:',
   '2','−2','0','1','B','f''=3x²−3=0→x=±1; f(1)=−2 is local min.',1.5,0.4,0.25,'medium'),
  ('Slope of tangent to y=x³ at x=2:',
   '4','8','12','6','C','dy/dx=3x²; at x=2: 3×4=12.',1.2,0.2,0.25,'medium'),
  -- HARD
  ('10m ladder, foot slides at 2m/s. Speed of descent of top when foot is 6m from wall:',
   '1.5 m/s','2.0 m/s','1.2 m/s','0.75 m/s',
   'A','x²+y²=100; 2x·dx/dt+2y·dy/dt=0; at x=6,y=8: 2(6)(2)+2(8)dy/dt=0→dy/dt=−1.5 m/s.',1.7,0.9,0.25,'hard'),
  ('Rectangle inscribed in circle of radius r with maximum area is a square of side:',
   'r','r√2','r√3','2r','B','Max area inscribed rectangle in circle = square with diagonal=2r, side=r√2.',1.8,1.1,0.25,'hard'),
  ('Point on y=x² nearest to (3,0):',
   '(1,1)','(2,4)','(3,9)','(0,0)','A','Minimise (x−3)²+x⁴; critical point at x=1, point=(1,1).',1.9,1.4,0.25,'hard')
) AS v(question_text,option_a,option_b,option_c,option_d,
       correct_option,explanation,irt_a,irt_b,irt_c,difficulty_label)
WHERE t.topic_name = 'Applications of Derivatives'
ON CONFLICT (question_text) DO NOTHING;
