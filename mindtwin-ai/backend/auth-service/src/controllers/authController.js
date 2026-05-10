const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const redisClient = require('../config/redis');

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'supersecretrefresh';

const generateTokens = (student_id) => {
  const accessToken = jwt.sign({ student_id }, JWT_SECRET, { expiresIn: '15m' });
  const refreshToken = jwt.sign({ student_id }, JWT_REFRESH_SECRET, { expiresIn: '7d' });
  return { accessToken, refreshToken };
};

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

    const { accessToken, refreshToken } = generateTokens(student.id);

    await redisClient.set(`refresh:${student.id}`, refreshToken, {
      EX: 7 * 24 * 60 * 60 // 7 days in seconds
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
    const student_id = decoded.student_id;

    const storedToken = await redisClient.get(`refresh:${student_id}`);
    
    if (!storedToken || storedToken !== refreshToken) {
      return res.status(401).json({ success: false, error: 'Invalid refresh token' });
    }

    const newAccessToken = jwt.sign({ student_id }, JWT_SECRET, { expiresIn: '15m' });

    res.json({
      success: true,
      accessToken: newAccessToken
    });
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Invalid refresh token' });
  }
};

const logout = async (req, res, next) => {
  try {
    const student_id = req.user.student_id;
    await redisClient.del(`refresh:${student_id}`);
    
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

module.exports = {
  register,
  login,
  refreshToken,
  logout,
  getMe
};
