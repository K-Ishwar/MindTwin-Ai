const db = require('../config/db');
const axios = require('axios');
const { sendNotification } = require('../../../shared/utils/notifyClient');

const AI_ENGINE_URL = process.env.AI_ENGINE_URL || 'http://ai-engine:8000';

// ── Fallback topics when DB is empty ──────────────────────────────────────────
const FALLBACK_TOPICS = [
  { id: 'fallback-1', topic_name: 'Algebra & Equations', subject: 'Mathematics', difficulty_level: 3 },
  { id: 'fallback-2', topic_name: 'Organic Chemistry Basics', subject: 'Chemistry', difficulty_level: 3 },
  { id: 'fallback-3', topic_name: "Newton's Laws of Motion", subject: 'Physics', difficulty_level: 3 },
  { id: 'fallback-4', topic_name: 'Cell Biology & Mitosis', subject: 'Biology', difficulty_level: 2 },
  { id: 'fallback-5', topic_name: 'French Revolution', subject: 'History', difficulty_level: 2 },
];

// ── Mock question bank keyed by topic keywords ────────────────────────────────
const generateMockQuestions = (topicName, topicId) => {
  const lower = (topicName || '').toLowerCase();

  const banks = {
    math: [
      { question_text: 'What is the solution to x² - 5x + 6 = 0?', options: ['x=2,3', 'x=1,6', 'x=-2,-3', 'x=0,5'], answer: 'A', difficulty: 3 },
      { question_text: 'Simplify: (a+b)² - (a-b)²', options: ['4ab', '2ab', 'a²+b²', '0'], answer: 'A', difficulty: 2 },
      { question_text: 'If f(x) = 2x+3, find f(4)', options: ['11', '9', '10', '8'], answer: 'A', difficulty: 1 },
      { question_text: 'Solve: 3x + 7 = 22', options: ['x=5', 'x=4', 'x=6', 'x=3'], answer: 'A', difficulty: 1 },
      { question_text: 'Which is NOT a real number?', options: ['√-1', '√2', '-5', '0'], answer: 'A', difficulty: 2 },
    ],
    chemistry: [
      { question_text: 'What is the functional group of an alcohol?', options: ['-OH', '-COOH', '-CHO', '-NH₂'], answer: 'A', difficulty: 2 },
      { question_text: 'Ethanol undergoes what type of reaction with Na?', options: ['Substitution', 'Addition', 'Elimination', 'Redox'], answer: 'A', difficulty: 3 },
      { question_text: 'Which is the simplest alkane?', options: ['Methane', 'Ethane', 'Propane', 'Butane'], answer: 'A', difficulty: 1 },
      { question_text: 'The IUPAC name of CH₃OH is:', options: ['Methanol', 'Ethanol', 'Propanol', 'Butanol'], answer: 'A', difficulty: 2 },
      { question_text: 'Benzene has how many carbon atoms?', options: ['6', '4', '8', '3'], answer: 'A', difficulty: 1 },
    ],
    physics: [
      { question_text: "Newton's 2nd law relates force to:", options: ['Mass × Acceleration', 'Mass × Velocity', 'Weight × Time', 'Speed × Distance'], answer: 'A', difficulty: 2 },
      { question_text: 'A body at rest stays at rest unless acted on by:', options: ['External force', 'Gravity only', 'Friction', 'Internal energy'], answer: 'A', difficulty: 1 },
      { question_text: 'Unit of force in SI system is:', options: ['Newton', 'Pascal', 'Joule', 'Watt'], answer: 'A', difficulty: 1 },
      { question_text: 'If F=ma, what is the acceleration when F=10N, m=2kg?', options: ['5 m/s²', '20 m/s²', '0.2 m/s²', '10 m/s²'], answer: 'A', difficulty: 2 },
      { question_text: 'Action and reaction forces act on:', options: ['Different bodies', 'Same body', 'Same point', 'Parallel lines'], answer: 'A', difficulty: 3 },
    ],
    biology: [
      { question_text: 'Which organelle is the powerhouse of the cell?', options: ['Mitochondria', 'Nucleus', 'Ribosome', 'Golgi body'], answer: 'A', difficulty: 1 },
      { question_text: 'DNA replication happens in which phase?', options: ['S phase', 'G1 phase', 'M phase', 'G2 phase'], answer: 'A', difficulty: 3 },
      { question_text: 'Cell wall in plants is made of:', options: ['Cellulose', 'Chitin', 'Peptidoglycan', 'Protein'], answer: 'A', difficulty: 2 },
      { question_text: 'Mitosis produces how many daughter cells?', options: ['2', '4', '8', '1'], answer: 'A', difficulty: 2 },
      { question_text: 'Which is NOT a stage of mitosis?', options: ['Interphase', 'Prophase', 'Metaphase', 'Telophase'], answer: 'A', difficulty: 3 },
    ],
  };

  let bank = banks.math; // default
  if (lower.includes('chem')) bank = banks.chemistry;
  else if (lower.includes('phys') || lower.includes('newton') || lower.includes('motion')) bank = banks.physics;
  else if (lower.includes('bio') || lower.includes('cell') || lower.includes('mito')) bank = banks.biology;
  else if (lower.includes('math') || lower.includes('algebra') || lower.includes('calculus') || lower.includes('equation')) bank = banks.math;

  return bank.map((q, i) => ({
    id: `mock-${topicId}-${i + 1}`,
    question_text: q.question_text,
    options: { A: q.options[0], B: q.options[1], C: q.options[2], D: q.options[3] },
    correct_answer: q.answer,
    difficulty: q.difficulty,
    topic_id: topicId,
  }));
};

