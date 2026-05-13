'use strict';

/**
 * Shared JWT auth middleware — Phase 10.4 Security Hardening
 *
 * Validates the Bearer token AND checks the jti (JWT ID) against the
 * Redis active-jti set. Tokens invalidated via logout are rejected even
 * if they haven't expired yet.
 *
 * Usage:
 *   const auth = require('../../../shared/middleware/auth');
 *   router.get('/protected', auth, controller.handler);
 */

const jwt = require('jsonwebtoken');

/**
 * Get the Redis client from the calling service's config.
 * Each service has its own redis.js — we lazy-require to avoid coupling.
 */
function getRedis() {
  try {
    // Walk up from shared/ to the service root, then into src/config/redis
    return require('../../auth-service/src/config/redis');
  } catch (_) {
    // For non-auth services, they pass their own redis client via middleware factory
    return null;
  }
}

/**
 * Core token verification logic — shared by all role-specific middlewares.
 *
 * @param {object}   req
 * @param {object}   res
 * @param {Function} next
 * @param {object}   [redisClient]  Optional — if provided, jti is validated
 */
async function verifyToken(req, res, next, redisClient) {
  const authHeader = req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: { code: 'AUTH_REQUIRED', message: 'No token, authorization denied' },
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecret');
    req.user = decoded;

    // jti validation — check the token hasn't been invalidated via logout
    if (redisClient && decoded.jti) {
      const userId = decoded.student_id
        ? decoded.student_id
        : decoded.guardian_id
          ? `guardian:${decoded.guardian_id}`
          : null;

      if (userId) {
        const jtiKey  = decoded.student_id ? `active_jtis:${userId}` : `active_jtis:${userId}`;
        const isValid = await redisClient.sIsMember(jtiKey, decoded.jti);
        if (!isValid) {
          return res.status(401).json({
            success: false,
            error: { code: 'TOKEN_REVOKED', message: 'Token has been revoked. Please log in again.' },
          });
        }
      }
    }

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: { code: 'TOKEN_EXPIRED', message: 'Token has expired' },
      });
    }
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Token is not valid' },
    });
  }
}

/**
 * Default middleware — accepts any valid JWT (student, guardian, or admin).
 * Does NOT perform jti validation (used by services that don't have Redis access).
 */
const auth = (req, res, next) => verifyToken(req, res, next, null);

/**
 * Factory — creates an auth middleware bound to a specific Redis client.
 * Use this in services that have Redis available for full jti validation.
 *
 * @param {object} redisClient  redis v4 client
 * @returns {Function}          Express middleware
 */
function createAuthMiddleware(redisClient) {
  return (req, res, next) => verifyToken(req, res, next, redisClient);
}

module.exports = auth;
module.exports.createAuthMiddleware = createAuthMiddleware;
