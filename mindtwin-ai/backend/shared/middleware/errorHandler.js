'use strict';

/**
 * Global error handler middleware — Phase 9.4
 *
 * Must be registered as the LAST app.use() in every service's index.js.
 * Replaces all the ad-hoc error handlers that were there before.
 *
 * Usage:
 *   const globalErrorHandler = require('../../../shared/middleware/errorHandler');
 *   app.use(globalErrorHandler);
 */

const logger = require('../logger');

function globalErrorHandler(err, req, res, next) {
  // ── Normalise axios upstream errors ────────────────────────────────────────
  // When a service-to-service call fails, axios wraps the response.
  // Unwrap it so we log the real upstream message.
  if (err.isAxiosError && err.response) {
    const upstream = err.response.data?.error || err.response.statusText || 'Upstream error';
    const status   = err.response.status;
    // Treat 4xx upstream as operational, 5xx as non-operational
    err.statusCode    = status >= 500 ? 503 : status;
    err.errorCode     = status >= 500 ? 'SERVICE_UNAVAILABLE' : 'UPSTREAM_ERROR';
    err.message       = upstream;
    err.isOperational = status < 500;
  }

  const statusCode = err.statusCode || 500;
  const isOp       = err.isOperational === true;

  // ── Logging ─────────────────────────────────────────────────────────────────
  const logMeta = {
    errorCode:  err.errorCode || 'INTERNAL_ERROR',
    statusCode,
    method:     req.method,
    url:        req.originalUrl,
    user_id:    req.user?.student_id || req.user?.guardian_id || 'anonymous',
    ip:         req.ip,
  };

  if (isOp) {
    logger.warn('Operational error', { ...logMeta, message: err.message });
  } else {
    logger.error('Programmer error', { ...logMeta, message: err.message, stack: err.stack });
  }

  // ── Response ─────────────────────────────────────────────────────────────────
  const body = {
    success: false,
    error: {
      code:    err.errorCode || 'INTERNAL_ERROR',
      message: isOp ? err.message : 'Something went wrong. Please try again.',
    },
  };

  // Include field hint for validation errors
  if (err.field) body.error.field = err.field;

  // Expose stack trace in development only
  if (process.env.NODE_ENV === 'development') {
    body.error.stack = err.stack;
  }

  res.status(statusCode).json(body);
}

// ── Process-level safety nets ─────────────────────────────────────────────────

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Promise Rejection', {
    reason:  reason?.message || String(reason),
    stack:   reason?.stack,
  });
  // Don't exit — let the service keep running; the rejection is logged
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception — process will exit', {
    message: err.message,
    stack:   err.stack,
  });
  // Uncaught exceptions leave the process in an undefined state — exit cleanly
  process.exit(1);
});

module.exports = globalErrorHandler;
