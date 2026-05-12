const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const redisClient = require('../config/redis');

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'supersecretrefresh';

// ─── Token helpers ────────────────────────────────────────────────────────────

const generateStudentTokens = (student_id) => {
  const accessToken = jwt.sign({ student_id }, JWT_SECRET, { expiresIn: '15m' });
  const refreshToken = jwt.sign({ student_id }, JWT_REFRESH_SECRET, { expiresIn: '7d' });
  return { accessToken, refreshToken };
};

const generateGuardianTokens = (guardian_id, role) => {
  const accessToken = jwt.sign({ guardian_id, role }, JWT_SECRET, { expiresIn: '15m' });
  const refreshToken = jwt.sign({ guardian_id, role }, JWT_REFRESH_SECRET, { expiresIn: '7d' });
  return { accessToken, refreshToken };
};

// ─── Student Auth ─────────────────────────────────────────────────────────────

const register = async (req, res, next) => {
  const { name, email, password, grade_level, board } = req.body;

  try {
    const userCheck = await db.query('SELECT * FROM students WHERE email = $1', [email]);
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ success: false, error: 'User already exists' });
    }

    const salt = await bcrypt.genSalt(12);
    const password_hash = await bcrypt.hash(password, salt);

    const newStudent = await db.query(
      `INSERT INTO students (name, email, password_hash, grade_level, board)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, grade_level, board`,
      [name, email, password_hash, grade_level, board]
    );

    const student = newStudent.rows[0];

    await db.query(`INSERT INTO digital_twins (student_id) VALUES ($1)`, [student.id]);
    await db.query(`INSERT INTO focus_tokens (student_id, balance) VALUES ($1, 0)`, [student.id]);

    res.status(201).json({
      success: true,
      message: 'Account created',
      student
    });
  } catch (err) {
    next(err);
  }
};

const login = async (req, res, next) => {
  const { email, password } = req.body;

  try {
    const userResult = await db.query('SELECT * FROM students WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(400).json({ success: false, error: 'Invalid credentials' });
    }

    const student = userResult.rows[0];

    const isMatch = await bcrypt.compare(password, student.password_hash);
    if (!isMatch) {
      return res.status(400).json({ success: false, error: 'Invalid credentials' });
    }

    const { accessToken, refreshToken } = generateStudentTokens(student.id);

    await redisClient.set(`refresh:student:${student.id}`, refreshToken, {
      EX: 7 * 24 * 60 * 60
    });

    res.json({
      success: true,
      accessToken,
      refreshToken,
      student: {
        id: student.id,
        name: student.name,
        email: student.email,
        grade_level: student.grade_level,
        board: student.board,
        onboarding_completed: student.onboarding_completed
      }
    });
  } catch (err) {
    next(err);
  }
};

const refreshToken = async (req, res, next) => {
  const { refreshToken } = req.body;

  try {
    const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);

    // Support both student and guardian refresh tokens
    if (decoded.student_id) {
      const student_id = decoded.student_id;
      const storedToken = await redisClient.get(`refresh:student:${student_id}`);

      if (!storedToken || storedToken !== refreshToken) {
        return res.status(401).json({ success: false, error: 'Invalid refresh token' });
      }

      const newAccessToken = jwt.sign({ student_id }, JWT_SECRET, { expiresIn: '15m' });
      return res.json({ success: true, accessToken: newAccessToken });
    }

    if (decoded.guardian_id) {
      const { guardian_id, role } = decoded;
      const storedToken = await redisClient.get(`refresh:guardian:${guardian_id}`);

      if (!storedToken || storedToken !== refreshToken) {
        return res.status(401).json({ success: false, error: 'Invalid refresh token' });
      }

      const newAccessToken = jwt.sign({ guardian_id, role }, JWT_SECRET, { expiresIn: '15m' });
      return res.json({ success: true, accessToken: newAccessToken });
    }

    return res.status(401).json({ success: false, error: 'Invalid refresh token' });
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Invalid refresh token' });
  }
};

