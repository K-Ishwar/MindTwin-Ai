'use strict';

/**
 * Shared Winston logger — Phase 9.4
 *
 * Each service sets SERVICE_NAME in its environment (or package.json start script).
 * Log files are written to ./logs/ relative to the process cwd (each service's root).
 *
 * Usage:
 *   const logger = require('../../../shared/logger');
 *   logger.info('Plan generated', { student_id, plan_id });
 *   logger.error('DB query failed', { error: err.message, stack: err.stack });
 */

const winston = require('winston');
const path    = require('path');
const fs      = require('fs');

// Ensure logs/ directory exists relative to the calling service's cwd
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  try { fs.mkdirSync(logsDir, { recursive: true }); } catch (_) { /* non-fatal */ }
}

// ── Formats ───────────────────────────────────────────────────────────────────

const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ level, message, timestamp, service, duration_ms, ...meta }) => {
    const svc  = service ? `[${service}]` : '';
    const dur  = duration_ms !== undefined ? ` (${duration_ms}ms)` : '';
    const rest = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} ${svc} ${level}: ${message}${dur}${rest}`;
  })
);

// ── Transports ────────────────────────────────────────────────────────────────

const transports = [
  // Always log to console
  new winston.transports.Console({
    format: consoleFormat,
  }),
];

// File transports only when logs/ is writable (skipped in read-only containers)
try {
  transports.push(
    new winston.transports.File({
      filename:  path.join(logsDir, 'error.log'),
      level:     'error',
      format:    jsonFormat,
      maxsize:   5 * 1024 * 1024,  // 5 MB
      maxFiles:  5,
      tailable:  true,
    }),
    new winston.transports.File({
      filename:  path.join(logsDir, 'combined.log'),
      format:    jsonFormat,
      maxsize:   10 * 1024 * 1024, // 10 MB
      maxFiles:  3,
      tailable:  true,
    })
  );
} catch (_) { /* file transport unavailable — console only */ }

// ── Logger instance ───────────────────────────────────────────────────────────

const logger = winston.createLogger({
  level:       process.env.LOG_LEVEL || 'info',
  defaultMeta: { service: process.env.SERVICE_NAME || 'unknown' },
  transports,
});

module.exports = logger;
