const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret';

/**
 * Extract and verify a Bearer JWT from the Authorization header.
 * Returns the decoded payload or throws.
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
 * verifyStudentAuth
 * Accepts tokens that contain { student_id }.
 * Attaches req.user = { student_id } on success.
 */
const verifyStudentAuth = (req, res, next) => {
  const decoded = extractToken(req, res);
  if (!decoded) return; // response already sent

  if (!decoded.student_id) {
    return res.status(403).json({ success: false, error: 'Student token required' });
  }

  req.user = { student_id: decoded.student_id };
  next();
};

/**
 * verifyGuardianAuth
 * Accepts tokens that contain { guardian_id, role }.
 * Attaches req.user = { guardian_id, role } on success.
 */
const verifyGuardianAuth = (req, res, next) => {
  const decoded = extractToken(req, res);
  if (!decoded) return; // response already sent

  if (!decoded.guardian_id) {
    return res.status(403).json({ success: false, error: 'Guardian token required' });
  }

  req.user = { guardian_id: decoded.guardian_id, role: decoded.role };
  next();
};

/**
 * verifyAnyAuth (default export — backward-compatible)
 * Accepts either a student or guardian token.
 * Attaches the full decoded payload to req.user.
 */
const verifyAnyAuth = (req, res, next) => {
  const decoded = extractToken(req, res);
  if (!decoded) return;

  if (!decoded.student_id && !decoded.guardian_id) {
    return res.status(401).json({ success: false, error: 'Token is not valid' });
  }

  req.user = decoded;
  next();
};

module.exports = verifyAnyAuth;
module.exports.verifyStudentAuth = verifyStudentAuth;
module.exports.verifyGuardianAuth = verifyGuardianAuth;
