const logger = require('../../../../shared/logger');
const db = require('../config/db');
const redisClient = require('../config/redis');
const axios = require('axios');
const { createCacheService, CACHE_KEYS, CACHE_TTL } = require('../../../../shared/cache/cacheService');
const { sendNotification } = require('../../../shared/utils/notifyClient');

const AI_ENGINE_URL = process.env.AI_ENGINE_URL || 'http://ai-engine:8000';
const SCHEDULER_URL = process.env.SCHEDULER_SERVICE_URL || 'http://scheduler-service:3005';
const REWARD_URL    = process.env.REWARD_SERVICE_URL    || 'http://reward-service:3006';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY   || 'internal-secret';

const cache = createCacheService(redisClient);

exports.getCurrentStress = async (req, res, next) => {
  try {
    const { student_id } = req.user;

    // Use standardised cache key (STRESS_CURRENT) with 30-min TTL
    let result;
    const cacheKey = CACHE_KEYS.STRESS_CURRENT(student_id);
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      result = JSON.parse(cached);
    } else {
      const { data } = await axios.post(`${AI_ENGINE_URL}/api/ai/stress/predict/${student_id}`);
      result = data;
      await redisClient.set(cacheKey, JSON.stringify(result), { EX: CACHE_TTL.STRESS_CURRENT });
    }

    // Enrich with exam info
    const examsRes = await db.query(
      `SELECT date FROM exams WHERE student_id = $1 AND date >= CURRENT_DATE ORDER BY date ASC LIMIT 1`,
      [student_id]
    );
    let is_exam_week = false;
    let days_to_nearest_exam = null;
    
    if (examsRes.rows.length > 0) {
      const examDate = new Date(examsRes.rows[0].date);
      const today = new Date();
      const diffTime = Math.abs(examDate - today);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      days_to_nearest_exam = diffDays;
      if (diffDays <= 7) is_exam_week = true;
    }

    // Check recent plan adjustments
    const adjRes = await db.query(
      `SELECT COUNT(*) FROM wellness_interventions 
       WHERE student_id = $1 AND intervention_type = 'plan_adjustment' AND action_taken = 'done' AND acknowledged_at > NOW() - INTERVAL '1 day'`,
      [student_id]
    );
    const plan_adjustments_made = parseInt(adjRes.rows[0].count) > 0;

    // ── Fire stress notifications (non-blocking) ──────────────────────────────
    const score = result?.score ?? result?.predictions?.tomorrow ?? 0;
    if (score >= 0.8) {
      sendNotification('student', student_id, 'stress_critical');
    } else if (score >= 0.6) {
      sendNotification('student', student_id, 'stress_high');
    }

    res.json({
      success: true,
      ...result,
      is_exam_week,
      days_to_nearest_exam,
      plan_adjustments_made
    });

    // Increment stress prediction metric
    try {
      const { stressPredictionsTotal } = require('../../../../shared/metrics');
      const severity = result?.severity || result?.severity_tomorrow || 'unknown';
      stressPredictionsTotal.inc({ severity });
    } catch (_) { /* metrics not critical */ }
  } catch (err) {
    logger.error('Error fetching current stress:', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch current stress' });
  }
};

