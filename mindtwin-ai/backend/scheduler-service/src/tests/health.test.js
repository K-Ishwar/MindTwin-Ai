const request = require('supertest');
const express = require('express');

function buildApp() {
  const app = express();
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'scheduler-service' });
  });
  return app;
}

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const app = buildApp();
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('scheduler-service');
  });
});
