'use strict';

/**
 * Auth Controller — Phase 10.4 Security Hardening
 *
 * Security features added:
 *  1. Account lockout — 5 failed attempts → 15-min lock (Redis TTL 900s)
 *  2. Email enumeration protection — always "Invalid email or password"
 *  3. JWT jti claim — unique token ID stored in Redis; invalidated on logout
 *  4. Password strength enforcement — min 8 chars, uppercase, number, special char
 *  5. Common password rejection — checked against top-100 list
 */

const bcrypt      = require('bcrypt');
const jwt         = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db          = require('../config/db');
const redisClient = require('../config/redis');
const logger      = require('../../../../shared/logger');
const { sendNotification } = require('../../../../shared/utils/notifyClient');

const COMMON_PASSWORDS = require('../data/common_passwords.json');

const JWT_SECRET         = process.env.JWT_SECRET         || 'supersecret';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'supersecretrefresh';

// ── Security constants ────────────────────────────────────────────────────────
const MAX_LOGIN_ATTEMPTS  = 5;
const LOCKOUT_TTL_SECONDS = 900;   // 15 minutes
const OTP_TTL             = 10 * 60;

// ── Password policy ───────────────────────────────────────────────────────────
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8,}$/;

/**
 * Validate password strength.
 * Returns null if valid, or an error message string if invalid.
 */
function validatePasswordStrength(password) {
  if (!password || password.length < 8) {
    return 'Password must be at least 8 characters long.';
  }
  if (!PASSWORD_REGEX.test(password)) {
    return 'Password must contain at least one uppercase letter, one number, and one special character.';
  }
  if (COMMON_PASSWORDS.includes(password.toLowerCase())) {
    return 'This password is too common. Please choose a more unique password.';
  }
  return null;
}

// ── Token helpers ─────────────────────────────────────────────────────────────

/**
 * Generate access + refresh tokens for a student.
 * Access token includes a jti (JWT ID) for per-token revocation.
 */
function generateStudentTokens(student_id) {
  const jti = uuidv4();
  const accessToken  = jwt.sign({ student_id, jti }, JWT_SECRET, { expiresIn: '15m' });
  const refreshToken = jwt.sign({ student_id },      JWT_REFRESH_SECRET, { expiresIn: '7d' });
  return { accessToken, refreshToken, jti };
}

/**
 * Generate access + refresh tokens for a guardian.
 */
function generateGuardianTokens(guardian_id, role) {
  const jti = uuidv4();
  const accessToken  = jwt.sign({ guardian_id, role, jti }, JWT_SECRET, { expiresIn: '15m' });
  const refreshToken = jwt.sign({ guardian_id, role },      JWT_REFRESH_SECRET, { expiresIn: '7d' });
  return { accessToken, refreshToken, jti };
}

// ── Account lockout helpers ───────────────────────────────────────────────────

async function getLoginAttempts(email) {
  const key = `login_attempts:${email}`;
  const val = await redisClient.get(key);
  return val ? parseInt(val, 10) : 0;
}

async function incrementLoginAttempts(email) {
  const key = `login_attempts:${email}`;
  const attempts = await redisClient.incr(key);
  // Set/refresh TTL on every increment so the window resets from last attempt
  await redisClient.expire(key, LOCKOUT_TTL_SECONDS);
  return attempts;
}

async function clearLoginAttempts(email) {
  await redisClient.del(`login_attempts:${email}`);
}

// ── OTP helpers ───────────────────────────────────────────────────────────────

function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function dispatchOTPEmail(student_id, email, name, otp) {
  const NOTIFICATION_SERVICE_URL =
    process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:3007';
  const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'internal-secret';
  try {
    const axios = require('axios');
    await axios.post(
      `${NOTIFICATION_SERVICE_URL}/api/notifications/send-otp-email`,
      { student_id, email, name, otp },
      { headers: { 'x-api-key': INTERNAL_API_KEY }, timeout: 5000 }
    );
  } catch (err) {
    logger.warn('[authController] OTP email dispatch failed (non-critical):', err.message);
  }
}

// ── POST /api/auth/register ───────────────────────────────────────────────────

