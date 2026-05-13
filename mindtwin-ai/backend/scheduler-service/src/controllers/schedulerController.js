'use strict';

const logger = require('../../../../shared/logger');
const axios = require('axios');
const db    = require('../config/db');
const svc   = require('../utils/serviceClients');
const redis = require('../config/redis');
const { createCacheService, CACHE_KEYS, CACHE_TTL } = require('../../../../shared/cache/cacheService');
const { sendNotification } = require('../../../shared/utils/notifyClient');

const PROFILE_SERVICE_URL = process.env.PROFILE_SERVICE_URL || 'http://profile-service:3002';
const AI_ENGINE_URL       = process.env.AI_ENGINE_URL       || 'http://ai-engine:8000';

const cache = createCacheService(redis);

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const authAxios = (token) =>
  axios.create({ headers: { Authorization: `Bearer ${token}` } });

const today = () => new Date().toISOString().split('T')[0];

/**
 * Fetch the active study plan and enrich slot topic_names from the DB.
 */
async function getEnrichedActivePlan(student_id) {
  const planResult = await db.query(
    `SELECT * FROM study_plans WHERE student_id = $1 AND is_active = TRUE ORDER BY generated_at DESC LIMIT 1`,
    [student_id]
  );
  if (planResult.rows.length === 0) return null;

  const plan = planResult.rows[0];

  // Collect all topic IDs in the plan
  const topicIds = new Set();
  (plan.plan_data.schedule || []).forEach((day) => {
    (day.slots || []).forEach((slot) => {
      if (slot.topic_id) topicIds.add(slot.topic_id);
    });
  });

  // Fetch topic details in one query
  let topicMap = {};
  if (topicIds.size > 0) {
    const idList = [...topicIds];
    const topicResult = await db.query(
      `SELECT id, topic_name, subject FROM topics WHERE id = ANY($1::uuid[])`,
      [idList]
    );
    topicResult.rows.forEach((t) => { topicMap[t.id] = t; });
  }

  // Enrich slots with topic details
  const enrichedSchedule = (plan.plan_data.schedule || []).map((day) => ({
    ...day,
    slots: (day.slots || []).map((slot) => ({
      ...slot,
      topic_name: topicMap[slot.topic_id]?.topic_name || slot.topic_name,
      subject: topicMap[slot.topic_id]?.subject || slot.subject,
    })),
  }));

  return { ...plan, plan_data: { ...plan.plan_data, schedule: enrichedSchedule } };
}

// â”€â”€ POST /api/scheduler/generate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const generatePlan = async (req, res, next) => {
  try {
    const { student_id } = req.user;
    const token = req.header('Authorization').split(' ')[1];
    const api = authAxios(token);

    // 1. Fetch profile + exams from profile-service
    const [profileRes, examsRes] = await Promise.all([
      api.get(`${PROFILE_SERVICE_URL}/api/profile/`),
      api.get(`${PROFILE_SERVICE_URL}/api/profile/exams`),
    ]);

    const profile = profileRes.data.profile;
    const exams = examsRes.data.exams || [];

    if (exams.length === 0) {
      return res.status(400).json({ success: false, error: 'No exams found. Please add exams before generating a schedule.' });
    }

    // 2. Fetch topics from DB filtered by board and grade_level
    const topicsResult = await db.query(
      `SELECT id, topic_name, subject, weightage_percent, estimated_study_hours,
              difficulty_level, prerequisite_topic_ids
       FROM topics
       WHERE board = $1 OR grade_level = $2
       ORDER BY subject, topic_name`,
      [profile.board, profile.grade_level]
    );

    // Fallback: if board/grade filtering returns empty, get all topics
    let topics = topicsResult.rows;
    if (topics.length === 0) {
      const fallbackResult = await db.query(
        `SELECT id, topic_name, subject, weightage_percent, estimated_study_hours,
                difficulty_level, prerequisite_topic_ids FROM topics LIMIT 50`
      );
      topics = fallbackResult.rows;
    }

    // 3. Fetch recent quiz gaps (last 30 days, gap_detected = true)
    const gapsResult = await db.query(
      `SELECT topic_id,
              1.0 - (score_percent / 100.0) AS gap_score
       FROM quiz_attempts
       WHERE student_id = $1
         AND gap_detected = TRUE
         AND completed_at > NOW() - INTERVAL '30 days'
       ORDER BY completed_at DESC`,
      [student_id]
    );
    const quiz_gaps = gapsResult.rows.map((r) => ({
      topic_id: r.topic_id,
      gap_score: parseFloat(r.gap_score),
    }));

    // 4. Prepare payload for AI engine
    const aiPayload = {
      student_id,
      exams: exams.map((e) => ({
        subject: e.subject,
        exam_date: e.exam_date.split('T')[0],
        topic_ids: [],
      })),
      student_profile: {
        max_daily_hours: profile.max_daily_study_hours || 5,
        preferred_start_time: profile.preferred_study_start_time
          ? String(profile.preferred_study_start_time).slice(0, 5)
          : '08:00',
        twin_vector: profile.digital_twin?.twin_vector || null,
        peer_cluster_id: profile.digital_twin?.peer_cluster_id || 2,
      },
      topic_details: topics.map((t) => ({
        id: t.id,
        topic_name: t.topic_name,
        subject: t.subject,
        weightage_percent: parseFloat(t.weightage_percent) || 5,
        estimated_study_hours: parseFloat(t.estimated_study_hours) || 2,
        difficulty_level: t.difficulty_level || 3,
        prerequisite_topic_ids: t.prerequisite_topic_ids || [],
      })),
      quiz_gaps,
      start_date: today(),
    };

    // 5. Call AI engine
    const aiRes = await axios.post(`${AI_ENGINE_URL}/api/ai/scheduler/generate`, aiPayload);
    const scheduleData = aiRes.data;

    // 6. Deactivate old plans
    await db.query(
      `UPDATE study_plans SET is_active = FALSE WHERE student_id = $1`,
      [student_id]
    );

    // 7. Store new plan
    const insertResult = await db.query(
      `INSERT INTO study_plans (student_id, plan_data, generation_reason)
       VALUES ($1, $2, $3) RETURNING id, generated_at`,
      [student_id, JSON.stringify(scheduleData), 'initial']
    );

    // Invalidate stale plan and today's sessions caches
    await cache.invalidateMany([
      CACHE_KEYS.ACTIVE_PLAN(student_id),
      CACHE_KEYS.TODAY_SESSIONS(student_id),
    ]);

    res.json({
      success: true,
      plan_id: insertResult.rows[0].id,
      generated_at: insertResult.rows[0].generated_at,
      ...scheduleData,
    });
  } catch (err) {
    next(err);
  }
};

