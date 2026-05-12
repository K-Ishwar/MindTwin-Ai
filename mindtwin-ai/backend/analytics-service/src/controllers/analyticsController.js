const logger = require('../../../../shared/logger');\nconst axios = require('axios');
const db = require('../config/db');
const redisClient = require('../config/redis');

const AI_ENGINE_URL = process.env.AI_ENGINE_URL || 'http://ai-engine:8000';
const PROFILE_SERVICE_URL = process.env.PROFILE_SERVICE_URL || 'http://profile-service:3002';
const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:3007';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'internal-secret';

// â”€â”€ Helper: forward auth header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const authHeader = (req) => ({ Authorization: req.header('Authorization') });

// â”€â”€ GET /api/analytics/dashboard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Calls AI engine timeline, mastery, insights + profile exams in parallel.
// Caches the merged result in Redis for 1 hour.
const getDashboard = async (req, res, next) => {
  try {
    const { student_id } = req.user;
    const cacheKey = `analytics:dashboard:${student_id}`;

    // Check Redis cache first
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return res.json({ success: true, cached: true, ...JSON.parse(cached) });
    }

    // Fire all four requests in parallel
    const [timelineRes, masteryRes, insightsRes, examsRes] = await Promise.allSettled([
      axios.get(`${AI_ENGINE_URL}/api/ai/analytics/timeline/${student_id}?days=30`, { headers: authHeader(req) }),
      axios.get(`${AI_ENGINE_URL}/api/ai/analytics/mastery/${student_id}`, { headers: authHeader(req) }),
      axios.get(`${AI_ENGINE_URL}/api/ai/analytics/insights/${student_id}`, { headers: authHeader(req) }),
      axios.get(`${PROFILE_SERVICE_URL}/api/profile/exams`, { headers: authHeader(req) }),
    ]);

    // Extract data gracefully â€” a failed upstream call returns null for that slice
    const timeline = timelineRes.status === 'fulfilled' ? timelineRes.value.data : null;
    const mastery  = masteryRes.status  === 'fulfilled' ? masteryRes.value.data  : null;
    const insights = insightsRes.status === 'fulfilled' ? insightsRes.value.data : null;
    const exams    = examsRes.status    === 'fulfilled' ? examsRes.value.data    : null;

    const payload = {
      student_id,
      timeline:  timeline  || { sessions: [], study_hours_by_day: [] },
      mastery:   mastery   || { subjects: [] },
      insights:  insights  || { insights: [] },
      exams:     exams?.exams || [],
      generated_at: new Date().toISOString(),
    };

    // Cache for 1 hour (3600 seconds)
    await redisClient.set(cacheKey, JSON.stringify(payload), { EX: 3600 });

    res.json({ success: true, cached: false, ...payload });
  } catch (err) {
    next(err);
  }
};

// â”€â”€ GET /api/analytics/exam-readiness/:examId â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const getExamReadiness = async (req, res, next) => {
  try {
    const { student_id } = req.user;
    const { examId } = req.params;

    // Fetch exam details from DB
    const examResult = await db.query(
      `SELECT id, subject, exam_date, board FROM exams WHERE id = $1 AND student_id = $2`,
      [examId, student_id]
    );

    if (examResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Exam not found' });
    }

    const exam = examResult.rows[0];

    // Call AI engine for readiness score
    let readiness = null;
    try {
      const aiRes = await axios.get(
        `${AI_ENGINE_URL}/api/ai/analytics/exam-readiness/${student_id}/${examId}`,
        { headers: authHeader(req) }
      );
      readiness = aiRes.data;
    } catch (aiErr) {
      logger.warn('AI engine exam-readiness unavailable:', aiErr.message);
    }

    res.json({
      success: true,
      exam,
      readiness: readiness || {
        readiness_score: null,
        predicted_grade: null,
        weak_topics: [],
        recommended_actions: [],
        message: 'Readiness data not yet available',
      },
    });
  } catch (err) {
    next(err);
  }
};

