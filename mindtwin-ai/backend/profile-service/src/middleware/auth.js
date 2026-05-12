const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret';

/**
 * Extract and verify a Bearer JWT from the Authorization header.
 * Returns the decoded payload, or sends an error response and returns null.
 */
const extractToken = (req, res) => {
  const authHeader = req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'No token, authorization denied' });
    return null;
  }

  const token = authHeader.split(' ')[1];
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      res.status(403).json({ success: false, error: 'Token is expired' });
    } else {
      res.status(401).json({ success: false, error: 'Token is not valid' });
    }
    return null;
  }
};

/**
 * verifyStudentAuth  — default export (backward-compatible).
 * Accepts tokens that contain { student_id }.
 */
const verifyStudentAuth = (req, res, next) => {
  const decoded = extractToken(req, res);
  if (!decoded) return;

  if (!decoded.student_id) {
    return res.status(403).json({ success: false, error: 'Student token required' });
  }

  req.user = { student_id: decoded.student_id };
  next();
};

/**
 * verifyGuardianAuth
 * Accepts tokens that contain { guardian_id, role }.
 */
const verifyGuardianAuth = (req, res, next) => {
  const decoded = extractToken(req, res);
  if (!decoded) return;

  if (!decoded.guardian_id) {
    return res.status(403).json({ success: false, error: 'Guardian token required' });
  }

  req.user = { guardian_id: decoded.guardian_id, role: decoded.role };
  next();
};

module.exports = verifyStudentAuth;           // default — keeps existing routes working
module.exports.verifyStudentAuth  = verifyStudentAuth;
module.exports.verifyGuardianAuth = verifyGuardianAuth;
