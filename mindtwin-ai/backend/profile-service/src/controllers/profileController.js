'use strict';


const logger = require('../../../../shared/logger');\nconst db     = require('../config/db');
const axios  = require('axios');
const redis  = require('../config/redis');
const { createCacheService, CACHE_KEYS, CACHE_TTL } = require('../../../../shared/cache/cacheService');

const AI_ENGINE_URL = process.env.AI_ENGINE_URL || 'http://ai-engine:8000';
const cache = createCacheService(redis);

// â”€â”€ GET /api/profile/ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const getProfile = async (req, res, next) => {
  try {
    const { student_id } = req.user;

    const profile = await cache.getOrSet(
      CACHE_KEYS.STUDENT_PROFILE(student_id),
      async () => {
        const [studentResult, twinResult, tokenResult] = await Promise.all([
          db.query(
            `SELECT id, name, email, grade_level, board, max_daily_study_hours,
                    preferred_study_start_time, onboarding_completed, email_verified,
                    created_at, updated_at
             FROM students WHERE id = $1`,
            [student_id]
          ),
          db.query(
            `SELECT peer_cluster_id, behavioral_features, last_updated
             FROM digital_twins WHERE student_id = $1`,
            [student_id]
          ),
          db.query(
            `SELECT balance, earned_today, social_media_mins_unlocked, last_reset
             FROM focus_tokens WHERE student_id = $1`,
            [student_id]
          ),
        ]);

        if (studentResult.rows.length === 0) return null;

        return {
          ...studentResult.rows[0],
          digital_twin:  twinResult.rows[0]  || null,
          focus_tokens:  tokenResult.rows[0] || null,
        };
      },
      CACHE_TTL.STUDENT_PROFILE
    );

    if (!profile) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }

    res.json({ success: true, profile });
  } catch (err) {
    next(err);
  }
};

