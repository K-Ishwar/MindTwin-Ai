'use strict';\n
const logger = require('../../../../shared/logger');\n/**
 * Shared PostgreSQL pool factory â€” Phase 9.3
 *
 * Each service calls createPool() to get a properly configured pg.Pool.
 * Settings are tuned for microservice workloads:
 *   - max 10 connections per service (10 services Ã— 10 = 100 max, within PG default 100)
 *   - min 2 warm connections to avoid cold-start latency
 *   - statement_timeout kills runaway queries after 10 s
 *   - connectionTimeoutMillis fails fast if the pool is exhausted
 *
 * Usage (in each service's src/config/db.js):
 *   const { createPool } = require('../../../shared/config/db');
 *   module.exports = createPool();
 */

const { Pool } = require('pg');

/**
 * @param {object} [overrides]  Optional pool config overrides
 * @returns {{ query: Function, pool: Pool, checkConnection: Function }}
 */
function createPool(overrides = {}) {
  const pool = new Pool({
    connectionString:      process.env.DATABASE_URL || 'postgres://user:password@postgres:5432/mindtwin_db',
    max:                   parseInt(process.env.PG_POOL_MAX  || '10', 10),
    min:                   parseInt(process.env.PG_POOL_MIN  || '2',  10),
    idleTimeoutMillis:     parseInt(process.env.PG_IDLE_MS   || '30000', 10),
    connectionTimeoutMillis: parseInt(process.env.PG_CONN_TIMEOUT_MS || '5000', 10),
    statement_timeout:     parseInt(process.env.PG_STMT_TIMEOUT_MS  || '10000', 10),
    ...overrides,
  });

  pool.on('error', (err) => {
    logger.error('[pg] Unexpected error on idle client:', err.message);
    // Don't exit â€” let the pool recover by creating a new connection
  });

  pool.on('connect', () => {
    // Optional: log pool growth in development
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[pg] New client connected. Pool size: ${pool.totalCount}`);
    }
  });

  /**
   * Lightweight health check â€” used by /health endpoints.
   * @returns {Promise<boolean>}
   */
  async function checkConnection() {
    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
      return true;
    } finally {
      client.release();
    }
  }

  return {
    /** Execute a parameterised query. */
    query: (text, params) => pool.query(text, params),
    /** Raw pool â€” for transactions or advanced use. */
    pool,
    /** Health check. */
    checkConnection,
  };
}

module.exports = { createPool };