const register = async (req, res, next) => {
  const { name, email, password, grade_level, board } = req.body;

  try {
    // Password strength check
    const pwError = validatePasswordStrength(password);
    if (pwError) {
      return res.status(400).json({ success: false, error: { code: 'WEAK_PASSWORD', message: pwError } });
    }

    // Parameterized — safe from SQL injection
    const userCheck = await db.query('SELECT id FROM students WHERE email = $1', [email]);
    if (userCheck.rows.length > 0) {
      return res.status(409).json({ success: false, error: { code: 'CONFLICT', message: 'An account with this email already exists.' } });
    }

    const salt          = await bcrypt.genSalt(12);
    const password_hash = await bcrypt.hash(password, salt);

    // Parameterized — safe from SQL injection
    const newStudent = await db.query(
      `INSERT INTO students (name, email, password_hash, grade_level, board)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, grade_level, board`,
      [name, email, password_hash, grade_level, board]
    );

    const student = newStudent.rows[0];

    // Parameterized — safe from SQL injection
    await db.query('INSERT INTO digital_twins (student_id) VALUES ($1)', [student.id]);
    await db.query('INSERT INTO focus_tokens (student_id, balance) VALUES ($1, 0)', [student.id]);

    const otp = generateOTP();
    await redisClient.set(`otp:verify:${student.id}`, otp, { EX: OTP_TTL });
    dispatchOTPEmail(student.id, email, name, otp);

    res.status(201).json({
      success: true,
      message: 'Account created. Check your email for a 6-digit verification code.',
      student,
      email_verification_required: true,
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/auth/login ──────────────────────────────────────────────────────

const login = async (req, res, next) => {
  const { email, password } = req.body;

  // Generic message — never reveal whether email exists (enumeration protection)
  const INVALID_MSG = 'Invalid email or password.';

  try {
    // Check lockout BEFORE hitting the database
    const attempts = await getLoginAttempts(email);
    if (attempts >= MAX_LOGIN_ATTEMPTS) {
      return res.status(429).json({
        success: false,
        error: {
          code:    'ACCOUNT_LOCKED',
          message: 'Account temporarily locked. Try again in 15 minutes.',
        },
      });
    }

    // Parameterized — safe from SQL injection
    const userResult = await db.query('SELECT * FROM students WHERE email = $1', [email]);

    // Email not found — increment attempts but return same generic message
    if (userResult.rows.length === 0) {
      await incrementLoginAttempts(email);
      return res.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: INVALID_MSG } });
    }

    const student = userResult.rows[0];
    const isMatch = await bcrypt.compare(password, student.password_hash);

    if (!isMatch) {
      const newAttempts = await incrementLoginAttempts(email);
      const remaining   = MAX_LOGIN_ATTEMPTS - newAttempts;

      if (remaining <= 0) {
        return res.status(429).json({
          success: false,
          error: {
            code:    'ACCOUNT_LOCKED',
            message: 'Account temporarily locked. Try again in 15 minutes.',
          },
        });
      }

      return res.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: INVALID_MSG } });
    }

    // Successful login — clear lockout counter
    await clearLoginAttempts(email);

    const { accessToken, refreshToken, jti } = generateStudentTokens(student.id);

    // Store jti in Redis SET for this user (15-min TTL matches access token)
    await redisClient.sAdd(`active_jtis:${student.id}`, jti);
    await redisClient.expire(`active_jtis:${student.id}`, 15 * 60);

    // Store refresh token
    await redisClient.set(`refresh:student:${student.id}`, refreshToken, { EX: 7 * 24 * 60 * 60 });

    res.json({
      success: true,
      accessToken,
      refreshToken,
      student: {
        id:                   student.id,
        name:                 student.name,
        email:                student.email,
        grade_level:          student.grade_level,
        board:                student.board,
        onboarding_completed: student.onboarding_completed,
        email_verified:       student.email_verified,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/auth/refresh ────────────────────────────────────────────────────

const refreshToken = async (req, res, next) => {
  const { refreshToken: token } = req.body;

  try {
    const decoded = jwt.verify(token, JWT_REFRESH_SECRET);

    if (decoded.student_id) {
      const student_id  = decoded.student_id;
      const storedToken = await redisClient.get(`refresh:student:${student_id}`);

      if (!storedToken || storedToken !== token) {
        return res.status(401).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid refresh token' } });
      }

      const jti            = uuidv4();
      const newAccessToken = jwt.sign({ student_id, jti }, JWT_SECRET, { expiresIn: '15m' });

      // Register new jti
      await redisClient.sAdd(`active_jtis:${student_id}`, jti);
      await redisClient.expire(`active_jtis:${student_id}`, 15 * 60);

      return res.json({ success: true, accessToken: newAccessToken });
    }

    if (decoded.guardian_id) {
      const { guardian_id, role } = decoded;
      const storedToken = await redisClient.get(`refresh:guardian:${guardian_id}`);

      if (!storedToken || storedToken !== token) {
        return res.status(401).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid refresh token' } });
      }

      const jti            = uuidv4();
      const newAccessToken = jwt.sign({ guardian_id, role, jti }, JWT_SECRET, { expiresIn: '15m' });

      await redisClient.sAdd(`active_jtis:guardian:${guardian_id}`, jti);
      await redisClient.expire(`active_jtis:guardian:${guardian_id}`, 15 * 60);

      return res.json({ success: true, accessToken: newAccessToken });
    }

    return res.status(401).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid refresh token' } });
  } catch (err) {
    return res.status(401).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid refresh token' } });
  }
};

// ── POST /api/auth/logout ─────────────────────────────────────────────────────

const logout = async (req, res, next) => {
  try {
    const { jti } = req.user;

    if (req.user.student_id) {
      const student_id = req.user.student_id;
      // Remove this specific jti — other sessions remain valid
      if (jti) await redisClient.sRem(`active_jtis:${student_id}`, jti);
      await redisClient.del(`refresh:student:${student_id}`);
    } else if (req.user.guardian_id) {
      const guardian_id = req.user.guardian_id;
      if (jti) await redisClient.sRem(`active_jtis:guardian:${guardian_id}`, jti);
      await redisClient.del(`refresh:guardian:${guardian_id}`);
    }

    res.json({ success: true, message: 'Logged out' });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/auth/me ──────────────────────────────────────────────────────────

const getMe = async (req, res, next) => {
  try {
    const student_id = req.user.student_id;
    // Parameterized — safe from SQL injection
    const userResult = await db.query(
      `SELECT id, name, email, grade_level, board, max_daily_study_hours,
              preferred_study_start_time, onboarding_completed, email_verified,
              created_at, updated_at
       FROM students WHERE id = $1`,
      [student_id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
    }

    res.json({ success: true, student: userResult.rows[0] });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/auth/verify-email ───────────────────────────────────────────────

const verifyEmail = async (req, res, next) => {
  const { otp } = req.body;

  try {
    const student_id = req.user.student_id;

    // Parameterized — safe from SQL injection
    const check = await db.query('SELECT email_verified FROM students WHERE id = $1', [student_id]);
    if (check.rows[0]?.email_verified) {
      return res.json({ success: true, message: 'Email already verified' });
    }

    const storedOTP = await redisClient.get(`otp:verify:${student_id}`);
    if (!storedOTP) {
      return res.status(400).json({ success: false, error: { code: 'OTP_EXPIRED', message: 'OTP expired or not found. Please request a new one.' } });
    }
    if (storedOTP !== String(otp)) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_OTP', message: 'Invalid OTP' } });
    }

    // Parameterized — safe from SQL injection
    await db.query('UPDATE students SET email_verified = TRUE, updated_at = NOW() WHERE id = $1', [student_id]);
    await redisClient.del(`otp:verify:${student_id}`);

    res.json({ success: true, message: 'Email verified successfully' });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/auth/resend-verification ───────────────────────────────────────

const resendVerification = async (req, res, next) => {
  try {
    const student_id = req.user.student_id;

    // Parameterized — safe from SQL injection
    const studentResult = await db.query(
      'SELECT id, name, email, email_verified FROM students WHERE id = $1',
      [student_id]
    );

    if (studentResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Student not found' } });
    }

    const student = studentResult.rows[0];
    if (student.email_verified) {
      return res.json({ success: true, message: 'Email already verified' });
    }

    const existing = await redisClient.ttl(`otp:verify:${student_id}`);
    if (existing > OTP_TTL - 60) {
      return res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message: 'Please wait 60 seconds before requesting a new code.' } });
    }

    const otp = generateOTP();
    await redisClient.set(`otp:verify:${student_id}`, otp, { EX: OTP_TTL });
    dispatchOTPEmail(student_id, student.email, student.name, otp);

    res.json({ success: true, message: 'Verification code sent. Check your email.' });
  } catch (err) {
    next(err);
  }
};

// ── Guardian Auth ─────────────────────────────────────────────────────────────

const guardianRegister = async (req, res, next) => {
  const { name, email, password, role, institution_name } = req.body;

  try {
    const pwError = validatePasswordStrength(password);
    if (pwError) {
      return res.status(400).json({ success: false, error: { code: 'WEAK_PASSWORD', message: pwError } });
    }

    // Parameterized — safe from SQL injection
    const existing = await db.query('SELECT id FROM guardian_accounts WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, error: { code: 'CONFLICT', message: 'Guardian account already exists' } });
    }

    const salt          = await bcrypt.genSalt(12);
    const password_hash = await bcrypt.hash(password, salt);

    // Parameterized — safe from SQL injection
    const result = await db.query(
      `INSERT INTO guardian_accounts (name, email, password_hash, role, institution_name)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, role, institution_name, created_at`,
      [name, email, password_hash, role, institution_name || null]
    );

    const guardian = result.rows[0];
    const { accessToken, refreshToken, jti } = generateGuardianTokens(guardian.id, guardian.role);

    await redisClient.sAdd(`active_jtis:guardian:${guardian.id}`, jti);
    await redisClient.expire(`active_jtis:guardian:${guardian.id}`, 15 * 60);
    await redisClient.set(`refresh:guardian:${guardian.id}`, refreshToken, { EX: 7 * 24 * 60 * 60 });

    res.status(201).json({ success: true, message: 'Guardian account created', accessToken, refreshToken, guardian });
  } catch (err) {
    next(err);
  }
};

const guardianLogin = async (req, res, next) => {
  const { email, password } = req.body;
  const INVALID_MSG = 'Invalid email or password.';

  try {
    const attempts = await getLoginAttempts(email);
    if (attempts >= MAX_LOGIN_ATTEMPTS) {
      return res.status(429).json({ success: false, error: { code: 'ACCOUNT_LOCKED', message: 'Account temporarily locked. Try again in 15 minutes.' } });
    }

    // Parameterized — safe from SQL injection
    const result = await db.query('SELECT * FROM guardian_accounts WHERE email = $1', [email]);

    if (result.rows.length === 0) {
      await incrementLoginAttempts(email);
      return res.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: INVALID_MSG } });
    }

    const guardian = result.rows[0];
    const isMatch  = await bcrypt.compare(password, guardian.password_hash);

    if (!isMatch) {
      const newAttempts = await incrementLoginAttempts(email);
      if (MAX_LOGIN_ATTEMPTS - newAttempts <= 0) {
        return res.status(429).json({ success: false, error: { code: 'ACCOUNT_LOCKED', message: 'Account temporarily locked. Try again in 15 minutes.' } });
      }
      return res.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: INVALID_MSG } });
    }

    await clearLoginAttempts(email);

    const { accessToken, refreshToken, jti } = generateGuardianTokens(guardian.id, guardian.role);

    await redisClient.sAdd(`active_jtis:guardian:${guardian.id}`, jti);
    await redisClient.expire(`active_jtis:guardian:${guardian.id}`, 15 * 60);
    await redisClient.set(`refresh:guardian:${guardian.id}`, refreshToken, { EX: 7 * 24 * 60 * 60 });

    res.json({
      success: true, accessToken, refreshToken,
      guardian: { id: guardian.id, name: guardian.name, email: guardian.email, role: guardian.role, institution_name: guardian.institution_name },
    });
  } catch (err) {
    next(err);
  }
};