// â”€â”€ GET /api/analytics/progress â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Query params: ?subject=Math&period=month
const getProgress = async (req, res, next) => {
  try {
    const { student_id } = req.user;
    const { subject, period = 'month' } = req.query;

    // Map period to days
    const periodDays = { week: 7, month: 30, quarter: 90, year: 365 }[period] || 30;

    // Fetch from AI engine and DB in parallel
    const [masteryRes, timelineRes, dbProgressRes] = await Promise.allSettled([
      axios.get(`${AI_ENGINE_URL}/api/ai/analytics/mastery/${student_id}`, { headers: authHeader(req) }),
      axios.get(`${AI_ENGINE_URL}/api/ai/analytics/timeline/${student_id}?days=${periodDays}`, { headers: authHeader(req) }),
      db.query(
        `SELECT
           t.subject,
           COUNT(DISTINCT t.id)                                                AS total_topics,
           COUNT(DISTINCT CASE WHEN ss.completed = true THEN ss.topic_id END)  AS completed_topics,
           ROUND(
             COUNT(DISTINCT CASE WHEN ss.completed = true THEN ss.topic_id END) * 100.0
             / NULLIF(COUNT(DISTINCT t.id), 0), 2
           )                                                                    AS completion_percent,
           ROUND(AVG(qa.score_percent)::numeric, 2)                             AS avg_quiz_score,
           COALESCE(SUM(ss.duration_min), 0)                                    AS total_study_mins
         FROM topics t
         LEFT JOIN study_sessions ss ON ss.topic_id = t.id
           AND ss.student_id = $1
           AND ss.created_at >= NOW() - ($2 || ' days')::INTERVAL
         LEFT JOIN quiz_attempts qa ON qa.topic_id = t.id
           AND qa.student_id = $1
           AND qa.created_at >= NOW() - ($2 || ' days')::INTERVAL
         WHERE ($3::text IS NULL OR t.subject ILIKE $3)
         GROUP BY t.subject
         ORDER BY t.subject`,
        [student_id, periodDays, subject || null]
      ),
    ]);

    const mastery  = masteryRes.status  === 'fulfilled' ? masteryRes.value.data  : null;
    const timeline = timelineRes.status === 'fulfilled' ? timelineRes.value.data : null;
    const dbRows   = dbProgressRes.status === 'fulfilled' ? dbProgressRes.value.rows : [];

    res.json({
      success: true,
      period,
      period_days: periodDays,
      subject_filter: subject || null,
      progress_by_subject: dbRows,
      mastery:  mastery  || { subjects: [] },
      timeline: timeline || { sessions: [], study_hours_by_day: [] },
    });
  } catch (err) {
    next(err);
  }
};

// â”€â”€ GET /api/analytics/insights â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const getInsights = async (req, res, next) => {
  try {
    const { student_id } = req.user;

    // Fetch insights from AI engine
    let aiInsights = [];
    try {
      const aiRes = await axios.get(
        `${AI_ENGINE_URL}/api/ai/analytics/insights/${student_id}`,
        { headers: authHeader(req) }
      );
      aiInsights = aiRes.data?.insights || [];
    } catch (aiErr) {
      logger.warn('AI engine insights unavailable:', aiErr.message);
    }

    // Fetch dismissed insight IDs for this student
    const dismissedResult = await db.query(
      `SELECT insight_id FROM insight_dismissals WHERE student_id = $1`,
      [student_id]
    );
    const dismissedIds = new Set(dismissedResult.rows.map((r) => r.insight_id));

    // Annotate each insight with dismissed flag
    const annotated = aiInsights.map((insight) => ({
      ...insight,
      dismissed: dismissedIds.has(insight.id),
    }));

    res.json({ success: true, insights: annotated });
  } catch (err) {
    next(err);
  }
};

// â”€â”€ POST /api/analytics/insights/:insightId/dismiss â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const dismissInsight = async (req, res, next) => {
  try {
    const { student_id } = req.user;
    const { insightId } = req.params;

    await db.query(
      `INSERT INTO insight_dismissals (student_id, insight_id)
       VALUES ($1, $2)
       ON CONFLICT (student_id, insight_id) DO NOTHING`,
      [student_id, insightId]
    );

    res.json({ success: true, message: 'Insight dismissed' });
  } catch (err) {
    next(err);
  }
};

