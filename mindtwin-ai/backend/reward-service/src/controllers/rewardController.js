'use strict';


const logger = require('../../../../shared/logger');\nconst db    = require('../config/db');
const redis = require('../config/redis');
const { createCacheService, CACHE_KEYS, CACHE_TTL } = require('../../../../shared/cache/cacheService');

const cache = createCacheService(redis);

// â”€â”€ Token award table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Maps action + context conditions to { tokens, social_mins }
const AWARD_TABLE = [
  // Session complete â€” checked in order (longer first for bonus)
  {
    action: 'session_complete',
    condition: (ctx) => (ctx.duration_min || 0) >= 50,
    tokens: 18,
    social_mins: 25,
    label: 'Long session bonus',
  },
  {
    action: 'session_complete',
    condition: (ctx) => (ctx.duration_min || 0) >= 25,
    tokens: 10,
    social_mins: 15,
    label: 'Session complete',
  },
  // Quiz complete â€” checked in order (high score first)
  {
    action: 'quiz_complete',
    condition: (ctx) => (ctx.score_percent || 0) >= 90,
    tokens: 25,
    social_mins: 30,
    label: 'Quiz excellence bonus',
  },
  {
    action: 'quiz_complete',
    condition: (ctx) => (ctx.score_percent || 0) >= 70,
    tokens: 15,
    social_mins: 20,
    label: 'Quiz complete',
  },
  // Fixed-amount actions
  { action: 'mood_logged',              condition: () => true, tokens: 3,   social_mins: 0,  label: 'Mood logged'           },
  { action: 'streak_7',                 condition: () => true, tokens: 50,  social_mins: 60, label: '7-day streak!'         },
  { action: 'gap_topic_completed',      condition: () => true, tokens: 20,  social_mins: 25, label: 'Gap topic conquered'   },
  // Penalty
  { action: 'session_skipped_unexcused', condition: () => true, tokens: -5, social_mins: 0,  label: 'Unexcused skip penalty' },
];

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Resolve the award rule for a given action + context.
 * Returns { tokens, social_mins, label } or null if no rule matches.
 */
function resolveAward(action, context = {}) {
  const rule = AWARD_TABLE.find(
    (r) => r.action === action && r.condition(context)
  );
  return rule ? { tokens: rule.tokens, social_mins: rule.social_mins, label: rule.label } : null;
}

/**
 * Ensure a focus_tokens row exists for this student.
 * Creates one with zeroes if absent (idempotent).
 */
async function ensureTokenRow(student_id) {
  await db.query(
    `INSERT INTO focus_tokens (student_id, balance, earned_today, social_media_mins_unlocked)
     VALUES ($1, 0, 0, 0)
     ON CONFLICT (student_id) DO NOTHING`,
    [student_id]
  );
}

// â”€â”€ POST /api/reward/award â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const awardTokens = async (req, res, next) => {
  try {
    const { student_id, action, context = {} } = req.body;

    if (!student_id || !action) {
      return res.status(400).json({ success: false, error: 'student_id and action are required' });
    }

    const award = resolveAward(action, context);
    if (!award) {
      // Action recognised but no condition met (e.g. session < 25 min)
      return res.json({
        success: true,
        tokens_earned: 0,
        new_balance: null,
        social_media_mins_unlocked: 0,
        total_social_media_mins: null,
        message: 'No award threshold met for this action.',
      });
    }

    await ensureTokenRow(student_id);

    // Apply delta inside a transaction so balance never goes negative
    const result = await db.query(
      `UPDATE focus_tokens SET
         balance               = GREATEST(0, balance + $2),
         earned_today          = GREATEST(0, earned_today + $2),
         social_media_mins_unlocked = social_media_mins_unlocked + $3,
         updated_at            = NOW()
       WHERE student_id = $1
       RETURNING balance, earned_today, social_media_mins_unlocked`,
      [student_id, award.tokens, award.social_mins]
    );

    const row = result.rows[0];

    // Audit log
    await db.query(
      `INSERT INTO token_history
         (student_id, action, tokens_delta, social_media_mins_delta, balance_after)
       VALUES ($1, $2, $3, $4, $5)`,
      [student_id, award.label || action, award.tokens, award.social_mins, row.balance]
    );

    res.json({
      success: true,
      tokens_earned: award.tokens,
      new_balance: row.balance,
      social_media_mins_unlocked: award.social_mins,
      total_social_media_mins: row.social_media_mins_unlocked,
      message: award.label,
    });

    // Increment token awards metric
    try {
      const { tokenAwardsTotal } = require('../../../../shared/metrics');
      tokenAwardsTotal.inc({ action: award.label || action });
    } catch (_) { /* metrics not critical */ }

    // Invalidate token balance cache after any award
    await cache.invalidate(CACHE_KEYS.TOKEN_BALANCE(student_id));
  } catch (err) {
    next(err);
  }
};

// â”€â”€ GET /api/reward/balance â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const getBalance = async (req, res, next) => {
  try {
    const { student_id } = req.user;

    await ensureTokenRow(student_id);

    const data = await cache.getOrSet(
      CACHE_KEYS.TOKEN_BALANCE(student_id),
      async () => {
        const [balanceRes, historyRes] = await Promise.all([
          db.query(
            `SELECT balance, earned_today, social_media_mins_unlocked
             FROM focus_tokens WHERE student_id = $1`,
            [student_id]
          ),
          db.query(
            `SELECT action, tokens_delta, social_media_mins_delta, balance_after, created_at
             FROM token_history
             WHERE student_id = $1
             ORDER BY created_at DESC
             LIMIT 10`,
            [student_id]
          ),
        ]);

        const bal = balanceRes.rows[0] || { balance: 0, earned_today: 0, social_media_mins_unlocked: 0 };
        return {
          balance:                    bal.balance,
          earned_today:               bal.earned_today,
          social_media_mins_unlocked: bal.social_media_mins_unlocked,
          token_history:              historyRes.rows,
        };
      },
      CACHE_TTL.TOKEN_BALANCE
    );

    res.json({ success: true, ...data });
  } catch (err) {
    next(err);
  }
};

