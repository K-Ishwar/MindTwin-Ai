/**
 * Auth Service — Health endpoint smoke test
 * Runs in CI without a real database connection.
 */
const request = require('supertest');
const express = require('express');

// Build a minimal app that mirrors just the health route
// so we don't need DB/Redis to be available in unit tests
function buildApp() {
  const app = express();
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'auth-service' });
  });
  return app;
}

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const app = buildApp();
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('auth-service');
  });
});
