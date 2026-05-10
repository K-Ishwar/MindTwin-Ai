/**
 * Phase 3 Integration — End-to-End Test Suite
 * Tests the complete student journey: register → onboard → schedule → study → reward → streak
 */

const axios = require('axios');

const BASE = process.env.API_URL || 'http://localhost';
const INTERNAL_KEY = process.env.INTERNAL_API_KEY || 'mindtwin-internal-secret';

const TS = Date.now();
const TEST_EMAIL = `phase3_test_${TS}@test.com`;
const TEST_PASS  = 'testpass123';

let passed = 0;
let failed = 0;
const results = [];

// ── Test runner ────────────────────────────────────────────────────────────────
async function test(label, fn) {
  try {
    await fn();
    results.push({ label, ok: true });
    passed++;
    console.log(`  \u2705  PASS  ${label}`);
  } catch (err) {
    const detail = err.response?.data
      ? JSON.stringify(err.response.data)
      : err.message;
    results.push({ label, ok: false, detail });
    failed++;
    console.log(`  \u274C  FAIL  ${label}`);
    console.log(`         \u21B3 ${detail}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

// ── State shared across tests ──────────────────────────────────────────────────
const state = {
  accessToken: null,
  refreshToken: null,
  student_id: null,
  topic_ids: [],
  plan_schedule: [],
  initial_balance: 0,
};

const authHeaders = () => ({ Authorization: `Bearer ${state.accessToken}` });
const internalHeaders = () => ({ 'X-Internal-Key': INTERNAL_KEY });

// ── Test Suite ─────────────────────────────────────────────────────────────────
async function run() {
  console.log('\n\uD83E\uDDEC  MindTwin AI \u2014 Phase 3 Integration Test Suite');
  console.log(`\uD83D\uDCE1  API base: ${BASE}`);
  console.log(`\uD83D\uDD51  Timestamp: ${TS}`);
  console.log('\n' + '\u2500'.repeat(60));

  // ── 1. Register ──────────────────────────────────────────────────────────────
  await test('POST /api/auth/register \u2014 register new student', async () => {
    const { data } = await axios.post(`${BASE}/api/auth/register`, {
      name: 'Phase3 Tester',
      email: TEST_EMAIL,
      password: TEST_PASS,
      grade_level: 12,
      board: 'CBSE',
    });
    assert(data.success, `success was ${data.success}`);
    assert(data.student?.id, 'student.id missing');
    state.student_id = data.student.id;
  });

  // ── 1b. Login to get tokens ───────────────────────────────────────────────────
  await test('POST /api/auth/login \u2014 get access token', async () => {
    const { data } = await axios.post(`${BASE}/api/auth/login`, {
      email: TEST_EMAIL,
      password: TEST_PASS,
    });
    assert(data.success, `login success was ${data.success}`);
    assert(data.accessToken, 'accessToken missing');
    state.accessToken  = data.accessToken;
    state.refreshToken = data.refreshToken;
    // Override student_id in case register didn't return it
    if (data.student?.id) state.student_id = data.student.id;
  });

  // ── 2. Fetch baseline topics ─────────────────────────────────────────────────
  await test('GET /api/quiz/baseline-questions \u2014 get 5 topics', async () => {
    const { data } = await axios.get(`${BASE}/api/quiz/baseline-questions`);
    assert(data.success, 'success was false');
    assert(Array.isArray(data.topics) && data.topics.length > 0, 'no topics returned');
    state.topic_ids = data.topics.map(t => t.id);
  });

  // ── 3. Complete onboarding ────────────────────────────────────────────────────
  await test('POST /api/profile/onboarding/complete \u2014 complete onboarding', async () => {
    const examDate = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
    const { data } = await axios.post(
      `${BASE}/api/profile/onboarding/complete`,
      {
        exam_dates: [{ subject: 'Mathematics', exam_date: examDate }],
        study_preferences: { max_daily_study_hours: 5, preferred_study_start_time: '09:00' },
        baseline_quiz_results: state.topic_ids.map(id => ({ topic_id: id, score_percent: 65 })),
      },
      { headers: authHeaders() }
    );
    assert(data.success, `success was ${data.success}`);
  });

  // ── 4. Verify onboarding_completed ───────────────────────────────────────────
  await test('GET /api/profile/ \u2014 onboarding_completed is true', async () => {
    const { data } = await axios.get(`${BASE}/api/profile/`, { headers: authHeaders() });
    assert(data.profile?.onboarding_completed === true, 'onboarding_completed is not true');
  });

  // ── 5. Generate schedule ─────────────────────────────────────────────────────
  await test('POST /api/scheduler/generate \u2014 schedule with >= 5 days', async () => {
    const { data } = await axios.post(
      `${BASE}/api/scheduler/generate`, {},
      { headers: authHeaders() }
    );
    assert(data.success, `success was ${data.success}`);
    assert(Array.isArray(data.schedule), 'schedule is not an array');
    assert(data.schedule.length >= 5, `only ${data.schedule.length} days generated (need >= 5)`);
    state.plan_schedule = data.schedule;
  });

  // ── 6. Verify active plan ─────────────────────────────────────────────────────
  await test('GET /api/scheduler/plan \u2014 active plan exists', async () => {
    const { data } = await axios.get(`${BASE}/api/scheduler/plan`, { headers: authHeaders() });
    assert(data.success, 'success was false');
    assert(Array.isArray(data.schedule) && data.schedule.length >= 5, 'plan schedule too short');
  });

  // ── 7. Check today's sessions ─────────────────────────────────────────────────
  await test("GET /api/scheduler/today \u2014 today's sessions returned", async () => {
    const { data } = await axios.get(`${BASE}/api/scheduler/today`, { headers: authHeaders() });
    assert(data.success, 'success was false');
    assert(Array.isArray(data.sessions), 'sessions is not an array');
    // Pick a topic to complete from the first day's slots
    const slot = state.plan_schedule[0]?.slots?.find(s => s.topic_id);
    if (slot) state.complete_topic_id = slot.topic_id;
  });

  // ── 8. Get initial token balance ──────────────────────────────────────────────
  await test('GET /api/reward/balance \u2014 get initial balance', async () => {
    const { data } = await axios.get(`${BASE}/api/reward/balance`, { headers: authHeaders() });
    assert(data.success !== false, 'balance call failed');
    state.initial_balance = data.balance || 0;
  });

  // ── 9. Complete a session ─────────────────────────────────────────────────────
  await test('POST /api/scheduler/session/complete \u2014 tokens awarded', async () => {
    const topic_id = state.complete_topic_id || state.topic_ids[0];
    const { data } = await axios.post(
      `${BASE}/api/scheduler/session/complete`,
      { topic_id, actual_duration_min: 30, mood_after: 4, pomodoro_count: 1 },
      { headers: authHeaders() }
    );
    assert(data.success, `success was ${data.success}`);
    assert(data.tokens_earned > 0, `tokens_earned was ${data.tokens_earned}, expected > 0`);
  });

  // ── 10. Verify balance increased ──────────────────────────────────────────────
  await test('GET /api/reward/balance \u2014 balance increased after session', async () => {
    const { data } = await axios.get(`${BASE}/api/reward/balance`, { headers: authHeaders() });
    assert(data.balance > state.initial_balance, `balance ${data.balance} did not increase from ${state.initial_balance}`);
    assert(data.token_history?.length > 0, 'token_history is empty');
  });

  // ── 11. Verify streak = 1 ─────────────────────────────────────────────────────
  await test('GET /api/reward/streak \u2014 streak is 1 after first session', async () => {
    const { data } = await axios.get(`${BASE}/api/reward/streak`, { headers: authHeaders() });
    assert(data.success, 'success was false');
    assert(data.current_streak >= 1, `streak was ${data.current_streak}, expected >= 1`);
  });

  // ── 12. Replan ────────────────────────────────────────────────────────────────
  await test('POST /api/scheduler/replan \u2014 replan returns new schedule', async () => {
    const { data } = await axios.post(
      `${BASE}/api/scheduler/replan`,
      { reason: 'completed_early' },
      { headers: authHeaders() }
    );
    assert(data.success, `success was ${data.success}`);
    assert(Array.isArray(data.schedule), 'schedule is not an array');
  });

  // ── 13. Award streak bonus ─────────────────────────────────────────────────────
  await test('POST /api/reward/award (streak_7) \u2014 big bonus awarded', async () => {
    const { data } = await axios.post(
      `${BASE}/api/reward/award`,
      { student_id: state.student_id, action: 'streak_7', context: {} },
      { headers: internalHeaders() }
    );
    assert(data.success, `success was ${data.success}`);
    assert(data.tokens_earned === 50, `expected 50 tokens, got ${data.tokens_earned}`);
    assert(data.social_media_mins_unlocked === 60, `expected 60 social mins, got ${data.social_media_mins_unlocked}`);
  });

  // ── 14. Social media unlock ────────────────────────────────────────────────────
  await test('POST /api/reward/social-media/unlock \u2014 unlock Instagram', async () => {
    const { data } = await axios.post(
      `${BASE}/api/reward/social-media/unlock`,
      { app_name: 'Instagram', minutes_requested: 15 },
      { headers: authHeaders() }
    );
    assert(data.success, `success was ${data.success}`);
    assert(data.minutes_granted === 15, `expected 15 mins, got ${data.minutes_granted}`);
    assert(data.session_token, 'session_token missing');
  });

  // ── Results ────────────────────────────────────────────────────────────────────
  console.log('\n' + '\u2500'.repeat(60));
  console.log(`\n\uD83D\uDCCA  Phase 3 Integration: ${passed}/${passed + failed} assertions passed`);

  if (failed > 0) {
    console.log('\n\uD83D\uDD34  Failures:');
    results.filter(r => !r.ok).forEach(r => {
      console.log(`    \u2022 ${r.label}`);
      console.log(`      ${r.detail}`);
    });
    process.exit(1);
  } else {
    console.log('\n\uD83C\uDF89  All Phase 3 integration tests passed!\n');
  }
}

run().catch(err => {
  console.error('\nFatal error:', err.message);
  process.exit(1);
});
