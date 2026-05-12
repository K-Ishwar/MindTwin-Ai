'use strict';

/**
 * Shared Prometheus metrics — Phase 9.5
 *
 * Each service calls metricsMiddleware(app) in its index.js to expose /metrics.
 * Custom business metrics are exported for use in controllers.
 *
 * Usage in index.js:
 *   const { metricsMiddleware } = require('../../../shared/metrics');
 *   metricsMiddleware(app);   // registers GET /metrics — place BEFORE routes
 *
 * Usage in controllers:
 *   const { quizAttemptsTotal, stressPredictionsTotal } = require('../../../shared/metrics');
 *   quizAttemptsTotal.inc({ subject: 'Mathematics', gap_detected: 'true' });
 */

const promClient = require('prom-client');

// ── Default metrics (CPU, memory, GC, event-loop lag) ────────────────────────
// Each service gets its own prefix so metrics don't collide in Prometheus.
promClient.collectDefaultMetrics({
  prefix: `${(process.env.SERVICE_NAME || 'unknown').replace(/-/g, '_')}_`,
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
});

// ── HTTP metrics ──────────────────────────────────────────────────────────────

const httpRequestDuration = new promClient.Histogram({
  name:       'http_request_duration_ms',
  help:       'HTTP request duration in milliseconds',
  labelNames: ['method', 'route', 'status_code', 'service'],
  buckets:    [10, 50, 100, 200, 500, 1000, 2000, 5000],
});

const httpRequestTotal = new promClient.Counter({
  name:       'http_requests_total',
  help:       'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code', 'service'],
});

// ── Business metrics ──────────────────────────────────────────────────────────

const activeStudentSessions = new promClient.Gauge({
  name: 'active_study_sessions_total',
  help: 'Number of active study sessions right now',
});

const quizAttemptsTotal = new promClient.Counter({
  name:       'quiz_attempts_total',
  help:       'Total quiz attempts',
  labelNames: ['subject', 'gap_detected'],
});

const stressPredictionsTotal = new promClient.Counter({
  name:       'stress_predictions_total',
  help:       'Total stress predictions made',
  labelNames: ['severity'],
});

const tokenAwardsTotal = new promClient.Counter({
  name:       'token_awards_total',
  help:       'Total focus tokens awarded',
  labelNames: ['action'],
});

const cacheHitRate = new promClient.Gauge({
  name:       'cache_hit_rate',
  help:       'Redis cache hit rate (0–1)',
  labelNames: ['cache_key_type'],
});

const cacheHitsTotal = new promClient.Counter({
  name:       'cache_hits_total',
  help:       'Total Redis cache hits',
  labelNames: ['cache_key_type'],
});

const cacheMissesTotal = new promClient.Counter({
  name:       'cache_misses_total',
  help:       'Total Redis cache misses',
  labelNames: ['cache_key_type'],
});

const dbQueryDuration = new promClient.Histogram({
  name:       'db_query_duration_ms',
  help:       'PostgreSQL query duration in milliseconds',
  labelNames: ['service', 'query_type'],
  buckets:    [1, 5, 10, 25, 50, 100, 250, 500, 1000],
});

const dbPoolConnections = new promClient.Gauge({
  name:       'db_pool_connections',
  help:       'PostgreSQL connection pool utilization',
  labelNames: ['service', 'state'],  // state: total | idle | waiting
});

const circuitBreakerState = new promClient.Gauge({
  name:       'circuit_breaker_state',
  help:       'Circuit breaker state (0=CLOSED, 1=HALF_OPEN, 2=OPEN)',
  labelNames: ['service', 'target'],
});

// ── HTTP instrumentation middleware ───────────────────────────────────────────

/**
 * Express middleware that records http_request_duration_ms and
 * http_requests_total for every response.
 *
 * Normalises dynamic route segments (/api/profile/123 → /api/profile/:id)
 * to avoid high-cardinality label explosion.
 */
function httpMetricsMiddleware(req, res, next) {
  const start   = Date.now();
  const service = process.env.SERVICE_NAME || 'unknown';

  res.on('finish', () => {
    const duration = Date.now() - start;
    // Normalise UUIDs and numeric IDs in the path
    const route = req.route?.path
      || req.originalUrl.replace(/\/[0-9a-f-]{8,}/gi, '/:id').replace(/\?.*$/, '');

    const labels = {
      method:      req.method,
      route,
      status_code: String(res.statusCode),
      service,
    };

    httpRequestDuration.observe(labels, duration);
    httpRequestTotal.inc(labels);
  });

  next();
}

// ── /metrics endpoint ─────────────────────────────────────────────────────────

/**
 * Register the /metrics endpoint on an Express app.
 * Call this BEFORE route registration so it isn't caught by auth middleware.
 *
 * @param {import('express').Application} app
 */
function metricsMiddleware(app) {
  app.get('/metrics', async (req, res) => {
    try {
      res.set('Content-Type', promClient.register.contentType);
      res.end(await promClient.register.metrics());
    } catch (err) {
      res.status(500).end(err.message);
    }
  });

  // Also wire up the HTTP duration/count middleware
  app.use(httpMetricsMiddleware);
}

// ── Pool metrics helper ───────────────────────────────────────────────────────

/**
 * Periodically sample a pg.Pool and update dbPoolConnections gauge.
 * Call once per service after pool creation.
 *
 * @param {import('pg').Pool} pool
 * @param {string} serviceName
 * @param {number} [intervalMs=15000]
 */
function trackPoolMetrics(pool, serviceName, intervalMs = 15_000) {
  setInterval(() => {
    dbPoolConnections.set({ service: serviceName, state: 'total'   }, pool.totalCount);
    dbPoolConnections.set({ service: serviceName, state: 'idle'    }, pool.idleCount);
    dbPoolConnections.set({ service: serviceName, state: 'waiting' }, pool.waitingCount);
  }, intervalMs);
}

module.exports = {
  // Metrics
  httpRequestDuration,
  httpRequestTotal,
  activeStudentSessions,
  quizAttemptsTotal,
  stressPredictionsTotal,
  tokenAwardsTotal,
  cacheHitRate,
  cacheHitsTotal,
  cacheMissesTotal,
  dbQueryDuration,
  dbPoolConnections,
  circuitBreakerState,
  // Helpers
  metricsMiddleware,
  httpMetricsMiddleware,
  trackPoolMetrics,
  // Raw registry (for custom use)
  register: promClient.register,
};