// â”€â”€ GET /api/scheduler/plan â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const getActivePlan = async (req, res, next) => {
  try {
    const { student_id } = req.user;

    const result = await cache.getOrSet(
      CACHE_KEYS.ACTIVE_PLAN(student_id),
      async () => {
        const plan = await getEnrichedActivePlan(student_id);
        if (!plan) return null;

        const todayDate = today();
        const enrichedSchedule = (plan.plan_data.schedule || []).map((day) => ({
          ...day,
          is_today: day.date === todayDate,
        }));

        return {
          plan_id:           plan.id,
          generated_at:      plan.generated_at,
          generation_reason: plan.generation_reason,
          ...plan.plan_data,
          schedule: enrichedSchedule,
        };
      },
      CACHE_TTL.ACTIVE_PLAN
    );

    if (!result) {
      return res.status(404).json({ success: false, error: 'No active study plan found. Generate one first.' });
    }

    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

// â”€â”€ GET /api/scheduler/today â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const getTodaySessions = async (req, res, next) => {
  try {
    const { student_id } = req.user;
    const todayDate = today();

    const result = await cache.getOrSet(
      CACHE_KEYS.TODAY_SESSIONS(student_id),
      async () => {
        const plan = await getEnrichedActivePlan(student_id);
        if (!plan) return { date: todayDate, sessions: [] };

        const todayPlan = (plan.plan_data.schedule || []).find((d) => d.date === todayDate);
        if (!todayPlan) return { date: todayDate, sessions: [] };

        const completedResult = await db.query(
          `SELECT topic_id, skipped, skip_reason
           FROM study_sessions
           WHERE student_id = $1 AND DATE(started_at) = $2`,
          [student_id, todayDate]
        );
        const completedMap = {};
        completedResult.rows.forEach((r) => {
          completedMap[r.topic_id] = r.skipped ? 'skipped' : 'completed';
        });

        const sessions = (todayPlan.slots || []).map((slot) => ({
          slot_number:  slot.slot_number,
          topic_id:     slot.topic_id,
          topic_name:   slot.topic_name,
          subject:      slot.subject,
          duration_min: slot.duration_min,
          is_revision:  slot.is_revision,
          start_time:   slot.start_time,
          status: slot.topic_id
            ? completedMap[slot.topic_id] || 'pending'
            : 'free',
        }));

        return { date: todayDate, sessions };
      },
      CACHE_TTL.TODAY_SESSIONS
    );

    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

// â”€â”€ POST /api/scheduler/session/complete â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const completeSession = async (req, res, next) => {
  try {
    const { student_id } = req.user;
    const { topic_id, actual_duration_min = 90, mood_after, pomodoro_count = 1 } = req.body;

    if (!topic_id) {
      return res.status(400).json({ success: false, error: 'topic_id is required' });
    }

    // Insert into study_sessions
    await db.query(
      `INSERT INTO study_sessions
         (student_id, topic_id, actual_duration_min, completed, pomodoro_count, mood_after, started_at)
       VALUES ($1, $2, $3, TRUE, $4, $5, NOW())`,
      [student_id, topic_id, actual_duration_min, pomodoro_count, mood_after]
    );

    // Award tokens via serviceClients (retry-enabled, 5s timeout)
    let tokensEarned = 0;
    let newBalance = 0;
    try {
      const rewardRes = await svc.awardTokens(student_id, 'session_complete', { duration_min: actual_duration_min });
      tokensEarned = rewardRes.data.tokens_earned || 0;
      newBalance = rewardRes.data.new_balance || 0;
    } catch (e) {
      logger.warn('Reward service unavailable (non-critical):', e.message);
    }

    // Update digital twin (fire-and-forget, non-critical)
    svc.updateTwin(student_id, {
      duration_min: actual_duration_min,
      topic_id,
      mood_after: mood_after || null,
      completed: true,
      planned_duration_min: 90,
    }).catch((e) => logger.warn('Twin update failed (non-critical):', e.message));

    const message = tokensEarned > 0
      ? `Session complete! You earned ${tokensEarned} focus tokens.`
      : 'Session complete! Keep up the great work.';

    // Invalidate today's sessions cache so next GET reflects completion
    await cache.invalidate(CACHE_KEYS.TODAY_SESSIONS(student_id));

    res.json({ success: true, tokens_earned: tokensEarned, new_token_balance: newBalance, message });
  } catch (err) {
    next(err);
  }
};

// â”€â”€ POST /api/scheduler/session/skip â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const skipSession = async (req, res, next) => {
  try {
    const { student_id } = req.user;
    const { topic_id, skip_reason = 'no_reason' } = req.body;

    if (!topic_id) {
      return res.status(400).json({ success: false, error: 'topic_id is required' });
    }

    // Insert skipped session record
    await db.query(
      `INSERT INTO study_sessions
         (student_id, topic_id, duration_min, completed, skipped, skip_reason, started_at)
       VALUES ($1, $2, 0, FALSE, TRUE, $3, NOW())`,
      [student_id, topic_id, skip_reason]
    );

    // If tired/unwell â†’ notify stress-service via serviceClients (fire-and-forget)
    if (['tired', 'unwell'].includes(skip_reason)) {
      svc.logStressTrigger(student_id, skip_reason, 'session_skip')
        .catch((e) => logger.warn('Stress service unavailable (non-critical):', e.message));
    }

    // Find next scheduled date for this topic from the active plan
    let rescheduledTo = null;
    try {
      const plan = await getEnrichedActivePlan(student_id);
      if (plan) {
        const todayDate = today();
        for (const day of (plan.plan_data.schedule || [])) {
          if (day.date <= todayDate) continue;
          const slot = (day.slots || []).find((s) => s.topic_id === topic_id);
          if (slot) { rescheduledTo = day.date; break; }
        }
      }
    } catch (_) {}

    // Fire-and-forget replan for tired/unwell
    if (['tired', 'unwell'].includes(skip_reason)) {
      _triggerAsyncReplan(student_id, req.header('Authorization'), 'stress_high')
        .catch((e) => logger.warn('Background replan failed:', e.message));
    }

    // Invalidate today's sessions cache so next GET reflects the skip
    await cache.invalidate(CACHE_KEYS.TODAY_SESSIONS(student_id));

    res.json({
      success: true,
      rescheduled_to: rescheduledTo,
      message: rescheduledTo
        ? `Session skipped. This topic has been rescheduled to ${rescheduledTo}.`
        : 'Session skipped. Your plan will update shortly.',
    });
  } catch (err) {
    next(err);
  }
};