exports.getStressHistory = async (req, res, next) => {
  try {
    const { student_id } = req.user;
    const { data } = await axios.get(`${AI_ENGINE_URL}/api/ai/stress/history/${student_id}`);
    res.json({ success: true, ...data });
  } catch (err) {
    logger.error('Error fetching stress history:', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch stress history' });
  }
};

exports.logMood = async (req, res, next) => {
  try {
    const { student_id } = req.user;
    const { mood_score, notes } = req.body;

    const { data } = await axios.post(`${AI_ENGINE_URL}/api/ai/stress/mood-log`, {
      student_id,
      mood_score,
      notes
    });

    // Invalidate stress cache using standardised key
    const cacheKey = CACHE_KEYS.STRESS_CURRENT(student_id);
    await redisClient.del(cacheKey);

    res.json({ success: true, ...data });
  } catch (err) {
    logger.error('Error logging mood:', err.message);
    res.status(500).json({ success: false, error: 'Failed to log mood' });
  }
};

exports.acknowledgeIntervention = async (req, res, next) => {
  try {
    const { student_id } = req.user;
    const { intervention_type, action, action_taken } = req.body;

    // Get current stress for logging â€” use standardised key
    const cacheKey = CACHE_KEYS.STRESS_CURRENT(student_id);
    let stress_score_at_time = null;
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      stress_score_at_time = JSON.parse(cached).predictions.tomorrow;
    }

    await db.query(
      `INSERT INTO wellness_interventions (student_id, intervention_type, action_taken, stress_score_at_time)
       VALUES ($1, $2, $3, $4)`,
      [student_id, intervention_type, action_taken, stress_score_at_time]
    );

    let tokens_awarded = 0;
    let message = "Intervention acknowledged.";

    if (action_taken === "done") {
      if (intervention_type === "breathing_exercise") {
        tokens_awarded = 5;
        try {
          await axios.post(`${REWARD_URL}/api/reward/award`, {
            student_id,
            amount: 5,
            reason: "Completed breathing exercise"
          }, { headers: { 'x-api-key': INTERNAL_API_KEY }});
          message = "Breathing exercise completed. 5 bonus tokens awarded!";
        } catch (e) {
          logger.error("Failed to award tokens:", e.message);
        }
      }

      if (action === "reduce_plan_by_50_percent" || action === "reduce_plan_by_20_percent") {
        try {
          const token = req.header('Authorization');
          await axios.post(`${SCHEDULER_URL}/api/scheduler/replan`, {
            reason: "stress_high"
          }, { headers: { Authorization: token }});
          message += " Study plan has been reduced to ease load.";
        } catch (e) {
          logger.error("Failed to trigger scheduler replan:", e.message);
        }
      }
    }

    res.json({ success: true, tokens_awarded, message });
  } catch (err) {
    logger.error('Error acknowledging intervention:', err.message);
    res.status(500).json({ success: false, error: 'Failed to acknowledge intervention' });
  }
};

exports.getWellnessSummary = async (req, res, next) => {
  try {
    const { student_id } = req.user;

    // Call AI history for stats
    const histResp = await axios.get(`${AI_ENGINE_URL}/api/ai/stress/history/${student_id}`);
    const histData = histResp.data;

    // Get interventions this week
    const interventionsRes = await db.query(
      `SELECT intervention_type, action_taken FROM wellness_interventions 
       WHERE student_id = $1 AND acknowledged_at > NOW() - INTERVAL '7 days'`,
      [student_id]
    );

    const intvs = interventionsRes.rows;
    const interventions_this_week = intvs.length;
    const breathing_exercises_done = intvs.filter(i => i.intervention_type === 'breathing_exercise' && i.action_taken === 'done').length;

    let recommended_actions = [];
    if (histData.avg_score_week > 0.6) {
      recommended_actions.push("Consider taking a full day off studying.");
      recommended_actions.push("Schedule a chat with a mentor or counselor.");
    } else if (histData.avg_score_week > 0.4) {
      recommended_actions.push("Ensure you're taking regular Pomodoro breaks.");
    } else {
      recommended_actions.push("Keep up the balanced schedule!");
    }

    res.json({
      success: true,
      current_stress: histData.history && histData.history.length > 0 ? histData.history[0].score : 0,
      weekly_avg: histData.avg_score_week,
      mood_trend: histData.trend_direction,
      interventions_this_week,
      breathing_exercises_done,
      recommended_actions
    });
  } catch (err) {
    logger.error('Error getting wellness summary:', err.message);
    res.status(500).json({ success: false, error: 'Failed to get wellness summary' });
  }
};
