'use strict';

/**
 * HTTP request logging middleware — Phase 9.4
 *
 * Logs every request on response finish with method, url, status, duration,
 * and user_id. Emits a warn if the response takes > 2 seconds.
 *
 * Usage:
 *   const requestLogger = require('../../../shared/middleware/requestLogger');
 *   app.use(requestLogger);   // place after compression, before routes
 */

const logger = require('../logger');

function requestLogger(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const duration_ms = Date.now() - start;
    const meta = {
      method:      req.method,
      url:         req.originalUrl,
      status:      res.statusCode,
      duration_ms,
      user_id:     req.user?.student_id || req.user?.guardian_id || 'anonymous',
      ip:          req.ip,
    };

    // Choose log level based on status code
    if (res.statusCode >= 500) {
      logger.error('HTTP Request', meta);
    } else if (res.statusCode >= 400) {
      logger.warn('HTTP Request', meta);
    } else {
      logger.info('HTTP Request', meta);
    }

    // Slow endpoint alert
    if (duration_ms > 2000) {
      logger.warn('Slow endpoint detected', {
        url:         req.originalUrl,
        duration_ms,
        method:      req.method,
        user_id:     meta.user_id,
      });
    }
  });

  next();
}

module.exports = requestLogger;