// â”€â”€ POST /api/reward/social-media/unlock â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const unlockSocialMedia = async (req, res, next) => {
  try {
    const { student_id } = req.user;
    const { app_name, minutes_requested } = req.body;

    if (!app_name || !minutes_requested || minutes_requested < 1) {
      return res.status(400).json({ success: false, error: 'app_name and minutes_requested (>0) are required' });
    }

    await ensureTokenRow(student_id);

    // Check available balance
    const balRes = await db.query(
      `SELECT social_media_mins_unlocked FROM focus_tokens WHERE student_id = $1`,
      [student_id]
    );
    const available = balRes.rows[0]?.social_media_mins_unlocked ?? 0;

    if (available < minutes_requested) {
      return res.status(400).json({
        success: false,
        error: `Not enough unlocked minutes. Available: ${available} mins, requested: ${minutes_requested} mins.`,
        available_mins: available,
      });
    }

    // Deduct and create session record
    await db.query(
      `UPDATE focus_tokens
       SET social_media_mins_unlocked = social_media_mins_unlocked - $2, updated_at = NOW()
       WHERE student_id = $1`,
      [student_id, minutes_requested]
    );

    const sessionRes = await db.query(
      `INSERT INTO social_media_sessions (student_id, app_name, minutes_granted)
       VALUES ($1, $2, $3)
       RETURNING session_token, minutes_granted`,
      [student_id, app_name, minutes_requested]
    );

    const session = sessionRes.rows[0];
    const remaining = available - minutes_requested;

    res.json({
      success: true,
      minutes_granted: session.minutes_granted,
      remaining_mins: remaining,
      session_token: session.session_token,
      app_name,
      message: `Enjoy ${minutes_requested} minutes of ${app_name}! You have ${remaining} mins left.`,
    });

    // Invalidate token balance cache after unlock
    await cache.invalidate(CACHE_KEYS.TOKEN_BALANCE(student_id));
  } catch (err) {
    next(err);
  }
};

// â”€â”€ GET /api/reward/streak â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const getStreak = async (req, res, next) => {
  try {
    const { student_id } = req.user;

    // Fetch distinct study days with at least 1 completed session, newest first
    const daysRes = await db.query(
      `SELECT DISTINCT DATE(started_at) AS study_date
       FROM study_sessions
       WHERE student_id = $1 AND completed = TRUE AND started_at IS NOT NULL
       ORDER BY study_date DESC`,
      [student_id]
    );

    const dates = daysRes.rows.map((r) => r.study_date);

    let current_streak = 0;
    let longest_streak = 0;
    let temp_streak = 0;
    let last_active_date = dates.length > 0 ? dates[0] : null;

    if (dates.length > 0) {
      // Count current streak from today/yesterday backwards
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let expected = new Date(today);
      // Allow today or yesterday as starting point
      const latestDate = new Date(dates[0]);
      const diffDays = Math.floor((today - latestDate) / 86400000);
      if (diffDays <= 1) {
        expected = latestDate;
        current_streak = 1;
        for (let i = 1; i < dates.length; i++) {
          const prev = new Date(dates[i]);
          const gap = Math.floor((expected - prev) / 86400000);
          if (gap === 1) { current_streak++; expected = prev; }
          else break;
        }
      }

      // Calculate longest streak
      temp_streak = 1;
      for (let i = 1; i < dates.length; i++) {
        const a = new Date(dates[i - 1]);
        const b = new Date(dates[i]);
        const gap = Math.floor((a - b) / 86400000);
        if (gap === 1) { temp_streak++; longest_streak = Math.max(longest_streak, temp_streak); }
        else temp_streak = 1;
      }
      longest_streak = Math.max(longest_streak, current_streak, 1);
    }

    res.json({
      success: true,
      current_streak,
      longest_streak,
      last_active_date,
      total_study_days: dates.length,
    });
  } catch (err) {
    next(err);
  }
};

// â”€â”€ POST /api/reward/daily-reset â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const dailyReset = async (req, res, next) => {
  try {
    // Reset earned_today and expire unused social media minutes
    const result = await db.query(
      `UPDATE focus_tokens
       SET earned_today = 0,
           social_media_mins_unlocked = 0,
           updated_at = NOW()
       WHERE earned_today > 0 OR social_media_mins_unlocked > 0
       RETURNING student_id`
    );

    const resetCount = result.rowCount;

    // Audit: insert reset log entries
    if (resetCount > 0) {
      const values = result.rows
        .map((_, i) => `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5})`)
        .join(', ');
      const params = result.rows.flatMap((r) => [r.student_id, 'daily_reset', 0, 0, 0]);
      await db.query(
        `INSERT INTO token_history (student_id, action, tokens_delta, social_media_mins_delta, balance_after) VALUES ${values}`,
        params
      );
    }

    logger.info(`[daily-reset] Reset ${resetCount} student records.`);

    res.json({
      success: true,
      students_reset: resetCount,
      reset_at: new Date().toISOString(),
      message: 'Daily reset complete. earned_today and social_media_mins_unlocked cleared.',
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { awardTokens, getBalance, unlockSocialMedia, getStreak, dailyReset };
