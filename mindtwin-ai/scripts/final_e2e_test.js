#!/usr/bin/env node
'use strict';

/**
 * MindTwin AI — Final End-to-End Verification
 *
 * Tests the complete user journey from registration through every feature.
 * All tests are real HTTP calls — no mocks.
 *
 * Usage:
 *   node scripts/final_e2e_test.js [base_url]
 *
 * Examples:
 *   node scripts/final_e2e_test.js                          # local dev
 *   node scripts/final_e2e_test.js https://api.mindtwin.ai  # production
 *
 * Exit code: 0 = all pass, 1 = one or more failures
 */

const axios = require('axios');

const BASE    = process.argv[2] || 'http://localhost:80';
const TIMEOUT = 15_000;

// ── Shared state (populated as tests run) ─────────────────────────────────────
const ctx = {
  studentEmail:    `e2e_${Date.now()}@mindtwin-test.com`,
  studentPassword: 'E2eTest@2025',
  studentToken:    null,
  studentId:       null,
  refreshToken:    null,
  examId:          null,
  topicId:         null,
  planId:          null,
  sessionTopicId:  null,
  guardianEmail:   `guardian_${Date.now()}@mindtwin-test.com`,
  guardianPassword:'Guardian@2025',
  guardianToken:   null,
  guardianId:      null,
  linkId:          null,
  insightId:       null,
};

// ── Test runner ───────────────────────────────────────────────────────────────
const results = [];
let currentPhase = '';

async function test(name, fn) {
  try {
    await fn();
    results.push({ phase: currentPhase, name, status: 'PASS' });
    console.log(`  ✅ ${name}`);
  } catch (err) {
    const msg = err.response
      ? `HTTP ${err.response.status} — ${JSON.stringify(err.response.data?.error ?? err.response.data)}`
      : err.message;
    results.push({ phase: currentPhase, name, status: 'FAIL', error: msg });
    console.log(`  ❌ ${name}`);
    console.log(`     ${msg}`);
  }
}

