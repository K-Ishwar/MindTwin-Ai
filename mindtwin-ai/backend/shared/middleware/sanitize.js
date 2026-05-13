'use strict';

/**
 * Input sanitization middleware — Phase 10.4
 *
 * sanitizeBody  — recursively strips XSS payloads from all string values in req.body
 * validateUUID  — rejects requests where a route param is not a valid UUID v4
 *
 * Usage in service index.js (apply globally, before routes):
 *   const { sanitizeBody } = require('../../../shared/middleware/sanitize');
 *   app.use(sanitizeBody);
 *
 * Usage on individual routes with UUID params:
 *   const { validateUUID } = require('../../../shared/middleware/sanitize');
 *   router.get('/:id', validateUUID('id'), controller.getById);
 */

const xss    = require('xss');
const { validate: isUUID } = require('uuid');

// ── XSS sanitizer options ─────────────────────────────────────────────────────
// Strip ALL HTML tags — this is an API, not a rich-text editor.
const xssOptions = {
  whiteList:       {},   // no tags allowed
  stripIgnoreTag:  true,
  stripIgnoreTagBody: ['script', 'style'],
};

/**
 * Recursively sanitize every string value in an object/array.
 * Non-string primitives (numbers, booleans, null) pass through unchanged.
 *
 * @param {*} value
 * @returns {*}
 */
function sanitizeValue(value) {
  if (typeof value === 'string') {
    return xss(value.trim(), xssOptions);
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, sanitizeValue(v)])
    );
  }
  return value;
}

/**
 * Express middleware — sanitizes req.body in-place.
 * Apply globally before route handlers.
 */
function sanitizeBody(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeValue(req.body);
  }
  next();
}

/**
 * Route-level middleware factory — validates that req.params[param] is a UUID.
 * Returns 400 immediately if the param is not a valid UUID v4.
 *
 * @param {string} param  The route parameter name (e.g. 'id', 'studentId')
 * @returns {Function}    Express middleware
 */
function validateUUID(param) {
  return (req, res, next) => {
    const value = req.params[param];
    if (!value || !isUUID(value)) {
      return res.status(400).json({
        success: false,
        error: {
          code:    'INVALID_ID',
          message: `Invalid ID format for parameter '${param}'`,
        },
      });
    }
    next();
  };
}

module.exports = { sanitizeBody, sanitizeValue, validateUUID };
