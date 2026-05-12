'use strict';

/**
 * Service clients for the scheduler-service — Phase 9.4
 * All outbound calls go through:
 *   1. Exponential-backoff retry (withRetry)
 *   2. Per-service circuit breaker (registry.get)
 */

const axios  = require('axios');
const logger = require('../../../../shared/logger');
const { registry } = require('../../../../shared/utils/circuitBreaker');

const AI_ENGINE_URL  = process.env.AI_ENGINE_URL       || 'http://ai-engine:8000';
const PROFILE_URL    = process.env.PROFILE_SERVICE_URL || 'http://profile-service:3002';
const REWARD_URL     = process.env.REWARD_SERVICE_URL  || 'http://reward-service:3006';
const STRESS_URL     = process.env.STRESS_SERVICE_URL  || 'http://stress-service:3005';
const QUIZ_URL       = process.env.QUIZ_SERVICE_URL    || 'http://quiz-service:3004';

const INTERNAL_KEY = process.env.INTERNAL_API_KEY || 'mindtwin-internal-secret';
const TIMEOUT_MS   = 5000;
const MAX_RETRIES  = 3;

// ── Circuit breakers (one per downstream service) ─────────────────────────────
const cbAI      = registry.get('ai-engine',       { failureThreshold: 5, recoveryTimeout: 30_000 });
const cbReward  = registry.get('reward-service',  { failureThreshold: 5, recoveryTimeout: 30_000 });
const cbStress  = registry.get('stress-service',  { failureThreshold: 5, recoveryTimeout: 30_000 });
const cbProfile = registry.get('profile-service', { failureThreshold: 5, recoveryTimeout: 30_000 });

// ── Exponential backoff retry ─────────────────────────────────────────────────
async function withRetry(fn, retries = MAX_RETRIES, delayMs = 200) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      // Don't retry on 4xx client errors
      if (err.response && err.response.status < 500) throw err;
      if (attempt < retries) {
        const backoff = delayMs * Math.pow(2, attempt);
        logger.warn('Service call failed, retrying', {
          attempt: attempt + 1,
          max_retries: retries,
          backoff_ms: backoff,
          error: err.message,
        });
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
  }
  throw lastErr;
}

// ── Axios client factories ────────────────────────────────────────────────────
function makeInternalClient(baseURL) {
  return axios.create({
    baseURL,
    timeout: TIMEOUT_MS,
    headers: { 'X-Internal-Key': INTERNAL_KEY, 'Content-Type': 'application/json' },
  });
}

function makeJwtClient(baseURL, token) {
  return axios.create({
    baseURL,
    timeout: TIMEOUT_MS,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
}

// ── Pre-configured clients ────────────────────────────────────────────────────
const aiClient      = makeInternalClient(AI_ENGINE_URL);
const rewardClient  = makeInternalClient(REWARD_URL);
const stressClient  = makeInternalClient(STRESS_URL);
const profileClient = (token) => makeJwtClient(PROFILE_URL, token);
const quizClient    = (token) => makeJwtClient(QUIZ_URL, token);

// ── Exported helpers — retry + circuit breaker ────────────────────────────────

/**
 * Award tokens for a student action.
 */
async function awardTokens(student_id, action, context = {}) {
  return cbReward.call(() =>
    withRetry(() => rewardClient.post('/api/reward/award', { student_id, action, context }))
  );
}

/**
 * Update the student's digital twin after a session.
 */
async function updateTwin(student_id, session_data) {
  return cbAI.call(() =>
    withRetry(() => aiClient.post('/api/ai/twin/update', { student_id, session_data }))
  );
}

/**
 * Generate a study schedule via the AI engine.
 */
async function generateSchedule(payload) {
  return cbAI.call(() =>
    withRetry(() => aiClient.post('/api/ai/scheduler/generate', payload))
  );
}

/**
 * Replan the schedule via the AI engine.
 */
async function replanSchedule(payload) {
  return cbAI.call(() =>
    withRetry(() => aiClient.post('/api/ai/scheduler/replan', payload))
  );
}

/**
 * Log a stress trigger from a session skip.
 */
async function logStressTrigger(student_id, trigger, source) {
  return cbStress.call(() =>
    withRetry(() => stressClient.post('/api/stress/log', { student_id, trigger, source }))
  );
}

module.exports = {
  withRetry,
  makeInternalClient,
  makeJwtClient,
  awardTokens,
  updateTwin,
  generateSchedule,
  replanSchedule,
  logStressTrigger,
  profileClient,
  quizClient,
  // Expose registry for /health endpoint
  circuitBreakerRegistry: registry,
};