const guardianGetMe = async (req, res, next) => {
  const guardian_id = req.user.guardian_id;
  try {
    // Parameterized — safe from SQL injection
    const result = await db.query(
      'SELECT id, name, email, role, institution_name, created_at FROM guardian_accounts WHERE id = $1',
      [guardian_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Guardian not found' } });
    }
    res.json({ success: true, guardian: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

const guardianUpdateMe = async (req, res, next) => {
  const guardian_id = req.user.guardian_id;
  const { name, institution_name } = req.body;
  try {
    // Parameterized — safe from SQL injection
    const result = await db.query(
      `UPDATE guardian_accounts
       SET name = COALESCE($1, name), institution_name = COALESCE($2, institution_name)
       WHERE id = $3
       RETURNING id, name, email, role, institution_name, created_at`,
      [name || null, institution_name !== undefined ? institution_name : null, guardian_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Guardian not found' } });
    }
    res.json({ success: true, guardian: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

const linkStudent = async (req, res, next) => {
  const guardian_id = req.user.guardian_id;
  const { student_email } = req.body;
  try {
    // Parameterized — safe from SQL injection
    const guardianResult = await db.query('SELECT id, name, role FROM guardian_accounts WHERE id = $1', [guardian_id]);
    if (guardianResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Guardian not found' } });
    }
    const guardian = guardianResult.rows[0];

    // Parameterized — safe from SQL injection
    const studentResult = await db.query('SELECT id, name FROM students WHERE email = $1', [student_email]);
    if (studentResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Student not found with that email' } });
    }
    const student = studentResult.rows[0];

    // Parameterized — safe from SQL injection
    const existingLink = await db.query(
      'SELECT id, link_status FROM student_guardian_links WHERE student_id = $1 AND guardian_id = $2',
      [student.id, guardian_id]
    );
    if (existingLink.rows.length > 0) {
      return res.status(409).json({ success: false, error: { code: 'CONFLICT', message: `Link already exists with status: ${existingLink.rows[0].link_status}` } });
    }

    // Parameterized — safe from SQL injection
    const linkResult = await db.query(
      `INSERT INTO student_guardian_links (student_id, guardian_id, link_status) VALUES ($1, $2, 'pending') RETURNING id`,
      [student.id, guardian_id]
    );
    const link_id    = linkResult.rows[0].id;
    const roleLabel  = guardian.role === 'teacher' ? 'Teacher' : 'Parent';

    // Parameterized — safe from SQL injection
    await db.query(
      `INSERT INTO notifications (student_id, type, title, body, data) VALUES ($1, 'guardian_link_request', $2, $3, $4)`,
      [student.id, `${roleLabel} access request`, `${roleLabel} ${guardian.name} wants to view your progress. Approve?`, JSON.stringify({ link_id, guardian_id, role: guardian.role })]
    );

    res.status(201).json({ success: true, link_id, message: 'Request sent to student' });
  } catch (err) {
    next(err);
  }
};

const approveLink = async (req, res, next) => {
  const student_id = req.user.student_id;
  const { linkId } = req.params;
  try {
    // Parameterized — safe from SQL injection
    const linkResult = await db.query(
      'SELECT * FROM student_guardian_links WHERE id = $1 AND student_id = $2',
      [linkId, student_id]
    );
    if (linkResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Link not found or not authorised' } });
    }
    const link = linkResult.rows[0];
    if (link.link_status !== 'pending') {
      return res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: `Link is already ${link.link_status}` } });
    }

    // Parameterized — safe from SQL injection
    await db.query(`UPDATE student_guardian_links SET link_status = 'approved' WHERE id = $1`, [linkId]);

    // Parameterized — safe from SQL injection
    const studentResult = await db.query('SELECT name FROM students WHERE id = $1', [student_id]);
    const studentName   = studentResult.rows[0]?.name || 'A student';

    // Parameterized — safe from SQL injection
    await db.query(
      `INSERT INTO notifications (student_id, type, title, body, data) VALUES ($1, 'guardian_link_approved', $2, $3, $4)`,
      [student_id, 'Link approved', `${studentName} approved your access request`, JSON.stringify({ link_id: linkId, guardian_id: link.guardian_id })]
    );

    sendNotification('guardian', link.guardian_id, 'guardian_linked', { guardian_name: studentName }, { link_id: linkId, student_id });
    res.json({ success: true, message: 'Access approved' });
  } catch (err) {
    next(err);
  }
};

const rejectLink = async (req, res, next) => {
  const student_id = req.user.student_id;
  const { linkId } = req.params;
  try {
    // Parameterized — safe from SQL injection
    const linkResult = await db.query(
      'SELECT * FROM student_guardian_links WHERE id = $1 AND student_id = $2',
      [linkId, student_id]
    );
    if (linkResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Link not found or not authorised' } });
    }
    const link = linkResult.rows[0];
    if (link.link_status !== 'pending') {
      return res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: `Link is already ${link.link_status}` } });
    }
    // Parameterized — safe from SQL injection
    await db.query(`UPDATE student_guardian_links SET link_status = 'rejected' WHERE id = $1`, [linkId]);
    res.json({ success: true, message: 'Access rejected' });
  } catch (err) {
    next(err);
  }
};

const guardianPendingLinks = async (req, res, next) => {
  const guardian_id = req.user.guardian_id;
  try {
    // Parameterized — safe from SQL injection
    const result = await db.query(
      `SELECT sgl.id AS link_id, sgl.link_status, sgl.linked_at,
              s.id AS student_id, s.name AS student_name, s.email AS student_email, s.grade_level, s.board
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

const guardianUnlinkStudent = async (req, res, next) => {
  const guardian_id = req.user.guardian_id;
  const { linkId }  = req.params;
  try {
    // Parameterized — safe from SQL injection
    const linkCheck = await db.query(
      'SELECT id, student_id, link_status FROM student_guardian_links WHERE id = $1 AND guardian_id = $2',
      [linkId, guardian_id]
    );
    if (linkCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Link not found or not authorised' } });
    }
    // Parameterized — safe from SQL injection
    await db.query('DELETE FROM student_guardian_links WHERE id = $1', [linkId]);
    res.json({ success: true, message: 'Link removed' });
  } catch (err) {
    next(err);
  }
};

const studentGetGuardianRequests = async (req, res, next) => {
  const student_id = req.user.student_id;
  try {
    // Parameterized — safe from SQL injection
    const result = await db.query(
      `SELECT sgl.id AS link_id, sgl.link_status, sgl.linked_at,
              g.id AS guardian_id, g.name AS guardian_name, g.email AS guardian_email, g.role, g.institution_name
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

const getMyStudents = async (req, res, next) => {
  const guardian_id = req.user.guardian_id;
  try {
    // Parameterized — safe from SQL injection
    const studentsResult = await db.query(
      `SELECT s.id, s.name, s.email, s.grade_level, s.board, sgl.linked_at
       FROM student_guardian_links sgl
       JOIN students s ON s.id = sgl.student_id
       WHERE sgl.guardian_id = $1 AND sgl.link_status = 'approved'
       ORDER BY s.name ASC`,
      [guardian_id]
    );
    const students = studentsResult.rows;

    if (students.length > 0) {
      const logValues = students.map((_, i) => `($1, $${i + 2}, 'view_student_list')`).join(', ');
      const logParams = [guardian_id, ...students.map((s) => s.id)];
      // Parameterized — safe from SQL injection
      await db.query(`INSERT INTO guardian_access_logs (guardian_id, student_id, action) VALUES ${logValues}`, logParams);
    }

    res.json({ success: true, students });
  } catch (err) {
    next(err);
  }
};

const adminLogin = async (req, res, next) => {
  const { email, password } = req.body;
  const INVALID_MSG = 'Invalid email or password.';

  try {
    const attempts = await getLoginAttempts(email);
    if (attempts >= MAX_LOGIN_ATTEMPTS) {
      return res.status(429).json({ success: false, error: { code: 'ACCOUNT_LOCKED', message: 'Account temporarily locked. Try again in 15 minutes.' } });
    }

    // Parameterized — safe from SQL injection
    const result = await db.query('SELECT * FROM admins WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      await incrementLoginAttempts(email);
      return res.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: INVALID_MSG } });
    }

    const admin   = result.rows[0];
    const isMatch = await bcrypt.compare(password, admin.password_hash);
    if (!isMatch) {
      await incrementLoginAttempts(email);
      return res.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: INVALID_MSG } });
    }

    await clearLoginAttempts(email);

    const jti         = uuidv4();
    const accessToken = jwt.sign({ admin_id: admin.id, role: 'admin', jti }, JWT_SECRET, { expiresIn: '8h' });

    res.json({ success: true, accessToken, admin: { id: admin.id, name: admin.name, email: admin.email } });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  register, login, refreshToken, logout, getMe,
  verifyEmail, resendVerification,
  studentGetGuardianRequests,
  guardianRegister, guardianLogin, guardianGetMe, guardianUpdateMe,
  guardianPendingLinks, guardianUnlinkStudent,
  linkStudent, approveLink, rejectLink, getMyStudents,
  adminLogin,
};
