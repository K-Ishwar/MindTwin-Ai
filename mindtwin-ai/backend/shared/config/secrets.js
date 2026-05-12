'use strict';

/**
 * Secrets validation — Phase 10.4
 *
 * Call validateSecrets() at the very top of each service's index.js,
 * before any other initialisation. The process exits immediately if any
 * required secret is missing or too weak — better to crash loudly at
 * startup than to silently run with insecure defaults.
 *
 * Usage:
 *   const { validateSecrets } = require('../../../shared/config/secrets');
 *   validateSecrets();   // ← first line after require('dotenv').config()
 */

const REQUIRED_SECRETS = [
  'DATABASE_URL',
  'MONGODB_URI',
  'REDIS_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'INTERNAL_API_KEY',
];

// Secrets that must meet a minimum length (characters)
const SECRET_MIN_LENGTHS = {
  JWT_SECRET:         32,
  JWT_REFRESH_SECRET: 32,
  INTERNAL_API_KEY:   16,
};

function validateSecrets() {
  // Skip strict validation in test environment so Jest can run without real secrets
  if (process.env.NODE_ENV === 'test') return;

  const missing = REQUIRED_SECRETS.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error(
      `\nFATAL: Missing required environment variables:\n  ${missing.join('\n  ')}\n` +
      'Copy .env.prod.example to .env.prod and fill in all values.\n'
    );
    process.exit(1);
  }

  // Strength checks
  for (const [key, minLen] of Object.entries(SECRET_MIN_LENGTHS)) {
    if (process.env[key] && process.env[key].length < minLen) {
      console.error(
        `\nFATAL: ${key} must be at least ${minLen} characters long.\n` +
        `Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"\n`
      );
      process.exit(1);
    }
  }

  // Warn if default/placeholder values are still in use
  const INSECURE_DEFAULTS = ['supersecret', 'secret', 'password', 'changeme', 'internal-secret'];
  for (const key of ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'INTERNAL_API_KEY']) {
    const val = (process.env[key] || '').toLowerCase();
    if (INSECURE_DEFAULTS.some((d) => val.includes(d))) {
      console.error(
        `\nFATAL: ${key} appears to be a default/placeholder value. ` +
        'Set a cryptographically random secret before running in production.\n'
      );
      process.exit(1);
    }
  }
}

module.exports = { validateSecrets };
