'use strict';

/**
 * Centralised Redis cache utility — Phase 9.3
 *
 * All services import this module to get consistent cache keys, TTLs,
 * and the getOrSet / invalidate helpers.
 *
 * Requires a redis v4 client to be passed in (each service has its own
 * connection). This avoids a shared singleton across service boundaries.
 *
 * Usage:
 *   const { createCacheService, CACHE_KEYS, CACHE_TTL } = require('../../shared/cache/cacheService');
 *   const cache = createCacheService(redisClient);
 *   const data  = await cache.getOrSet(CACHE_KEYS.STUDENT_PROFILE(id), fetchFn, CACHE_TTL.STUDENT_PROFILE);
 */

// ── Cache key factories ───────────────────────────────────────────────────────

const CACHE_KEYS = {
  STUDENT_PROFILE:     (id)              => `profile:${id}`,
  TODAY_SESSIONS:      (id)              => `sessions:today:${id}`,
  ACTIVE_PLAN:         (id)              => `plan:active:${id}`,
  STRESS_CURRENT:      (id)              => `stress:current:${id}`,
  TOKEN_BALANCE:       (id)              => `tokens:${id}`,
  ANALYTICS_DASHBOARD: (id)              => `analytics:dashboard:${id}`,
  EXAM_READINESS:      (id, examId)      => `readiness:${id}:${examId}`,
  GAP_REPORT:          (id)              => `gaps:${id}`,
  TWIN_VECTOR:         (id)              => `twin:${id}`,
  KNOWLEDGE_GRAPH:     (subject, board, grade) =>
    `kg:${subject.toLowerCase()}:${board.toLowerCase()}:${grade.toLowerCase().replace(/ /g, '')}`,
  LEADERBOARD:         (cluster)         => `leaderboard:cluster:${cluster}`,
};

// ── TTL constants (seconds) ───────────────────────────────────────────────────

const CACHE_TTL = {
  STUDENT_PROFILE:     300,    // 5 minutes
  TODAY_SESSIONS:      120,    // 2 minutes — changes on every session action
  ACTIVE_PLAN:         3600,   // 1 hour
  STRESS_CURRENT:      1800,   // 30 minutes
  TOKEN_BALANCE:       60,     // 1 minute — near real-time
  ANALYTICS_DASHBOARD: 3600,   // 1 hour
  EXAM_READINESS:      1800,   // 30 minutes
  GAP_REPORT:          3600,   // 1 hour
  TWIN_VECTOR:         3600,   // 1 hour — updated nightly by cron
  KNOWLEDGE_GRAPH:     86400,  // 24 hours — static NCERT data
  LEADERBOARD:         300,    // 5 minutes
};

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create a cache service bound to a specific Redis client.
 * @param {import('redis').RedisClientType} redisClient
 */
function createCacheService(redisClient) {
  /**
   * Cache-aside pattern: try Redis first, fall back to fetchFn on miss.
   *
   * @param {string}   key      Redis key
   * @param {Function} fetchFn  Async function that returns the fresh value
   * @param {number}   ttl      TTL in seconds
   * @returns {Promise<any>}    Parsed cached value or fresh value
   */
  async function getOrSet(key, fetchFn, ttl) {
    // Derive a human-readable key type for metrics labels (e.g. "profile", "plan:active")
    const keyType = key.split(':').slice(0, 2).join(':');

    try {
      const cached = await redisClient.get(key);
      if (cached !== null) {
        // Cache HIT — record metric
        try {
          const { cacheHitsTotal } = require('../metrics');
          cacheHitsTotal.inc({ cache_key_type: keyType });
        } catch (_) {}
        return JSON.parse(cached);
      }
    } catch (redisErr) {
      console.warn(`[cache] Redis GET failed for "${key}":`, redisErr.message);
    }

    // Cache MISS — record metric
    try {
      const { cacheMissesTotal } = require('../metrics');
      cacheMissesTotal.inc({ cache_key_type: keyType });
    } catch (_) {}

    const value = await fetchFn();

    try {
      await redisClient.set(key, JSON.stringify(value), { EX: ttl });
    } catch (redisErr) {
      console.warn(`[cache] Redis SET failed for "${key}":`, redisErr.message);
    }

    return value;
  }

  /**
   * Delete a single cache key.
   * @param {string} key
   */
  async function invalidate(key) {
    try {
      await redisClient.del(key);
    } catch (err) {
      console.warn(`[cache] Redis DEL failed for "${key}":`, err.message);
    }
  }

  /**
   * Delete all keys matching a glob pattern using SCAN + DEL.
   * Safe for production — uses cursor-based SCAN, never KEYS.
   *
   * @param {string} pattern  e.g. "profile:*" or "sessions:today:abc-123"
   */
  async function invalidatePattern(pattern) {
    try {
      let cursor = 0;
      const toDelete = [];

      do {
        const reply = await redisClient.scan(cursor, {
          MATCH: pattern,
          COUNT: 100,
        });
        cursor = reply.cursor;
        toDelete.push(...reply.keys);
      } while (cursor !== 0);

      if (toDelete.length > 0) {
        await redisClient.del(toDelete);
      }
    } catch (err) {
      console.warn(`[cache] invalidatePattern failed for "${pattern}":`, err.message);
    }
  }

  /**
   * Invalidate multiple specific keys at once.
   * @param {string[]} keys
   */
  async function invalidateMany(keys) {
    if (!keys || keys.length === 0) return;
    try {
      await redisClient.del(keys);
    } catch (err) {
      console.warn('[cache] invalidateMany failed:', err.message);
    }
  }

  return { getOrSet, invalidate, invalidatePattern, invalidateMany };
}

module.exports = { createCacheService, CACHE_KEYS, CACHE_TTL };
