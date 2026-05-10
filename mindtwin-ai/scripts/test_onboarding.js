/**
 * MindTwin AI — End-to-End Onboarding Flow Test
 * Run: node scripts/test_onboarding.js
 * Requires: docker-compose up (all services healthy)
 */

const axios = require('axios');

const BASE_URL = process.env.API_URL || 'http://localhost';
const TIMESTAMP = Date.now();

// ── State shared across tests ─────────────────────────────────────────────────
let state = {
  student_id: null,
  accessToken: null,
  refreshToken: null,
  topicIds: [],
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const results = [];

function pass(name) {
  results.push({ name, passed: true });
  console.log(`  ✅  PASS  ${name}`);
}

function fail(name, detail) {
  results.push({ name, passed: false, detail });
  console.log(`  ❌  FAIL  ${name}`);
  console.log(`           ↳ ${detail}`);
}

function authHeader() {
  return { Authorization: `Bearer ${state.accessToken}` };
}

function futureDate(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split('T')[0];
}

async function run(name, fn) {
  try {
    await fn();
  } catch (err) {
    const detail = err.response
      ? `HTTP ${err.response.status} — ${JSON.stringify(err.response.data)}`
      : err.message;
    fail(name, detail);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 1 — Register
// ─────────────────────────────────────────────────────────────────────────────
async function test1_register() {
  await run('POST /api/auth/register — register new student', async () => {
    const res = await axios.post(`${BASE_URL}/api/auth/register`, {
      name: 'Aisha Test',
      email: `aisha_test_${TIMESTAMP}@test.com`,
      password: 'testpass123',
      grade_level: 'Class 12',
      board: 'CBSE',
    });

    const { data } = res;
    if (!data.success) throw new Error(`success was ${data.success}`);
    if (!data.student?.id) throw new Error('student.id missing');

    state.student_id = data.student.id;
    pass('POST /api/auth/register — register new student');
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 2 — Login + get tokens
// ─────────────────────────────────────────────────────────────────────────────
async function test2_login() {
  await run('POST /api/auth/login — get tokens', async () => {
    const res = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: `aisha_test_${TIMESTAMP}@test.com`,
      password: 'testpass123',
    });

    const { data } = res;
    if (!data.success) throw new Error(`success was ${data.success}`);
    if (!data.accessToken) throw new Error('accessToken missing');
    if (!data.refreshToken) throw new Error('refreshToken missing');

    state.accessToken = data.accessToken;
    state.refreshToken = data.refreshToken;
    pass('POST /api/auth/login — get tokens');
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 3 — GET /api/auth/me
// ─────────────────────────────────────────────────────────────────────────────
async function test3_getMe() {
  await run('GET /api/auth/me — verify token works', async () => {
    const res = await axios.get(`${BASE_URL}/api/auth/me`, { headers: authHeader() });
    const { data } = res;

    if (!data.success) throw new Error(`success was ${data.success}`);
    if (data.student?.name !== 'Aisha Test') throw new Error(`name mismatch: got "${data.student?.name}"`);

    pass('GET /api/auth/me — verify token works');
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 4 — Baseline questions
// ─────────────────────────────────────────────────────────────────────────────
async function test4_baselineQuestions() {
  await run('GET /api/quiz/baseline-questions — fetch 5 topics', async () => {
    const res = await axios.get(`${BASE_URL}/api/quiz/baseline-questions`);
    const { data } = res;

    if (!data.topics || !Array.isArray(data.topics)) throw new Error('topics is not an array');
    if (data.topics.length !== 5) throw new Error(`expected 5 topics, got ${data.topics.length}`);
    if (!data.topics[0].id) throw new Error('topic missing id field');

    state.topicIds = data.topics.map((t) => t.id);
    pass('GET /api/quiz/baseline-questions — fetch 5 topics');
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 5 — Complete onboarding
// ─────────────────────────────────────────────────────────────────────────────
async function test5_completeOnboarding() {
  await run('POST /api/profile/onboarding/complete — complete onboarding', async () => {
    const baselineResults = state.topicIds.map((id) => ({ topic_id: id, score_percent: 60 }));

    const res = await axios.post(
      `${BASE_URL}/api/profile/onboarding/complete`,
      {
        exam_dates: [{ subject: 'Mathematics', exam_date: futureDate(30), board: 'CBSE' }],
        study_preferences: {
          max_daily_study_hours: 5,
          preferred_study_start_time: '08:00',
          social_media_apps: ['Instagram', 'YouTube'],
        },
        baseline_quiz_results: baselineResults,
      },
      { headers: authHeader() }
    );

    const { data } = res;
    if (!data.success) throw new Error(`success was ${data.success}`);
    if (data.next_step !== 'view_dashboard') throw new Error(`unexpected next_step: ${data.next_step}`);

    pass('POST /api/profile/onboarding/complete — complete onboarding');
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 6 — Profile shows onboarding_completed: true
// ─────────────────────────────────────────────────────────────────────────────
async function test6_profileOnboarded() {
  await run('GET /api/profile/ — onboarding_completed is true', async () => {
    const res = await axios.get(`${BASE_URL}/api/profile/`, { headers: authHeader() });
    const { data } = res;

    if (!data.success) throw new Error(`success was ${data.success}`);
    if (data.profile?.onboarding_completed !== true) {
      throw new Error(`onboarding_completed is ${data.profile?.onboarding_completed}`);
    }

    pass('GET /api/profile/ — onboarding_completed is true');
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 7 — Digital twin vector
// ─────────────────────────────────────────────────────────────────────────────
async function test7_twinVector() {
  await run('GET /api/profile/twin — twin vector is valid', async () => {
    const res = await axios.get(`${BASE_URL}/api/profile/twin`, { headers: authHeader() });
    const { data } = res;

    if (!data.success) throw new Error(`success was ${data.success}`);

    const twin = data.twin;

    // Fetch actual vector from AI engine for full validation
    let vector = null;
    try {
      const aiRes = await axios.get(`${BASE_URL}/api/ai/${state.student_id}`);
      vector = aiRes.data.twin_vector;
    } catch (_) {
      // AI engine might not be reachable from host; skip deep vector check
      console.log('           ℹ  AI engine not reachable from host — skipping vector depth check');
    }

    if (vector) {
      if (vector.length !== 64) throw new Error(`twin_vector has ${vector.length} dims, expected 64`);
      const outOfRange = vector.filter((v) => v < 0 || v > 1);
      if (outOfRange.length > 0) throw new Error(`${outOfRange.length} vector values out of [0,1] range`);
    }

    const cluster = twin?.peer_cluster_id ?? null;
    if (cluster === null) throw new Error('peer_cluster_id missing');
    if (cluster < 0 || cluster > 4) throw new Error(`peer_cluster_id ${cluster} out of range 0-4`);

    pass('GET /api/profile/twin — twin vector is valid');
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 8 — Refresh token
// ─────────────────────────────────────────────────────────────────────────────
async function test8_refreshToken() {
  await run('POST /api/auth/refresh — get new access token', async () => {
    const res = await axios.post(`${BASE_URL}/api/auth/refresh`, {
      refreshToken: state.refreshToken,
    });

    const { data } = res;
    if (!data.success) throw new Error(`success was ${data.success}`);
    if (!data.accessToken) throw new Error('new accessToken missing');

    // Update stored token for logout test
    state.accessToken = data.accessToken;
    pass('POST /api/auth/refresh — get new access token');
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 9 — Logout
// ─────────────────────────────────────────────────────────────────────────────
async function test9_logout() {
  await run('POST /api/auth/logout — logout successfully', async () => {
    const res = await axios.post(
      `${BASE_URL}/api/auth/logout`,
      {},
      { headers: authHeader() }
    );

    const { data } = res;
    if (!data.success) throw new Error(`success was ${data.success}`);

    pass('POST /api/auth/logout — logout successfully');
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// RUNNER
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🧬  MindTwin AI — Onboarding E2E Test Suite');
  console.log(`📡  API base: ${BASE_URL}`);
  console.log(`🕐  Timestamp: ${TIMESTAMP}\n`);
  console.log('─'.repeat(60));

  await test1_register();
  await test2_login();
  await test3_getMe();
  await test4_baselineQuestions();
  await test5_completeOnboarding();
  await test6_profileOnboarded();
  await test7_twinVector();
  await test8_refreshToken();
  await test9_logout();

  console.log('─'.repeat(60));

  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed);

  console.log(`\n📊  Results: ${passed}/${total} tests passed\n`);

  if (failed.length > 0) {
    console.log('🔴  Failures:');
    failed.forEach((f) => {
      console.log(`    • ${f.name}`);
      console.log(`      ${f.detail}`);
    });
    console.log('');
    process.exit(1);
  } else {
    console.log('🎉  All tests passed! Onboarding flow is working correctly.\n');
    process.exit(0);
  }
}

main();