const logout = async (req, res, next) => {
  try {
    if (req.user.student_id) {
      await redisClient.del(`refresh:student:${req.user.student_id}`);
    } else if (req.user.guardian_id) {
      await redisClient.del(`refresh:guardian:${req.user.guardian_id}`);
    }

    res.json({ success: true, message: 'Logged out' });
  } catch (err) {
    next(err);
  }
};

const getMe = async (req, res, next) => {
  try {
    const student_id = req.user.student_id;
    const userResult = await db.query(
      'SELECT id, name, email, grade_level, board, max_daily_study_hours, preferred_study_start_time, onboarding_completed, created_at, updated_at FROM students WHERE id = $1',
      [student_id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({
      success: true,
      student: userResult.rows[0]
    });
  } catch (err) {
    next(err);
  }
};

// ─── Guardian Auth ────────────────────────────────────────────────────────────

/**
 * POST /api/auth/guardian/register
 * Body: { name, email, password, role: "parent"|"teacher", institution_name? }
 */
const guardianRegister = async (req, res, next) => {
  const { name, email, password, role, institution_name } = req.body;

  try {
    const existing = await db.query(
      'SELECT id FROM guardian_accounts WHERE email = $1',
      [email]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ success: false, error: 'Guardian account already exists' });
    }

    const salt = await bcrypt.genSalt(12);
    const password_hash = await bcrypt.hash(password, salt);

    const result = await db.query(
      `INSERT INTO guardian_accounts (name, email, password_hash, role, institution_name)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, role, institution_name, created_at`,
      [name, email, password_hash, role, institution_name || null]
    );

    const guardian = result.rows[0];
    const { accessToken, refreshToken } = generateGuardianTokens(guardian.id, guardian.role);

    await redisClient.set(`refresh:guardian:${guardian.id}`, refreshToken, {
      EX: 7 * 24 * 60 * 60
    });

    res.status(201).json({
      success: true,
      message: 'Guardian account created',
      accessToken,
      refreshToken,
      guardian
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/guardian/login
 * Body: { email, password }
 */
const guardianLogin = async (req, res, next) => {
  const { email, password } = req.body;

  try {
    const result = await db.query(
      'SELECT * FROM guardian_accounts WHERE email = $1',
      [email]
    );
    if (result.rows.length === 0) {
      return res.status(400).json({ success: false, error: 'Invalid credentials' });
    }

    const guardian = result.rows[0];

    const isMatch = await bcrypt.compare(password, guardian.password_hash);
    if (!isMatch) {
      return res.status(400).json({ success: false, error: 'Invalid credentials' });
    }

    const { accessToken, refreshToken } = generateGuardianTokens(guardian.id, guardian.role);

    await redisClient.set(`refresh:guardian:${guardian.id}`, refreshToken, {
      EX: 7 * 24 * 60 * 60
    });

    res.json({
      success: true,
      accessToken,
      refreshToken,
      guardian: {
        id: guardian.id,
        name: guardian.name,
        email: guardian.email,
        role: guardian.role,
        institution_name: guardian.institution_name
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/guardian/link-student
 * Guardian auth required
 * Body: { student_email }
 */
const linkStudent = async (req, res, next) => {
  const guardian_id = req.user.guardian_id;
  const { student_email } = req.body;

  try {
    // Fetch guardian info for notification message
    const guardianResult = await db.query(
      'SELECT id, name, role FROM guardian_accounts WHERE id = $1',
      [guardian_id]
    );
    if (guardianResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Guardian not found' });
    }
    const guardian = guardianResult.rows[0];

    // Find target student
    const studentResult = await db.query(
      'SELECT id, name FROM students WHERE email = $1',
      [student_email]
    );
    if (studentResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Student not found with that email' });
    }
    const student = studentResult.rows[0];

    // Check for duplicate link
    const existingLink = await db.query(
      'SELECT id, link_status FROM student_guardian_links WHERE student_id = $1 AND guardian_id = $2',
      [student.id, guardian_id]
    );
    if (existingLink.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: `Link already exists with status: ${existingLink.rows[0].link_status}`
      });
    }

    // Create pending link
    const linkResult = await db.query(
      `INSERT INTO student_guardian_links (student_id, guardian_id, link_status)
       VALUES ($1, $2, 'pending') RETURNING id`,
      [student.id, guardian_id]
    );
    const link_id = linkResult.rows[0].id;

    // Notify student
    const roleLabel = guardian.role === 'teacher' ? 'Teacher' : 'Parent';
    await db.query(
      `INSERT INTO notifications (student_id, type, title, body, data)
       VALUES ($1, 'guardian_link_request', $2, $3, $4)`,
      [
        student.id,
        `${roleLabel} access request`,
        `${roleLabel} ${guardian.name} wants to view your progress. Approve?`,
        JSON.stringify({ link_id, guardian_id, role: guardian.role })
      ]
    );

    res.status(201).json({
      success: true,
      link_id,
      message: 'Request sent to student'
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/guardian/approve-link/:linkId
 * Student auth required
 */
const approveLink = async (req, res, next) => {
  const student_id = req.user.student_id;
  const { linkId } = req.params;

  try {
    // Validate that the link belongs to this student
    const linkResult = await db.query(
      'SELECT * FROM student_guardian_links WHERE id = $1 AND student_id = $2',
      [linkId, student_id]
    );
    if (linkResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Link not found or not authorised' });
    }

    const link = linkResult.rows[0];

    if (link.link_status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: `Link is already ${link.link_status}`
      });
    }

    // Approve
    await db.query(
      `UPDATE student_guardian_links SET link_status = 'approved' WHERE id = $1`,
      [linkId]
    );

    // Notify guardian (store as a student-side notification for simplicity;
    // a dedicated guardian notification table can be added in a future migration)
    const studentResult = await db.query(
      'SELECT name FROM students WHERE id = $1',
      [student_id]
    );
    const studentName = studentResult.rows[0]?.name || 'A student';

    await db.query(
      `INSERT INTO notifications (student_id, type, title, body, data)
       VALUES ($1, 'guardian_link_approved', $2, $3, $4)`,
      [
        student_id,
        'Link approved',
        `${studentName} approved your access request`,
        JSON.stringify({ link_id: linkId, guardian_id: link.guardian_id })
      ]
    );

    res.json({ success: true, message: 'Access approved' });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/guardian/reject-link/:linkId
 * Student auth required
 */
const rejectLink = async (req, res, next) => {
  const student_id = req.user.student_id;
  const { linkId } = req.params;

  try {
    const linkResult = await db.query(
      'SELECT * FROM student_guardian_links WHERE id = $1 AND student_id = $2',
      [linkId, student_id]
    );
    if (linkResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Link not found or not authorised' });
    }

    const link = linkResult.rows[0];

    if (link.link_status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: `Link is already ${link.link_status}`
      });
    }

    await db.query(
      `UPDATE student_guardian_links SET link_status = 'rejected' WHERE id = $1`,
      [linkId]
    );

    res.json({ success: true, message: 'Access rejected' });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/auth/guardian/me
 * Guardian auth required — returns own profile
 */
const guardianGetMe = async (req, res, next) => {
  const guardian_id = req.user.guardian_id;

  try {
    const result = await db.query(
      `SELECT id, name, email, role, institution_name, created_at
       FROM guardian_accounts WHERE id = $1`,
      [guardian_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Guardian not found' });
    }

    res.json({ success: true, guardian: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/auth/guardian/me
 * Guardian auth required — update name and/or institution_name
 * Body: { name?, institution_name? }
 */
const guardianUpdateMe = async (req, res, next) => {
  const guardian_id = req.user.guardian_id;
  const { name, institution_name } = req.body;

  try {
    const result = await db.query(
      `UPDATE guardian_accounts
       SET name             = COALESCE($1, name),
           institution_name = COALESCE($2, institution_name)
       WHERE id = $3
       RETURNING id, name, email, role, institution_name, created_at`,
      [name || null, institution_name !== undefined ? institution_name : null, guardian_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Guardian not found' });
    }

    res.json({ success: true, guardian: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/auth/guardian/pending-links
 * Guardian auth required — all links the guardian initiated that are still pending
 */
const guardianPendingLinks = async (req, res, next) => {
  const guardian_id = req.user.guardian_id;

  try {
    const result = await db.query(
      `SELECT sgl.id AS link_id, sgl.link_status, sgl.linked_at,
              s.id AS student_id, s.name AS student_name, s.email AS student_email,
              s.grade_level, s.board
       FROM student_guardian_links sgl
       JOIN students s ON s.id = sgl.student_id
       WHERE sgl.guardian_id = $1 AND sgl.link_status = 'pending'
       ORDER BY sgl.linked_at DESC`,
      [guardian_id]
    );

    res.json({ success: true, pending_links: result.rows });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/auth/guardian/link/:linkId
 * Guardian auth required — remove an approved or pending link
 */
const guardianUnlinkStudent = async (req, res, next) => {
  const guardian_id = req.user.guardian_id;
  const { linkId } = req.params;

  try {
    // Verify this link belongs to the guardian
    const linkCheck = await db.query(
      `SELECT id, student_id, link_status
       FROM student_guardian_links
       WHERE id = $1 AND guardian_id = $2`,
      [linkId, guardian_id]
    );

    if (linkCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Link not found or not authorised' });
    }

    await db.query(
      `DELETE FROM student_guardian_links WHERE id = $1`,
      [linkId]
    );

    res.json({ success: true, message: 'Link removed' });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/auth/student/guardian-requests
 * Student auth required — all pending guardian link requests sent to this student
 */
const studentGetGuardianRequests = async (req, res, next) => {
  const student_id = req.user.student_id;

  try {
    const result = await db.query(
      `SELECT sgl.id AS link_id, sgl.link_status, sgl.linked_at,
              g.id AS guardian_id, g.name AS guardian_name, g.email AS guardian_email,
              g.role, g.institution_name
       FROM student_guardian_links sgl
       JOIN guardian_accounts g ON g.id = sgl.guardian_id
       WHERE sgl.student_id = $1
       ORDER BY sgl.linked_at DESC`,
      [student_id]
    );

    res.json({ success: true, guardian_requests: result.rows });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/auth/guardian/students
 * Guardian auth required — returns all approved linked students + logs the access
 */
const getMyStudents = async (req, res, next) => {
  const guardian_id = req.user.guardian_id;

  try {
    const studentsResult = await db.query(
      `SELECT s.id, s.name, s.email, s.grade_level, s.board, sgl.linked_at
       FROM student_guardian_links sgl
       JOIN students s ON s.id = sgl.student_id
       WHERE sgl.guardian_id = $1 AND sgl.link_status = 'approved'
       ORDER BY s.name ASC`,
      [guardian_id]
    );

    const students = studentsResult.rows;

    // Audit-log each student view
    if (students.length > 0) {
      const logValues = students
        .map((_, i) => `($1, $${i + 2}, 'view_student_list')`)
        .join(', ');
      const logParams = [guardian_id, ...students.map((s) => s.id)];
      await db.query(
        `INSERT INTO guardian_access_logs (guardian_id, student_id, action) VALUES ${logValues}`,
        logParams
      );
    }

    res.json({ success: true, students });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  // Student
  register,
  login,
  refreshToken,
  logout,
  getMe,
  studentGetGuardianRequests,
  // Guardian
  guardianRegister,
  guardianLogin,
  guardianGetMe,
  guardianUpdateMe,
  guardianPendingLinks,
  guardianUnlinkStudent,
  linkStudent,
  approveLink,
  rejectLink,
  getMyStudents
};