// ── GET /api/quiz/baseline-questions ─────────────────────────────────────────
const getBaselineQuestions = async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT id, topic_name, subject, difficulty_level
       FROM topics
       WHERE difficulty_level BETWEEN 2 AND 4
       ORDER BY RANDOM()
       LIMIT 5`
    );

    const topics = result.rows.length >= 5 ? result.rows : FALLBACK_TOPICS;
    res.json({ success: true, topics });
  } catch (err) {
    // DB might not be available — return fallbacks
    res.json({ success: true, topics: FALLBACK_TOPICS });
  }
};

// ── GET /api/quiz/questions/:topicId ─────────────────────────────────────────
const getTopicQuestions = async (req, res, next) => {
  try {
    const { topicId } = req.params;
    const count = Math.min(parseInt(req.query.count) || 5, 10);

    // Try to get topic name from DB
    let topicName = topicId;
    try {
      const topicResult = await db.query('SELECT topic_name FROM topics WHERE id = $1', [topicId]);
      if (topicResult.rows.length > 0) topicName = topicResult.rows[0].topic_name;
    } catch (_) { /* use topicId as label */ }

    const allQuestions = generateMockQuestions(topicName, topicId);
    const questions = allQuestions.slice(0, count).map(({ correct_answer, ...q }) => q); // strip answer from response

    res.json({ success: true, questions, topic_id: topicId, mode: req.query.mode || 'practice' });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/quiz/attempt ────────────────────────────────────────────────────
const submitAttempt = async (req, res, next) => {
  try {
    const { student_id } = req.user;
    const { topic_id, responses = [], mode = 'practice' } = req.body;

    if (!topic_id || responses.length === 0) {
      return res.status(400).json({ success: false, error: 'topic_id and responses are required' });
    }

    // Generate ground-truth answers for scoring
    let topicName = topic_id;
    try {
      const tr = await db.query('SELECT topic_name FROM topics WHERE id = $1', [topic_id]);
      if (tr.rows.length > 0) topicName = tr.rows[0].topic_name;
    } catch (_) {}

    const mockQuestions = generateMockQuestions(topicName, topic_id);
    const answerMap = Object.fromEntries(mockQuestions.map((q) => [q.id, q.correct_answer]));

    // Score calculation
    let correct = 0;
    responses.forEach((r) => {
      if (answerMap[r.question_id] && answerMap[r.question_id] === r.selected_option) {
        correct++;
      }
    });

    // For mock-based fallback: if no matching IDs, treat all as correct at 60% (middle ground)
    const total = responses.length;
    const score_percent = total > 0 ? parseFloat(((correct / total) * 100).toFixed(2)) : 60.0;
    const theta_estimate = parseFloat(((score_percent / 100) * 4 - 2).toFixed(4));
    const gap_detected = score_percent < 60;

    // Feedback message
    let feedback_message;
    if (score_percent < 40) feedback_message = 'This topic needs revision — let\'s schedule more time for it.';
    else if (score_percent <= 70) feedback_message = 'Getting there! A bit more practice will sharpen this.';
    else feedback_message = 'Great work! You\'ve got a solid grip on this topic.';

    // Insert into quiz_attempts
    const insertResult = await db.query(
      `INSERT INTO quiz_attempts
         (student_id, topic_id, theta_estimate, score_percent, questions_attempted, gap_detected)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [student_id, topic_id, theta_estimate, score_percent, total, gap_detected]
    );
    const attempt_id = insertResult.rows[0].id;

    if (gap_detected) {
      // Notify student about the gap
      sendNotification('student', student_id, 'gap_detected', { topic_name: topicName }, { topic_id });

      try {
        const token = req.header('Authorization').split(' ')[1];
        await axios.post(`${process.env.SCHEDULER_SERVICE_URL || 'http://scheduler-service:3005'}/api/scheduler/replan`, {
          reason: 'gap_detected',
          gap_topic_ids: [topic_id]
        }, { headers: { Authorization: `Bearer ${token}` } });
      } catch (err) {
        console.warn('Replan failed (non-critical):', err.message);
      }
    }

    // Fire-and-forget: update digital twin
    axios.post(`${AI_ENGINE_URL}/api/ai/twin/update`, {
      student_id,
      session_data: { duration_min: total * 2, topic_id, mood_after: null, completed: true },
      quiz_data: { topic_id, score_percent },
    }).catch((err) => console.warn('Twin update failed (non-critical):', err.message));

    res.json({
      success: true,
      attempt_id,
      score_percent,
      theta_estimate,
      gap_detected,
      feedback_message,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getBaselineQuestions, getTopicQuestions, submitAttempt };
