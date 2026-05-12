'use strict';


const logger = require('../../../../shared/logger');\nconst bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');
const db     = require('../config/db');
const redisClient = require('../config/redis');

const JWT_SECRET         = process.env.JWT_SECRET         || 'supersecret';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'supersecretrefresh';

// OTP TTL in seconds (10 minutes)
const OTP_TTL = 10 * 60;

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const generateTokens = (student_id) => {
  const accessToken  = jwt.sign({ student_id }, JWT_SECRET,         { expiresIn: '15m' });
  const refreshToken = jwt.sign({ student_id }, JWT_REFRESH_SECRET, { expiresIn: '7d' });
  return { accessToken, refreshToken };
};

/** Generate a cryptographically random 6-digit OTP */
function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * Send OTP email via notification-service (fire-and-forget, non-critical).
 * Falls back gracefully if notification-service is unreachable.
 */
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
    // Non-fatal â€” OTP is still stored in Redis; user can request resend
    logger.warn('[authController] OTP email dispatch failed (non-critical):', err.message);
  }
}

// â”€â”€ POST /api/auth/register â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const register = async (req, res, next) => {
  const { name, email, password, grade_level, board } = req.body;

  try {
    const userCheck = await db.query('SELECT id FROM students WHERE email = $1', [email]);
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ success: false, error: 'User already exists' });
    }

    const salt          = await bcrypt.genSalt(12);
    const password_hash = await bcrypt.hash(password, salt);

    const newStudent = await db.query(
      `INSERT INTO students (name, email, password_hash, grade_level, board)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, grade_level, board`,
      [name, email, password_hash, grade_level, board]
    );

    const student = newStudent.rows[0];

    // Initialise related records
    await db.query(`INSERT INTO digital_twins (student_id) VALUES ($1)`, [student.id]);
    await db.query(`INSERT INTO focus_tokens (student_id, balance) VALUES ($1, 0)`, [student.id]);

    // Generate OTP and store in Redis: key = otp:verify:{student_id}
    const otp = generateOTP();
    await redisClient.set(`otp:verify:${student.id}`, otp, { EX: OTP_TTL });

    // Fire-and-forget OTP email
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

// â”€â”€ POST /api/auth/login â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

    const { accessToken, refreshToken } = generateTokens(student.id);

    await redisClient.set(`refresh:${student.id}`, refreshToken, {
      EX: 7 * 24 * 60 * 60,
    });

    res.json({
      success: true,
      accessToken,
      refreshToken,
      student: {
        id:                    student.id,
        name:                  student.name,
        email:                 student.email,
        grade_level:           student.grade_level,
        board:                 student.board,
        onboarding_completed:  student.onboarding_completed,
        email_verified:        student.email_verified,
      },
    });
  } catch (err) {
    next(err);
  }
};

// â”€â”€ POST /api/auth/refresh â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const refreshToken = async (req, res, next) => {
  const { refreshToken } = req.body;

  try {
    const decoded    = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    const student_id = decoded.student_id;

    const storedToken = await redisClient.get(`refresh:${student_id}`);
    if (!storedToken || storedToken !== refreshToken) {
      return res.status(401).json({ success: false, error: 'Invalid refresh token' });
    }

    const newAccessToken = jwt.sign({ student_id }, JWT_SECRET, { expiresIn: '15m' });

    res.json({ success: true, accessToken: newAccessToken });
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Invalid refresh token' });
  }
};

// â”€â”€ POST /api/auth/logout â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const logout = async (req, res, next) => {
  try {
    const student_id = req.user.student_id;
    await redisClient.del(`refresh:${student_id}`);
    res.json({ success: true, message: 'Logged out' });
  } catch (err) {
    next(err);
  }
};

// â”€â”€ GET /api/auth/me â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const getMe = async (req, res, next) => {
  try {
    const student_id = req.user.student_id;
    const userResult = await db.query(
      `SELECT id, name, email, grade_level, board, max_daily_study_hours,
              preferred_study_start_time, onboarding_completed, email_verified,
              created_at, updated_at
       FROM students WHERE id = $1`,
      [student_id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({ success: true, student: userResult.rows[0] });
  } catch (err) {
    next(err);
  }
};

// â”€â”€ POST /api/auth/verify-email â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const verifyEmail = async (req, res, next) => {
  const { otp } = req.body;

  try {
    const student_id = req.user.student_id;

    // Check if already verified
    const check = await db.query(
      'SELECT email_verified FROM students WHERE id = $1',
      [student_id]
    );
    if (check.rows[0]?.email_verified) {
      return res.json({ success: true, message: 'Email already verified' });
    }

    // Retrieve OTP from Redis
    const storedOTP = await redisClient.get(`otp:verify:${student_id}`);

    if (!storedOTP) {
      return res.status(400).json({
        success: false,
        error: 'OTP expired or not found. Please request a new one.',
      });
    }

    if (storedOTP !== String(otp)) {
      return res.status(400).json({ success: false, error: 'Invalid OTP' });
    }

    // Mark email as verified
    await db.query(
      'UPDATE students SET email_verified = TRUE, updated_at = NOW() WHERE id = $1',
      [student_id]
    );

    // Delete OTP from Redis
    await redisClient.del(`otp:verify:${student_id}`);

    res.json({ success: true, message: 'Email verified successfully' });
  } catch (err) {
    next(err);
  }
};

// â”€â”€ POST /api/auth/resend-verification â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const resendVerification = async (req, res, next) => {
  try {
    const student_id = req.user.student_id;

    const studentResult = await db.query(
      'SELECT id, name, email, email_verified FROM students WHERE id = $1',
      [student_id]
    );

    if (studentResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }

    const student = studentResult.rows[0];

    if (student.email_verified) {
      return res.json({ success: true, message: 'Email already verified' });
    }

    // Rate-limit: check if an OTP was issued in the last 60 seconds
    const existing = await redisClient.ttl(`otp:verify:${student_id}`);
    if (existing > OTP_TTL - 60) {
      return res.status(429).json({
        success: false,
        error: 'Please wait 60 seconds before requesting a new code.',
      });
    }

    // Issue new OTP
    const otp = generateOTP();
    await redisClient.set(`otp:verify:${student_id}`, otp, { EX: OTP_TTL });

    dispatchOTPEmail(student_id, student.email, student.name, otp);

    res.json({
      success: true,
      message: 'Verification code sent. Check your email.',
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  register,
  login,
  refreshToken,
  logout,
  getMe,
  verifyEmail,
  resendVerification,
};