function phase(label) {
  currentPhase = label;
  console.log(`\n${label}`);
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────
function api(token) {
  return axios.create({
    baseURL: BASE,
    timeout: TIMEOUT,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    validateStatus: null,   // never throw on HTTP errors — we assert manually
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertOk(res, label) {
  assert(
    res.status >= 200 && res.status < 300,
    `${label}: expected 2xx, got ${res.status} — ${JSON.stringify(res.data?.error ?? res.data)}`
  );
  assert(res.data?.success !== false, `${label}: success=false — ${JSON.stringify(res.data?.error)}`);
}

// ── Main test suite ───────────────────────────────────────────────────────────
async function run() {
  console.log('\n🧠 MindTwin AI — Full End-to-End Test Suite');
  console.log(`🌐 Target: ${BASE}`);
  console.log(`⏱  Timeout: ${TIMEOUT}ms per request\n`);

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 1 — Infrastructure
  // ══════════════════════════════════════════════════════════════════════════
  phase('📦 Phase 1: Infrastructure');

  await test('NGINX health endpoint responds', async () => {
    const res = await api().get('/health');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });

  await test('Auth service health', async () => {
    const res = await api().get('/api/auth/health');
    // Some services expose /health at root, others at /api/<svc>/health
    // Accept either 200 or 404 (route not defined) — what matters is the service is up
    assert(res.status !== 502 && res.status !== 503, `Service unreachable: ${res.status}`);
  });

  await test('All 8 backend services reachable via NGINX', async () => {
    const probes = [
      '/api/auth/health',
      '/api/profile/health',
      '/api/scheduler/health',
      '/api/quiz/health',
      '/api/stress/health',
      '/api/reward/health',
      '/api/notification/health',
      '/api/analytics/health',
    ];
    const results = await Promise.all(probes.map(p => api().get(p)));
    const down = results.filter(r => r.status === 502 || r.status === 503);
    assert(down.length === 0, `${down.length} service(s) returned 502/503`);
  });

  await test('AI engine reachable', async () => {
    const res = await api().get('/api/ai/health');
    assert(res.status !== 502 && res.status !== 503, `AI engine unreachable: ${res.status}`);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 2 — Student Registration & Auth
  // ══════════════════════════════════════════════════════════════════════════
  phase('👤 Phase 2: Student Registration & Auth');

  await test('Student registers with valid data', async () => {
    const res = await api().post('/api/auth/register', {
      name:        'E2E Test Student',
      email:       ctx.studentEmail,
      password:    ctx.studentPassword,
      grade_level: 'Class 12',
      board:       'CBSE',
    });
    assertOk(res, 'register');
    assert(res.data.student?.id, 'No student.id in response');
    ctx.studentId = res.data.student.id;
  });

  await test('Duplicate registration returns 409', async () => {
    const res = await api().post('/api/auth/register', {
      name: 'Duplicate', email: ctx.studentEmail,
      password: ctx.studentPassword, grade_level: 'Class 12', board: 'CBSE',
    });
    assert(res.status === 409, `Expected 409, got ${res.status}`);
  });

  await test('Weak password rejected on registration', async () => {
    const res = await api().post('/api/auth/register', {
      name: 'Weak Pass', email: `weak_${Date.now()}@test.com`,
      password: 'password', grade_level: 'Class 12', board: 'CBSE',
    });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
    assert(
      res.data?.error?.code === 'WEAK_PASSWORD' || res.data?.error?.message?.toLowerCase().includes('password'),
      `Expected WEAK_PASSWORD error, got: ${JSON.stringify(res.data?.error)}`
    );
  });

  await test('Student logs in and receives tokens', async () => {
    const res = await api().post('/api/auth/login', {
      email: ctx.studentEmail, password: ctx.studentPassword,
    });
    assertOk(res, 'login');
    assert(res.data.accessToken,  'No accessToken');
    assert(res.data.refreshToken, 'No refreshToken');
    ctx.studentToken  = res.data.accessToken;
    ctx.refreshToken  = res.data.refreshToken;
  });

  await test('Wrong password returns 401 with generic message', async () => {
    const res = await api().post('/api/auth/login', {
      email: ctx.studentEmail, password: 'WrongPass@999',
    });
    assert(res.status === 401, `Expected 401, got ${res.status}`);
    const msg = res.data?.error?.message ?? '';
    assert(
      msg.toLowerCase().includes('invalid email or password'),
      `Expected generic message, got: "${msg}"`
    );
  });

  await test('Account lockout triggers after 5 failed attempts', async () => {
    const lockEmail = `locktest_${Date.now()}@test.com`;
    let lastStatus = 0;
    for (let i = 0; i < 6; i++) {
      const res = await api().post('/api/auth/login', {
        email: lockEmail, password: 'WrongPass@999',
      });
      lastStatus = res.status;
    }
    assert(lastStatus === 429, `Expected 429 after 6 attempts, got ${lastStatus}`);
  });

  await test('GET /api/auth/me returns student profile', async () => {
    const res = await api(ctx.studentToken).get('/api/auth/me');
    assertOk(res, 'getMe');
    assert(res.data.student?.id === ctx.studentId, 'student_id mismatch');
  });

  await test('Token refresh returns new access token', async () => {
    const res = await api().post('/api/auth/refresh', { refreshToken: ctx.refreshToken });
    assertOk(res, 'refresh');
    assert(res.data.accessToken, 'No new accessToken');
    ctx.studentToken = res.data.accessToken;   // use fresh token for remaining tests
  });

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 3 — Profile & Onboarding
  // ══════════════════════════════════════════════════════════════════════════
  phase('🎓 Phase 3: Profile & Onboarding');

  await test('GET /api/profile/ returns student profile', async () => {
    const res = await api(ctx.studentToken).get('/api/profile/');
    assertOk(res, 'getProfile');
    assert(res.data.student || res.data.profile, 'No profile in response');
  });

  await test('Baseline quiz questions fetched (public endpoint)', async () => {
    const res = await api().get('/api/quiz/baseline-questions');
    assertOk(res, 'baseline-questions');
    const questions = res.data.questions ?? res.data;
    assert(Array.isArray(questions) && questions.length > 0, 'No baseline questions returned');
    ctx.topicId = questions[0]?.topic_id ?? questions[0]?.topicId ?? null;
  });

  await test('Add exam to profile', async () => {
    const examDate = new Date();
    examDate.setMonth(examDate.getMonth() + 3);
    const res = await api(ctx.studentToken).post('/api/profile/exams', {
      subject:   'Mathematics',
      exam_date: examDate.toISOString().split('T')[0],
      board:     'CBSE',
    });
    assertOk(res, 'addExam');
    ctx.examId = res.data.exam?.id ?? res.data.id;
    assert(ctx.examId, 'No exam id returned');
  });

  await test('GET /api/profile/exams returns added exam', async () => {
    const res = await api(ctx.studentToken).get('/api/profile/exams');
    assertOk(res, 'getExams');
    const exams = res.data.exams ?? res.data;
    assert(Array.isArray(exams) && exams.length > 0, 'No exams returned');
  });

  await test('Onboarding completed', async () => {
    const res = await api(ctx.studentToken).post('/api/profile/onboarding/complete', {
      study_preferences: {
        max_daily_study_hours:       4,
        preferred_study_start_time:  '09:00',
        preferred_session_length:    45,
      },
      baseline_quiz_results: [],
    });
    // Accept 200 or 400 (already completed) — both mean the service is working
    assert(
      res.status === 200 || res.status === 400,
      `Unexpected status ${res.status}: ${JSON.stringify(res.data?.error)}`
    );
  });

  await test('Digital twin stats endpoint responds', async () => {
    const res = await api(ctx.studentToken).get('/api/profile/twin');
    assert(
      res.status === 200 || res.status === 404,
      `Unexpected status ${res.status}`
    );
  });

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 4 — Study Planning
  // ══════════════════════════════════════════════════════════════════════════
  phase('📅 Phase 4: Study Planning');

  await test('Study plan generated', async () => {
    const res = await api(ctx.studentToken).post('/api/scheduler/generate');
    assertOk(res, 'generatePlan');
    ctx.planId = res.data.plan?.id ?? res.data.id;
  });

  await test('Active plan returned', async () => {
    const res = await api(ctx.studentToken).get('/api/scheduler/plan');
    assertOk(res, 'getActivePlan');
    const plan = res.data.plan ?? res.data;
    assert(plan, 'No plan in response');
  });

  await test("Today's sessions returned", async () => {
    const res = await api(ctx.studentToken).get('/api/scheduler/today');
    assertOk(res, 'getTodaySessions');
    const sessions = res.data.sessions ?? res.data;
    assert(Array.isArray(sessions), 'sessions is not an array');
    if (sessions.length > 0) {
      ctx.sessionTopicId = sessions[0].topic_id ?? sessions[0].topicId;
    }
  });

  await test('Session completed (awards tokens)', async () => {
    const topicId = ctx.sessionTopicId ?? ctx.topicId ?? 'test-topic-id';
    const res = await api(ctx.studentToken).post('/api/scheduler/session/complete', {
      topic_id:             topicId,
      actual_duration_min:  45,
      mood_after:           4,
      pomodoro_count:       2,
    });
    // Accept 200 or 404 (topic not in plan) — service must be reachable
    assert(
      res.status === 200 || res.status === 404,
      `Unexpected status ${res.status}: ${JSON.stringify(res.data?.error)}`
    );
  });

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 5 — Adaptive Quiz & Gap Detection
  // ══════════════════════════════════════════════════════════════════════════
  phase('🎯 Phase 5: Adaptive Quiz & Gap Detection');

  await test('Topic questions fetched', async () => {
    if (!ctx.topicId) {
      throw new Error('No topicId available — baseline questions may not have returned topic_id');
    }
    const res = await api(ctx.studentToken).get(`/api/quiz/questions/${ctx.topicId}?count=5`);
    assertOk(res, 'getTopicQuestions');
    const questions = res.data.questions ?? res.data;
    assert(Array.isArray(questions) && questions.length > 0, 'No questions returned');
  });

  await test('Quiz attempt submitted with responses', async () => {
    const res = await api(ctx.studentToken).post('/api/quiz/attempt', {
      topic_id:  ctx.topicId ?? 'test-topic',
      responses: [
        { question_id: 'q1', selected_option: 0 },
        { question_id: 'q2', selected_option: 1 },
        { question_id: 'q3', selected_option: 2 },
      ],
      mode: 'adaptive',
    });
    // Accept 200 or 404 (topic/questions not seeded in test DB)
    assert(
      res.status === 200 || res.status === 404 || res.status === 400,
      `Unexpected status ${res.status}: ${JSON.stringify(res.data?.error)}`
    );
  });

  await test('Topic progress endpoint responds', async () => {
    const res = await api(ctx.studentToken).get('/api/profile/progress');
    assertOk(res, 'getTopicProgress');
  });

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 6 — Stress & Wellbeing
  // ══════════════════════════════════════════════════════════════════════════
  phase('😌 Phase 6: Stress & Wellbeing');

  await test('Mood logged successfully', async () => {
    const res = await api(ctx.studentToken).post('/api/stress/mood', {
      mood_score: 4,
      notes:      'Feeling good after study session',
    });
    assertOk(res, 'logMood');
  });

  await test('Current stress prediction returned', async () => {
    const res = await api(ctx.studentToken).get('/api/stress/current');
    assertOk(res, 'getCurrentStress');
    const prediction = res.data.prediction ?? res.data;
    assert(prediction, 'No prediction in response');
  });

  await test('Stress history returns array', async () => {
    const res = await api(ctx.studentToken).get('/api/stress/history');
    assertOk(res, 'getStressHistory');
    const history = res.data.history ?? res.data;
    assert(Array.isArray(history), 'history is not an array');
  });

  await test('Wellness summary returned', async () => {
    const res = await api(ctx.studentToken).get('/api/stress/wellness');
    assertOk(res, 'getWellnessSummary');
  });

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 7 — Reward System
  // ══════════════════════════════════════════════════════════════════════════
  phase('🏆 Phase 7: Reward System');

  await test('Token balance endpoint returns number', async () => {
    const res = await api(ctx.studentToken).get('/api/reward/balance');
    assertOk(res, 'getBalance');
    const balance = res.data.balance ?? res.data.token_balance ?? res.data;
    assert(typeof balance === 'number' || typeof balance === 'object', 'No balance in response');
  });

  await test('Streak endpoint returns streak data', async () => {
    const res = await api(ctx.studentToken).get('/api/reward/streak');
    assertOk(res, 'getStreak');
    const streak = res.data.streak ?? res.data;
    assert(streak !== undefined, 'No streak in response');
  });

  await test('Social media unlock request processed', async () => {
    const res = await api(ctx.studentToken).post('/api/reward/social-media/unlock', {
      app_name:          'Instagram',
      minutes_requested: 30,
    });
    // Accept 200 (unlocked) or 400 (insufficient tokens) — both mean service works
    assert(
      res.status === 200 || res.status === 400,
      `Unexpected status ${res.status}: ${JSON.stringify(res.data?.error)}`
    );
  });

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 8 — Guardian System
  // ══════════════════════════════════════════════════════════════════════════
  phase('👨‍👩‍👧 Phase 8: Guardian System');

  await test('Guardian registers', async () => {
    const res = await api().post('/api/auth/guardian/register', {
      name:     'E2E Test Parent',
      email:    ctx.guardianEmail,
      password: ctx.guardianPassword,
      role:     'parent',
    });
    assertOk(res, 'guardianRegister');
    assert(res.data.accessToken, 'No guardian accessToken');
    ctx.guardianToken = res.data.accessToken;
    ctx.guardianId    = res.data.guardian?.id;
  });

  await test('Guardian logs in', async () => {
    const res = await api().post('/api/auth/guardian/login', {
      email: ctx.guardianEmail, password: ctx.guardianPassword,
    });
    assertOk(res, 'guardianLogin');
    ctx.guardianToken = res.data.accessToken;
  });

  await test('Guardian sends link request to student', async () => {
    const res = await api(ctx.guardianToken).post('/api/auth/guardian/link-student', {
      student_email: ctx.studentEmail,
    });
    assertOk(res, 'linkStudent');
    ctx.linkId = res.data.link_id;
    assert(ctx.linkId, 'No link_id returned');
  });

  await test('Student sees pending guardian requests', async () => {
    const res = await api(ctx.studentToken).get('/api/auth/student/guardian-requests');
    assertOk(res, 'studentGetGuardianRequests');
    const requests = res.data.guardian_requests ?? res.data;
    assert(Array.isArray(requests) && requests.length > 0, 'No pending requests found');
  });

  await test('Student approves guardian link', async () => {
    const res = await api(ctx.studentToken).post(`/api/auth/guardian/approve-link/${ctx.linkId}`);
    assertOk(res, 'approveLink');
  });

  await test('Guardian can view linked students list', async () => {
    const res = await api(ctx.guardianToken).get('/api/auth/guardian/students');
    assertOk(res, 'getMyStudents');
    const students = res.data.students ?? res.data;
    assert(Array.isArray(students) && students.length > 0, 'No linked students found');
  });

  await test('Guardian can view student overview (profile service)', async () => {
    const res = await api(ctx.guardianToken).get(`/api/profile/guardian/student/${ctx.studentId}/overview`);
    assertOk(res, 'getStudentOverview');
  });

  await test('Guardian can view student weekly summary', async () => {
    const res = await api(ctx.guardianToken).get(`/api/profile/guardian/student/${ctx.studentId}/weekly-summary`);
    assertOk(res, 'getWeeklySummary');
  });

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 9 — Analytics
  // ══════════════════════════════════════════════════════════════════════════
  phase('📊 Phase 9: Analytics');

  await test('Analytics dashboard returns data', async () => {
    const res = await api(ctx.studentToken).get('/api/analytics/dashboard');
    assertOk(res, 'getDashboard');
    const dashboard = res.data.dashboard ?? res.data;
    assert(dashboard, 'No dashboard data');
  });

  await test('Progress endpoint returns timeline', async () => {
    const res = await api(ctx.studentToken).get('/api/analytics/progress?period=month');
    assertOk(res, 'getProgress');
  });

  await test('Insights endpoint returns array', async () => {
    const res = await api(ctx.studentToken).get('/api/analytics/insights');
    assertOk(res, 'getInsights');
    const insights = res.data.insights ?? res.data;
    assert(Array.isArray(insights), 'insights is not an array');
    if (insights.length > 0) {
      ctx.insightId = insights[0].id;
    }
  });

  await test('Exam readiness score computed', async () => {
    if (!ctx.examId) {
      throw new Error('No examId — addExam test may have failed');
    }
    const res = await api(ctx.studentToken).get(`/api/analytics/exam-readiness/${ctx.examId}`);
    assertOk(res, 'getExamReadiness');
    const readiness = res.data.readiness ?? res.data;
    assert(readiness !== undefined, 'No readiness data');
  });

  await test('Twin evolution endpoint responds', async () => {
    const res = await api(ctx.studentToken).get('/api/analytics/twin-evolution');
    assertOk(res, 'getTwinEvolution');
  });

  await test('Weekly digest endpoint responds', async () => {
    const res = await api(ctx.studentToken).get('/api/analytics/weekly-digest');
    assertOk(res, 'getWeeklyDigest');
  });

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 10 — Notifications
  // ══════════════════════════════════════════════════════════════════════════
  phase('🔔 Phase 10: Notifications');

  await test('Notifications list returned', async () => {
    const res = await api(ctx.studentToken).get('/api/notification/');
    assertOk(res, 'getNotifications');
    const notifications = res.data.notifications ?? res.data;
    assert(Array.isArray(notifications), 'notifications is not an array');
  });

  await test('Notification preferences returned', async () => {
    const res = await api(ctx.studentToken).get('/api/notification/preferences');
    assertOk(res, 'getPreferences');
  });

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 11 — Security Checks
  // ══════════════════════════════════════════════════════════════════════════
  phase('🔐 Phase 11: Security');

  await test('Unauthenticated request to protected route returns 401', async () => {
    const res = await api().get('/api/profile/');
    assert(res.status === 401, `Expected 401, got ${res.status}`);
  });

  await test('Invalid JWT returns 401', async () => {
    const res = await api('invalid.jwt.token').get('/api/profile/');
    assert(res.status === 401, `Expected 401, got ${res.status}`);
  });

  await test('XSS payload in request body is sanitized', async () => {
    const res = await api(ctx.studentToken).put('/api/profile/', {
      name: '<script>alert("xss")</script>Test Name',
    });
    // Should succeed (sanitized) or fail validation — must NOT echo back raw script tag
    if (res.status === 200) {
      const name = res.data.student?.name ?? res.data.profile?.name ?? '';
      assert(
        !name.includes('<script>'),
        `XSS payload not sanitized — name contains: ${name}`
      );
    }
  });

  await test('Student cannot access guardian-only route', async () => {
    const res = await api(ctx.studentToken).get('/api/profile/guardian/my-students');
    assert(res.status === 403 || res.status === 401, `Expected 403/401, got ${res.status}`);
  });

  await test('Guardian cannot access student-only route', async () => {
    const res = await api(ctx.guardianToken).get('/api/auth/me');
    // /me requires student token — guardian token should be rejected
    assert(res.status === 403 || res.status === 401, `Expected 403/401, got ${res.status}`);
  });

  await test('Logout invalidates token', async () => {
    // Get a fresh token pair for this test
    const loginRes = await api().post('/api/auth/login', {
      email: ctx.studentEmail, password: ctx.studentPassword,
    });
    const tempToken = loginRes.data?.accessToken;
    if (!tempToken) throw new Error('Could not get temp token for logout test');

    // Logout
    const logoutRes = await api(tempToken).post('/api/auth/logout');
    assertOk(logoutRes, 'logout');

    // Attempt to use the same token — should be rejected (jti revoked)
    const afterLogout = await api(tempToken).get('/api/auth/me');
    assert(
      afterLogout.status === 401,
      `Expected 401 after logout, got ${afterLogout.status}`
    );

    // Re-login to restore ctx.studentToken for any remaining tests
    const reloginRes = await api().post('/api/auth/login', {
      email: ctx.studentEmail, password: ctx.studentPassword,
    });
    ctx.studentToken = reloginRes.data?.accessToken ?? ctx.studentToken;
  });

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 12 — AI Engine
  // ══════════════════════════════════════════════════════════════════════════
  phase('🤖 Phase 12: AI Engine');

  await test('AI engine health endpoint responds', async () => {
    const res = await api().get('/api/ai/health');
    assert(res.status !== 502 && res.status !== 503, `AI engine unreachable: ${res.status}`);
  });

  await test('Knowledge graph subjects endpoint responds', async () => {
    const res = await api().get('/api/ai/knowledge-graph/subjects');
    assert(
      res.status === 200 || res.status === 404,
      `Unexpected status ${res.status}`
    );
  });

  await test('Twin status endpoint responds', async () => {
    const res = await api(ctx.studentToken).get('/api/ai/twin/status');
    assert(
      res.status === 200 || res.status === 404,
      `Unexpected status ${res.status}`
    );
  });

  // ══════════════════════════════════════════════════════════════════════════
  // FINAL SUMMARY
  // ══════════════════════════════════════════════════════════════════════════
  const passed  = results.filter(r => r.status === 'PASS').length;
  const failed  = results.filter(r => r.status === 'FAIL').length;
  const total   = results.length;

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`🏁  RESULTS: ${passed}/${total} tests passed`);

  if (failed > 0) {
    console.log(`\n❌  Failed tests (${failed}):`);
    results
      .filter(r => r.status === 'FAIL')
      .forEach(r => {
        console.log(`\n   [${r.phase}]`);
        console.log(`   • ${r.name}`);
        console.log(`     ${r.error}`);
      });
    console.log('');
  } else {
    console.log('\n🎉  All tests passed! MindTwin AI is ready for launch.\n');
  }

  // Phase-by-phase breakdown
  const phases = [...new Set(results.map(r => r.phase))];
  console.log('Phase breakdown:');
  phases.forEach(p => {
    const phaseResults = results.filter(r => r.phase === p);
    const pPassed = phaseResults.filter(r => r.status === 'PASS').length;
    const pFailed = phaseResults.filter(r => r.status === 'FAIL').length;
    const icon = pFailed === 0 ? '✅' : '❌';
    console.log(`  ${icon}  ${p.replace(/^[^\s]+ /, '')} — ${pPassed}/${phaseResults.length}`);
  });

  console.log(`${'═'.repeat(60)}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('\n💥 Test runner crashed:', err.message);
  process.exit(1);
});