// â”€â”€ GET /api/analytics/weekly-digest â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const getWeeklyDigest = async (req, res, next) => {
  try {
    const { student_id } = req.user;

    let digest = null;
    try {
      const aiRes = await axios.get(
        `${AI_ENGINE_URL}/api/ai/analytics/weekly-digest/${student_id}`,
        { headers: authHeader(req) }
      );
      digest = aiRes.data;
    } catch (aiErr) {
      logger.warn('AI engine weekly-digest unavailable:', aiErr.message);
    }

    res.json({
      success: true,
      digest: digest || {
        week_summary: null,
        top_subjects: [],
        study_streak: 0,
        goals_met: [],
        message: 'Weekly digest not yet available',
      },
    });
  } catch (err) {
    next(err);
  }
};

// â”€â”€ GET /api/analytics/twin-evolution â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const getTwinEvolution = async (req, res, next) => {
  try {
    const { student_id } = req.user;

    // Fetch current twin state from DB
    const twinResult = await db.query(
      `SELECT twin_vector, behavioral_features, peer_cluster_id, last_updated
       FROM digital_twins WHERE student_id = $1`,
      [student_id]
    );

    if (twinResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Digital twin not found' });
    }

    const twin = twinResult.rows[0];

    // Fetch evolution history from AI engine
    let evolution = null;
    try {
      const aiRes = await axios.get(
        `${AI_ENGINE_URL}/api/ai/analytics/twin-evolution/${student_id}`,
        { headers: authHeader(req) }
      );
      evolution = aiRes.data;
    } catch (aiErr) {
      logger.warn('AI engine twin-evolution unavailable:', aiErr.message);
    }

    res.json({
      success: true,
      current_twin: {
        twin_vector:         twin.twin_vector,
        behavioral_features: twin.behavioral_features,
        peer_cluster_id:     twin.peer_cluster_id,
        last_updated:        twin.last_updated,
      },
      evolution: evolution || {
        snapshots: [],
        dimension_trends: [],
        message: 'Evolution history not yet available',
      },
    });
  } catch (err) {
    next(err);
  }
};

// â”€â”€ Internal: send weekly digest notifications (called by cron) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// POST /api/analytics/internal/weekly-digest-notify
const sendWeeklyDigestNotifications = async (req, res, next) => {
  try {
    const apiKey = req.header('x-api-key');
    if (apiKey !== INTERNAL_API_KEY) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    // Get all active students
    const studentsResult = await db.query(
      `SELECT DISTINCT s.id::text AS student_id
       FROM students s
       WHERE s.onboarding_completed = true
         AND EXISTS (
           SELECT 1 FROM study_sessions ss
           WHERE ss.student_id = s.id
             AND ss.created_at >= NOW() - INTERVAL '7 days'
         )`
    );

    const studentIds = studentsResult.rows.map((r) => r.student_id);
    let sent = 0;
    let failed = 0;

    for (const student_id of studentIds) {
      try {
        // Fetch digest from AI engine
        let digestSummary = 'Your weekly study digest is ready. Check your progress!';
        try {
          const aiRes = await axios.get(
            `${AI_ENGINE_URL}/api/ai/analytics/weekly-digest/${student_id}`
          );
          const d = aiRes.data;
          if (d?.week_summary) {
            digestSummary = d.week_summary;
          }
        } catch (_) { /* use default message */ }

        // Send notification
        await axios.post(
          `${NOTIFICATION_SERVICE_URL}/api/notifications/send`,
          {
            student_id,
            type: 'weekly_digest',
            title: 'Your Weekly Study Digest ðŸ“Š',
            body: digestSummary,
            data: { source: 'analytics_cron' },
          },
          { headers: { 'x-api-key': INTERNAL_API_KEY } }
        );
        sent++;
      } catch (err) {
        failed++;
        logger.warn(`Weekly digest notification failed for ${student_id}:`, err.message);
      }
    }

    res.json({ success: true, sent, failed, total: studentIds.length });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getDashboard,
  getExamReadiness,
  getProgress,
  getInsights,
  dismissInsight,
  getWeeklyDigest,
  getTwinEvolution,
  sendWeeklyDigestNotifications,
};