// â”€â”€ PUT /api/profile/ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const updateProfile = async (req, res, next) => {
  try {
    const { student_id } = req.user;
    const { name, max_daily_study_hours, preferred_study_start_time, board, grade_level } = req.body;

    const result = await db.query(
      `UPDATE students
       SET name = COALESCE($1, name),
           max_daily_study_hours = COALESCE($2, max_daily_study_hours),
           preferred_study_start_time = COALESCE($3, preferred_study_start_time),
           board = COALESCE($4, board),
           grade_level = COALESCE($5, grade_level),
           updated_at = NOW()
       WHERE id = $6
       RETURNING id, name, email, grade_level, board, max_daily_study_hours,
                 preferred_study_start_time, onboarding_completed`,
      [name, max_daily_study_hours, preferred_study_start_time, board, grade_level, student_id]
    );

    // Invalidate profile cache so next GET fetches fresh data
    await cache.invalidate(CACHE_KEYS.STUDENT_PROFILE(student_id));

    res.json({ success: true, profile: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// â”€â”€ POST /api/profile/onboarding/complete â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const completeOnboarding = async (req, res, next) => {
  try {
    const { student_id } = req.user;
    const { exam_dates = [], study_preferences = {}, baseline_quiz_results = [] } = req.body;

    for (const exam of exam_dates) {
      await db.query(
        `INSERT INTO exams (student_id, subject, exam_date, board)
         VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
        [student_id, exam.subject, exam.exam_date, exam.board]
      );
    }

    await db.query(
      `UPDATE students
       SET onboarding_completed = true,
           max_daily_study_hours = COALESCE($1, max_daily_study_hours),
           preferred_study_start_time = COALESCE($2, preferred_study_start_time),
           updated_at = NOW()
       WHERE id = $3`,
      [study_preferences.max_daily_study_hours, study_preferences.preferred_study_start_time, student_id]
    );

    let twinVector = null;
    try {
      const aiResponse = await axios.post(`${AI_ENGINE_URL}/api/ai/twin/initialize`, {
        student_id,
        baseline_results: baseline_quiz_results,
      });
      twinVector = aiResponse.data.twin_vector || null;
    } catch (aiErr) {
      logger.warn('AI engine not reachable â€” skipping twin initialization:', aiErr.message);
    }

    await db.query(
      `UPDATE digital_twins
       SET twin_vector = COALESCE($1, twin_vector), last_updated = NOW()
       WHERE student_id = $2`,
      [twinVector ? JSON.stringify(twinVector) : null, student_id]
    );

    await db.query(
      `INSERT INTO focus_tokens (student_id, balance) VALUES ($1, 0) ON CONFLICT DO NOTHING`,
      [student_id]
    );

    // Invalidate profile cache after onboarding changes
    await cache.invalidate(CACHE_KEYS.STUDENT_PROFILE(student_id));

    res.json({ success: true, message: 'Onboarding complete', next_step: 'view_dashboard' });
  } catch (err) {
    next(err);
  }
};

// â”€â”€ POST /api/profile/exams â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const addExam = async (req, res, next) => {
  try {
    const { student_id } = req.user;
    const { subject, exam_date, board } = req.body;

    const result = await db.query(
      `INSERT INTO exams (student_id, subject, exam_date, board)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [student_id, subject, exam_date, board]
    );

    // Invalidate profile cache (exams are embedded in profile response)
    await cache.invalidate(CACHE_KEYS.STUDENT_PROFILE(student_id));

    res.status(201).json({ success: true, exam: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// â”€â”€ GET /api/profile/exams â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const getExams = async (req, res, next) => {
  try {
    const { student_id } = req.user;
    const result = await db.query(
      `SELECT * FROM exams WHERE student_id = $1 ORDER BY exam_date ASC`,
      [student_id]
    );
    res.json({ success: true, exams: result.rows });
  } catch (err) {
    next(err);
  }
};

// â”€â”€ DELETE /api/profile/exams/:examId â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const deleteExam = async (req, res, next) => {
  try {
    const { student_id } = req.user;
    const { examId } = req.params;

    const examCheck = await db.query(
      `SELECT id FROM exams WHERE id = $1 AND student_id = $2`,
      [examId, student_id]
    );
    if (examCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Exam not found or not authorized' });
    }

    await db.query(`DELETE FROM exams WHERE id = $1`, [examId]);
    await cache.invalidate(CACHE_KEYS.STUDENT_PROFILE(student_id));

    res.json({ success: true, message: 'Exam deleted' });
  } catch (err) {
    next(err);
  }
};

// â”€â”€ GET /api/profile/twin â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const getTwinStats = async (req, res, next) => {
  try {
    const { student_id } = req.user;
    const result = await db.query(
      `SELECT peer_cluster_id, behavioral_features, last_updated
       FROM digital_twins WHERE student_id = $1`,
      [student_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Digital twin not found' });
    }
    res.json({ success: true, twin: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// â”€â”€ GET /api/profile/progress â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const getTopicProgress = async (req, res, next) => {
  try {
    const { student_id } = req.user;
    const result = await db.query(
      `SELECT
         t.subject,
         COUNT(DISTINCT t.id)                                          AS total_topics,
         COUNT(DISTINCT CASE WHEN ss.completed = true THEN ss.topic_id END) AS completed_topics,
         ROUND(
           COUNT(DISTINCT CASE WHEN ss.completed = true THEN ss.topic_id END) * 100.0
           / NULLIF(COUNT(DISTINCT t.id), 0), 2
         )                                                              AS completion_percent,
         ROUND(AVG(qa.score_percent)::numeric, 2)                       AS avg_quiz_score
       FROM topics t
       LEFT JOIN study_sessions ss ON ss.topic_id = t.id AND ss.student_id = $1
       LEFT JOIN quiz_attempts  qa ON qa.topic_id = t.id AND qa.student_id = $1
       GROUP BY t.subject
       ORDER BY t.subject`,
      [student_id]
    );
    res.json({ success: true, progress: result.rows });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getProfile, updateProfile, completeOnboarding,
  addExam, getExams, deleteExam, getTwinStats, getTopicProgress,
};