// â”€â”€ POST /api/scheduler/replan â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const replan = async (req, res, next) => {
  try {
    const { student_id } = req.user;
    const { reason = 'manual', gap_topic_ids = [] } = req.body;
    const token = req.header('Authorization').split(' ')[1];

    const { schedule, coverage_stats, warnings } = await _triggerAsyncReplan(
      student_id, `Bearer ${token}`, reason, gap_topic_ids
    );

    if (reason === 'gap_detected') {
    if (reason === 'gap_detected') {
      sendNotification('student', student_id, 'plan_updated', {}, { gap_topic_ids });
    } else if (reason === 'stress_high') {
      sendNotification('student', student_id, 'plan_updated');
    }

    // Invalidate plan and today's sessions caches — new plan was generated
    await cache.invalidateMany([
      CACHE_KEYS.ACTIVE_PLAN(student_id),
      CACHE_KEYS.TODAY_SESSIONS(student_id),
    ]);

    // Check for upcoming exams within 7 days and fire exam_week notification
    try {
      const examRes = await db.query(
        `SELECT subject, (exam_date::date - CURRENT_DATE) AS days
         FROM exams
         WHERE student_id = $1 AND exam_date >= CURRENT_DATE AND (exam_date::date - CURRENT_DATE) <= 7
         ORDER BY exam_date ASC LIMIT 1`,
        [student_id]
      );
      if (examRes.rows.length > 0) {
        const exam = examRes.rows[0];
        sendNotification('student', student_id, 'exam_week', {
          subject: exam.subject,
          days: exam.days,
        });
      }
    } catch (_) {}

    res.json({ success: true, reason, schedule, coverage_stats, warnings });
  } catch (err) {
    next(err);
  }
};

