'use strict';

/**
 * Circuit Breaker — Phase 9.4
 *
 * Prevents cascading failures when a downstream service is unhealthy.
 *
 * States:
 *   CLOSED    — normal operation, requests pass through
 *   OPEN      — service is failing, requests are rejected immediately
 *   HALF_OPEN — recovery probe: one request is allowed through to test health
 *
 * Usage:
 *   const { CircuitBreaker } = require('../../../shared/utils/circuitBreaker');
 *   const cb = new CircuitBreaker('ai-engine', { failureThreshold: 5, recoveryTimeout: 30000 });
 *   const result = await cb.call(() => axios.post(...));
 */

const logger = require('../logger');
const { ServiceUnavailableError } = require('../errors/AppErrors');

class CircuitBreaker {
  /**
   * @param {string} serviceName         Human-readable name for logging
   * @param {object} [options]
   * @param {number} [options.failureThreshold=5]   Failures before opening
   * @param {number} [options.recoveryTimeout=30000] ms before attempting HALF_OPEN
   * @param {number} [options.successThreshold=2]   Successes in HALF_OPEN to close
   */
  constructor(serviceName, options = {}) {
    this.serviceName       = serviceName;
    this.failureThreshold  = options.failureThreshold  ?? 5;
    this.recoveryTimeout   = options.recoveryTimeout   ?? 30_000;
    this.successThreshold  = options.successThreshold  ?? 2;

    this.state             = 'CLOSED';
    this.failures          = 0;
    this.successes         = 0;   // consecutive successes in HALF_OPEN
    this.lastFailureTime   = null;
    this.totalCalls        = 0;
    this.totalFailures     = 0;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Execute requestFn through the circuit breaker.
   * @param {Function} requestFn  Async function that makes the actual call
   * @returns {Promise<any>}
   * @throws {ServiceUnavailableError} when circuit is OPEN
   */
  async call(requestFn) {
    this.totalCalls++;

    if (this.state === 'OPEN') {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.recoveryTimeout) {
        this._transitionTo('HALF_OPEN');
      } else {
        const waitSec = Math.ceil((this.recoveryTimeout - elapsed) / 1000);
        logger.warn(`Circuit OPEN — rejecting call to ${this.serviceName}`, {
          service:      this.serviceName,
          retry_in_sec: waitSec,
        });
        throw new ServiceUnavailableError(this.serviceName);
      }
    }

    try {
      const result = await requestFn();
      this._onSuccess();
      return result;
    } catch (err) {
      this._onFailure(err);
      throw err;
    }
  }

  /** Current breaker status — useful for health endpoints */
  getStatus() {
    return {
      service:       this.serviceName,
      state:         this.state,
      failures:      this.failures,
      total_calls:   this.totalCalls,
      total_failures: this.totalFailures,
      last_failure:  this.lastFailureTime
        ? new Date(this.lastFailureTime).toISOString()
        : null,
    };
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  _onSuccess() {
    if (this.state === 'HALF_OPEN') {
      this.successes++;
      if (this.successes >= this.successThreshold) {
        this._transitionTo('CLOSED');
      }
    } else {
      // Reset failure count on any success in CLOSED state
      this.failures = 0;
    }
  }

  _onFailure(err) {
    this.totalFailures++;
    this.failures++;
    this.successes = 0;
    this.lastFailureTime = Date.now();

    logger.warn(`Circuit breaker failure for ${this.serviceName}`, {
      service:   this.serviceName,
      state:     this.state,
      failures:  this.failures,
      threshold: this.failureThreshold,
      error:     err.message,
    });

    if (this.state === 'HALF_OPEN') {
      // Single failure in HALF_OPEN → back to OPEN
      this._transitionTo('OPEN');
    } else if (this.failures >= this.failureThreshold) {
      this._transitionTo('OPEN');
    }
  }

  _transitionTo(newState) {
    const prev = this.state;
    this.state = newState;

    if (newState === 'CLOSED') {
      this.failures  = 0;
      this.successes = 0;
    } else if (newState === 'HALF_OPEN') {
      this.successes = 0;
    }

    logger.warn(`Circuit breaker state change: ${prev} → ${newState}`, {
      service: this.serviceName,
      state:   newState,
    });
  }
}

/**
 * Registry of circuit breakers — one per downstream service.
 * Shared across all calls within the same process.
 */
class CircuitBreakerRegistry {
  constructor() {
    this._breakers = new Map();
  }

  /**
   * Get or create a circuit breaker for a named service.
   * @param {string} serviceName
   * @param {object} [options]
   * @returns {CircuitBreaker}
   */
  get(serviceName, options = {}) {
    if (!this._breakers.has(serviceName)) {
      this._breakers.set(serviceName, new CircuitBreaker(serviceName, options));
    }
    return this._breakers.get(serviceName);
  }

  /** Return status of all registered breakers — for /health endpoints */
  getAllStatus() {
    const out = {};
    for (const [name, cb] of this._breakers) {
      out[name] = cb.getStatus();
    }
    return out;
  }
}

// Module-level singleton registry
const registry = new CircuitBreakerRegistry();

module.exports = { CircuitBreaker, CircuitBreakerRegistry, registry };
