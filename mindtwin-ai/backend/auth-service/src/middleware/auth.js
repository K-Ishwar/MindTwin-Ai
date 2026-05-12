'use strict';

/**
 * Auth-service JWT middleware — Phase 10.4 Security Hardening
 *
 * Validates Bearer tokens AND checks the jti (JWT ID) against the Redis
 * active-jti set. Tokens invalidated via logout are rejected immediately,
 * even if they haven't expired yet.
 */

const jwt         = require('jsonwebtoken');
const redisClient = require('../config/redis');

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret';

// ── Core token extractor ──────────────────────────────────────────────────────

async function extractAndVerify(req, res) {
  const authHeader = req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'No token, authorization denied' } });
    return null;
  }

  const token = authHeader.split(' ')[1];

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      res.status(401).json({ success: false, error: { code: 'TOKEN_EXPIRED', message: 'Token has expired' } });
    } else {
      res.status(401).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Token is not valid' } });
    }
    return null;
  }

  // jti validation — reject tokens that were invalidated via logout
  if (decoded.jti) {
    try {
      let jtiKey;
      if (decoded.student_id) {
        jtiKey = `active_jtis:${decoded.student_id}`;
      } else if (decoded.guardian_id) {
        jtiKey = `active_jtis:guardian:${decoded.guardian_id}`;
      }

      if (jtiKey) {
        const isValid = await redisClient.sIsMember(jtiKey, decoded.jti);
        if (!isValid) {
          res.status(401).json({ success: false, error: { code: 'TOKEN_REVOKED', message: 'Token has been revoked. Please log in again.' } });
          return null;
        }
      }
    } catch (redisErr) {
      // Redis unavailable — fail open (log the error, don't block the request)
      // In a stricter security posture, change this to fail closed (return null)
      console.error('[auth middleware] Redis jti check failed:', redisErr.message);
    }
  }

  return decoded;
}

// ── Role-specific middlewares ─────────────────────────────────────────────────

/**
 * verifyStudentAuth — requires { student_id } in token payload.
 */
const verifyStudentAuth = async (req, res, next) => {
  const decoded = await extractAndVerify(req, res);
  if (!decoded) return;

  if (!decoded.student_id) {
    return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Student token required' } });
  }

  req.user = { student_id: decoded.student_id, jti: decoded.jti };
  next();
};

/**
 * verifyGuardianAuth — requires { guardian_id, role } in token payload.
 */
const verifyGuardianAuth = async (req, res, next) => {
  const decoded = await extractAndVerify(req, res);
  if (!decoded) return;

  if (!decoded.guardian_id) {
    return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Guardian token required' } });
  }

  req.user = { guardian_id: decoded.guardian_id, role: decoded.role, jti: decoded.jti };
  next();
};

/**
 * verifyAnyAuth — accepts student, guardian, or admin tokens.
 * Default export for backward compatibility.
 */
const verifyAnyAuth = async (req, res, next) => {
  const decoded = await extractAndVerify(req, res);
  if (!decoded) return;

  if (!decoded.student_id && !decoded.guardian_id && !decoded.admin_id) {
    return res.status(401).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Token is not valid' } });
  }

  req.user = decoded;
  next();
};

module.exports = verifyAnyAuth;
module.exports.verifyStudentAuth  = verifyStudentAuth;
module.exports.verifyGuardianAuth = verifyGuardianAuth;