// â”€â”€ Internal: shared replan logic â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function _triggerAsyncReplan(student_id, authHeader, reason, gap_topic_ids = []) {
  const api = axios.create({ headers: { Authorization: authHeader } });

  // Gather completed topic IDs
  const completedResult = await db.query(
    `SELECT DISTINCT topic_id FROM study_sessions WHERE student_id = $1 AND completed = TRUE`,
    [student_id]
  );
  const completed_topic_ids = completedResult.rows.map((r) => r.topic_id);

  // Gather skipped sessions
  const skippedResult = await db.query(
    `SELECT topic_id, skip_reason, started_at FROM study_sessions
     WHERE student_id = $1 AND skipped = TRUE ORDER BY started_at DESC LIMIT 20`,
    [student_id]
  );
  const skipped_sessions = skippedResult.rows;

  // Get current plan data to pass topic/exam details
  const currentPlan = await db.query(
    `SELECT plan_data FROM study_plans WHERE student_id = $1 AND is_active = TRUE LIMIT 1`,
    [student_id]
  );

  let exams = [], topic_details = [], quiz_gaps = [], student_profile = {};
  if (currentPlan.rows.length > 0) {
    const planData = currentPlan.rows[0].plan_data;
    // Re-fetch fresh data
    try {
      const [profRes, examRes] = await Promise.all([
        api.get(`${PROFILE_SERVICE_URL}/api/profile/`),
        api.get(`${PROFILE_SERVICE_URL}/api/profile/exams`),
      ]);
      const profile = profRes.data.profile;
      exams = (examRes.data.exams || []).map((e) => ({
        subject: e.subject,
        exam_date: e.exam_date.split('T')[0],
        topic_ids: [],
      }));

      student_profile = {
        max_daily_hours: profile.max_daily_study_hours || 5,
        preferred_start_time: String(profile.preferred_study_start_time || '08:00').slice(0, 5),
        peer_cluster_id: profile.digital_twin?.peer_cluster_id || 2,
      };
    } catch (_) {}

    // Topics from DB
    const topicsRes = await db.query(
      `SELECT id, topic_name, subject, weightage_percent, estimated_study_hours,
              difficulty_level, prerequisite_topic_ids FROM topics LIMIT 100`
    );
    topic_details = topicsRes.rows.map((t) => ({
      id: t.id,
      topic_name: t.topic_name,
      subject: t.subject,
      weightage_percent: parseFloat(t.weightage_percent) || 5,
      estimated_study_hours: parseFloat(t.estimated_study_hours) || 2,
      difficulty_level: t.difficulty_level || 3,
      prerequisite_topic_ids: t.prerequisite_topic_ids || [],
    }));

    // Quiz gaps
    const gapsRes = await db.query(
      `SELECT topic_id, 1.0 - (score_percent / 100.0) AS gap_score FROM quiz_attempts
       WHERE student_id = $1 AND gap_detected = TRUE AND completed_at > NOW() - INTERVAL '30 days'`,
      [student_id]
    );
    quiz_gaps = gapsRes.rows.map((r) => ({
      topic_id: r.topic_id,
      gap_score: parseFloat(r.gap_score),
    }));
  }

  // Call AI engine replan via serviceClients (retry-enabled)
  const aiRes = await svc.replanSchedule({
    student_id,
    completed_topic_ids,
    skipped_sessions,
    current_date: today(),
    reason,
    gap_topic_ids,
    exams,
    student_profile,
    topic_details,
    quiz_gaps,
  });

  const newScheduleData = aiRes.data;

  // Deactivate old and save new plan
  await db.query(`UPDATE study_plans SET is_active = FALSE WHERE student_id = $1`, [student_id]);
  await db.query(
    `INSERT INTO study_plans (student_id, plan_data, generation_reason)
     VALUES ($1, $2, $3)`,
    [student_id, JSON.stringify(newScheduleData), reason]
  );

  return newScheduleData;
}

module.exports = { generatePlan, getActivePlan, getTodaySessions, completeSession, skipSession, replan };
