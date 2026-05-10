import api from './axios';

export const quizApi = {
  // ── Topic list with mastery data ──────────────────────────────────────────
  getTopics: () =>
    api.get('/api/quiz/topics').then(r => r.data).catch(() => ({
      topics: generateMockTopics(),
    })),

  // ── Start an adaptive quiz session ────────────────────────────────────────
  startSession: (topicId) =>
    api.post('/api/quiz/session/start', { topic_id: topicId }).then(r => r.data).catch(() => ({
      session_id: `mock-session-${Date.now()}`,
      topic_id: topicId,
    })),

  // ── Fetch next question for adaptive session ──────────────────────────────
  getNextQuestion: (sessionId) =>
    api.get(`/api/quiz/session/${sessionId}/next`).then(r => r.data),

  // ── Fetch questions for a topic (non-adaptive fallback) ───────────────────
  getTopicQuestions: (topicId, count = 5) =>
    api.get(`/api/quiz/questions/${topicId}`, { params: { count } }).then(r => r.data),

  // ── Submit a single answer within a session ───────────────────────────────
  submitAnswer: (sessionId, payload) =>
    api.post(`/api/quiz/session/${sessionId}/answer`, payload).then(r => r.data),

  // ── Submit full attempt (non-session mode) ────────────────────────────────
  submitAttempt: (payload) =>
    api.post('/api/quiz/attempt', payload).then(r => r.data),

  // ── Finalize session and get results ─────────────────────────────────────
  finalizeSession: (sessionId) =>
    api.post(`/api/quiz/session/${sessionId}/finalize`).then(r => r.data),

  // ── Gap report ────────────────────────────────────────────────────────────
  getGapReport: () =>
    api.get('/api/quiz/gaps').then(r => r.data).catch(() => ({
      gaps: generateMockGaps(),
      overall_mastery: 0.62,
    })),

  // ── Replan study schedule based on gaps ──────────────────────────────────
  replan: (gaps) =>
    api.post('/api/scheduler/replan', { gaps }).then(r => r.data),
};

// ── Mock data generators (used when backend is unavailable) ──────────────────

function generateMockTopics() {
  return [
    // Mathematics
    { id: 'math-1', topic_name: 'Algebra & Equations', subject: 'Mathematics', theta: 0.7, gap_detected: false, last_assessed: '2026-05-08', prereq_gaps: [] },
    { id: 'math-2', topic_name: 'Coordinate Geometry', subject: 'Mathematics', theta: -0.8, gap_detected: true, last_assessed: '2026-05-06', prereq_gaps: ['Algebra & Equations'] },
    { id: 'math-3', topic_name: 'Trigonometry', subject: 'Mathematics', theta: 0.2, gap_detected: false, last_assessed: '2026-05-07', prereq_gaps: [] },
    { id: 'math-4', topic_name: 'Calculus – Derivatives', subject: 'Mathematics', theta: null, gap_detected: false, last_assessed: null, prereq_gaps: [] },
    { id: 'math-5', topic_name: 'Probability & Statistics', subject: 'Mathematics', theta: -0.3, gap_detected: false, last_assessed: '2026-05-05', prereq_gaps: [] },

    // Physics
    { id: 'phys-1', topic_name: "Newton's Laws of Motion", subject: 'Physics', theta: 0.6, gap_detected: false, last_assessed: '2026-05-08', prereq_gaps: [] },
    { id: 'phys-2', topic_name: 'Work, Energy & Power', subject: 'Physics', theta: -1.1, gap_detected: true, last_assessed: '2026-05-04', prereq_gaps: ["Newton's Laws"] },
    { id: 'phys-3', topic_name: 'Electrostatics', subject: 'Physics', theta: null, gap_detected: false, last_assessed: null, prereq_gaps: [] },
    { id: 'phys-4', topic_name: 'Optics & Light', subject: 'Physics', theta: 0.4, gap_detected: false, last_assessed: '2026-05-07', prereq_gaps: [] },

    // Chemistry
    { id: 'chem-1', topic_name: 'Organic Chemistry Basics', subject: 'Chemistry', theta: -0.6, gap_detected: true, last_assessed: '2026-05-06', prereq_gaps: [] },
    { id: 'chem-2', topic_name: 'Periodic Table & Trends', subject: 'Chemistry', theta: 0.9, gap_detected: false, last_assessed: '2026-05-08', prereq_gaps: [] },
    { id: 'chem-3', topic_name: 'Chemical Bonding', subject: 'Chemistry', theta: 0.1, gap_detected: false, last_assessed: '2026-05-07', prereq_gaps: [] },
    { id: 'chem-4', topic_name: 'Acids, Bases & Salts', subject: 'Chemistry', theta: null, gap_detected: false, last_assessed: null, prereq_gaps: [] },
  ];
}

function generateMockGaps() {
  return [
    { topic_id: 'math-2', topic_name: 'Coordinate Geometry', subject: 'Mathematics', theta: -0.8, gap_detected: true, revision_hours: 3, prereq_gaps: ['Algebra & Equations'] },
    { topic_id: 'phys-2', topic_name: 'Work, Energy & Power', subject: 'Physics', theta: -1.1, gap_detected: true, revision_hours: 4, prereq_gaps: ["Newton's Laws"] },
    { topic_id: 'chem-1', topic_name: 'Organic Chemistry Basics', subject: 'Chemistry', theta: -0.6, gap_detected: true, revision_hours: 2, prereq_gaps: [] },
  ];
}

// ── Explanation generator (mock — used when API doesn't return one) ───────────
export function getMockExplanation(questionText, correctOption) {
  const explanations = {
    A: 'The correct answer is A. This follows directly from the fundamental definition and core principles of this topic.',
    B: 'Option B would be correct if we misapplied the formula. The correct answer is A.',
    C: 'While C seems plausible, it confuses two related but distinct concepts. The answer is A.',
    D: 'D is a common distractor. Remember the key rule: the answer is A.',
  };
  return `✅ Correct answer: ${correctOption}. ${explanations[correctOption] || 'Review your notes on this concept.'}`;
}
