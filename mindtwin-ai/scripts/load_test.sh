#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# MindTwin AI — Load Test Script
# Basic load test using curl in parallel.
# For production-grade load testing, install k6: https://k6.io
#
# Usage:
#   bash scripts/load_test.sh [BASE_URL] [CONCURRENT]
#
# Examples:
#   bash scripts/load_test.sh                                  # local dev
#   bash scripts/load_test.sh https://api.mindtwin.ai 100     # production
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

BASE_URL="${1:-http://localhost:80}"
CONCURRENT="${2:-50}"

echo "════════════════════════════════════════════════════════"
echo "  MindTwin AI — Load Test"
echo "  Target:      $BASE_URL"
echo "  Concurrency: $CONCURRENT"
echo "════════════════════════════════════════════════════════"
echo ""

# ── Test 1: Health endpoint throughput ───────────────────────────────────────
echo "── Test 1: Health endpoint (200 requests, parallel) ──"
START=$(date +%s%N)

for i in $(seq 1 200); do
  curl -s --max-time 5 "$BASE_URL/health" > /dev/null &
done
wait

END=$(date +%s%N)
ELAPSED=$(( (END - START) / 1000000 ))
echo "  200 health requests completed in ${ELAPSED}ms"
echo "  Throughput: $(( 200 * 1000 / ELAPSED )) req/s"
echo ""

# ── Test 2: Auth service health ───────────────────────────────────────────────
echo "── Test 2: Auth service health ──"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$BASE_URL/api/auth/health" 2>/dev/null || echo "000")
echo "  GET /api/auth/health → HTTP $STATUS"
echo ""

# ── Test 3: Rate limiter on login endpoint ────────────────────────────────────
echo "── Test 3: Rate limiter — 15 rapid login attempts (expect 429 after 5) ──"
LOCK_TRIGGERED=false

for i in $(seq 1 15); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 \
    -X POST "$BASE_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"loadtest_nonexistent@mindtwin.ai","password":"wrongpassword123"}')

  echo "  Attempt $i: HTTP $STATUS"

  if [ "$STATUS" = "429" ] && [ "$LOCK_TRIGGERED" = "false" ]; then
    echo "  ✅ Account lockout triggered at attempt $i (expected: 5-6)"
    LOCK_TRIGGERED=true
  fi
done

if [ "$LOCK_TRIGGERED" = "false" ]; then
  echo "  ⚠️  WARNING: Account lockout was NOT triggered after 15 attempts!"
  echo "     Check that Redis is connected and the lockout middleware is active."
fi
echo ""

# ── Test 4: Concurrent API requests ──────────────────────────────────────────
echo "── Test 4: $CONCURRENT concurrent requests to /health ──"
START=$(date +%s%N)
PIDS=()

for i in $(seq 1 "$CONCURRENT"); do
  curl -s --max-time 10 "$BASE_URL/health" > /dev/null &
  PIDS+=($!)
done

FAILED=0
for pid in "${PIDS[@]}"; do
  wait "$pid" || FAILED=$((FAILED + 1))
done

END=$(date +%s%N)
ELAPSED=$(( (END - START) / 1000000 ))
SUCCESS=$(( CONCURRENT - FAILED ))

echo "  Completed: $SUCCESS/$CONCURRENT successful"
echo "  Failed:    $FAILED"
echo "  Duration:  ${ELAPSED}ms"
echo ""

# ── Summary ───────────────────────────────────────────────────────────────────
echo "════════════════════════════════════════════════════════"
echo "  Load test complete"
echo ""
echo "  For production-grade load testing with ramp-up,"
echo "  percentile latencies, and thresholds, use k6:"
echo ""
echo "    brew install k6   # macOS"
echo "    k6 run scripts/k6_load_test.js"
echo "════════════════════════════════════════════════════════"
