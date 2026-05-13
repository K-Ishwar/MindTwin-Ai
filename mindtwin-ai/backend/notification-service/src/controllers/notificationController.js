'use strict';

const logger = require('../../../../shared/logger');
const db = require('../config/db');
const admin = require('../config/firebase');

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'internal-secret';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Render a template string by replacing {{variable}} placeholders.
 */
function renderTemplate(template, vars = {}) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    vars[key] !== undefined ? String(vars[key]) : `{{${key}}}`
  );
}

/**
 * Verify the internal API key header.
 */
function requireInternalKey(req, res) {
  const key = req.header('x-api-key') || req.header('X-Internal-API-Key');
  if (key !== INTERNAL_API_KEY) {
    res.status(403).json({ success: false, error: 'Forbidden' });
    return false;
  }
  return true;
}

/**
 * Check whether a user has a given notification category enabled.
 * Defaults to true if no preference row exists.
 */
async function isPreferenceEnabled(recipient_type, recipient_id, category) {
  if (!category) return true;
  const col = recipient_type === 'guardian' ? 'guardian_id' : 'student_id';
  const result = await db.query(
    `SELECT enabled FROM notification_preferences WHERE ${col} = $1 AND category = $2`,
    [recipient_id, category]
  );
  if (result.rows.length === 0) return true; // default: enabled
  return result.rows[0].enabled;
}

/**
 * Send a single FCM message. Returns { sent: bool, error?: string }.
 * Never throws — FCM failures are non-fatal.
 */
async function sendFCM(push_token, title, body, data = {}, priority = 'normal') {
  if (!push_token) return { sent: false };

  // Stringify all data values (FCM requires string values in data payload)
  const fcmData = {};
  for (const [k, v] of Object.entries(data)) {
    fcmData[k] = typeof v === 'string' ? v : JSON.stringify(v);
  }

  try {
    await admin.messaging().send({
      token: push_token,
      notification: { title, body },
      data: fcmData,
      android: { priority: priority === 'high' ? 'high' : 'normal' },
      apns: { payload: { aps: { sound: 'default' } } },
    });
    return { sent: true };
  } catch (err) {
    logger.warn(`[FCM] send error: ${err.message}`);
    // If token is invalid/unregistered, clear it from DB
    if (
      err.code === 'messaging/registration-token-not-registered' ||
      err.code === 'messaging/invalid-registration-token'
    ) {
      return { sent: false, stale_token: true, error: err.message };
    }
    return { sent: false, error: err.message };
  }
}

// ── POST /api/notifications/register-token ────────────────────────────────────
// Auth required (student or guardian)
exports.registerToken = async (req, res) => {
  try {
    const { push_token, platform } = req.body;
    if (!push_token) {
      return res.status(400).json({ success: false, error: 'push_token is required' });
    }

    if (req.user.student_id) {
      await db.query('UPDATE students SET push_token = $1 WHERE id = $2', [push_token, req.user.student_id]);
    } else if (req.user.guardian_id) {
      await db.query('UPDATE guardian_accounts SET push_token = $1 WHERE id = $2', [push_token, req.user.guardian_id]);
    } else {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }

    res.json({ success: true, message: 'Push token registered', platform: platform || 'unknown' });
  } catch (err) {
    logger.error(`[registerToken] ${err.message}`);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ── POST /api/notifications/send ─────────────────────────────────────────────
// Internal API key required
exports.sendNotification = async (req, res) => {
  if (!requireInternalKey(req, res)) return;

  try {
    const {
      recipient_type = 'student', // 'student' | 'guardian'
      recipient_id,
      template_key,
      template_vars = {},
      data = {},
    } = req.body;

    if (!recipient_id || !template_key) {
      return res.status(400).json({ success: false, error: 'recipient_id and template_key are required' });
    }

    // 1. Load template
    const tplResult = await db.query(
      'SELECT * FROM notification_templates WHERE template_key = $1',
      [template_key]
    );
    if (tplResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: `Template '${template_key}' not found` });
    }
    const template = tplResult.rows[0];

    // 2. Check preferences
    const allowed = await isPreferenceEnabled(recipient_type, recipient_id, template.category);
    if (!allowed) {
      return res.json({ success: true, notification_id: null, fcm_sent: false, skipped: true, reason: 'preference_disabled' });
    }

    // 3. Render title + body
    const title = renderTemplate(template.title_template, template_vars);
    const body  = renderTemplate(template.body_template,  template_vars);

    // 4. Persist notification
    let notification_id;
    if (recipient_type === 'guardian') {
      const insertRes = await db.query(
        `INSERT INTO guardian_notifications (guardian_id, student_id, type, title, body, data)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [
          recipient_id,
          data.student_id || null,
          template_key,
          title,
          body,
          JSON.stringify(data),
        ]
      );
      notification_id = insertRes.rows[0].id;
    } else {
      const insertRes = await db.query(
        `INSERT INTO notifications (student_id, type, title, body, data)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [recipient_id, template_key, title, body, JSON.stringify(data)]
      );
      notification_id = insertRes.rows[0].id;
    }

    // 5. Get push token
    let push_token = null;
    if (recipient_type === 'guardian') {
      const r = await db.query('SELECT push_token FROM guardian_accounts WHERE id = $1', [recipient_id]);
      push_token = r.rows[0]?.push_token || null;
    } else {
      const r = await db.query('SELECT push_token FROM students WHERE id = $1', [recipient_id]);
      push_token = r.rows[0]?.push_token || null;
    }

    // 6. Send FCM
    const fcmResult = await sendFCM(
      push_token,
      title,
      body,
      { type: template_key, notification_id, ...data },
      template.priority
    );

    // Clear stale token
    if (fcmResult.stale_token) {
      if (recipient_type === 'guardian') {
        await db.query('UPDATE guardian_accounts SET push_token = NULL WHERE id = $1', [recipient_id]);
      } else {
        await db.query('UPDATE students SET push_token = NULL WHERE id = $1', [recipient_id]);
      }
    }

    res.json({
      success: true,
      notification_id,
      fcm_sent: fcmResult.sent,
      ...(fcmResult.error ? { fcm_error: fcmResult.error } : {}),
    });
  } catch (err) {
    logger.error(`[sendNotification] ${err.message}`);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ── POST /api/notifications/send-bulk ────────────────────────────────────────
// Internal API key required — uses FCM sendEachForMulticast (max 500 per call)
exports.sendBulk = async (req, res) => {
  if (!requireInternalKey(req, res)) return;

  try {
    const {
      recipient_ids = [],
      recipient_type = 'student',
      template_key,
      template_vars = {},
      data = {},
    } = req.body;

    if (!recipient_ids.length || !template_key) {
      return res.status(400).json({ success: false, error: 'recipient_ids and template_key are required' });
    }

    // Load template
    const tplResult = await db.query(
      'SELECT * FROM notification_templates WHERE template_key = $1',
      [template_key]
    );
    if (tplResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: `Template '${template_key}' not found` });
    }
    const template = tplResult.rows[0];
    const title = renderTemplate(template.title_template, template_vars);
    const body  = renderTemplate(template.body_template,  template_vars);

    // Fetch push tokens in one query
    const table = recipient_type === 'guardian' ? 'guardian_accounts' : 'students';
    const tokenResult = await db.query(
      `SELECT id, push_token FROM ${table} WHERE id = ANY($1::uuid[]) AND push_token IS NOT NULL`,
      [recipient_ids]
    );
    const tokenMap = Object.fromEntries(tokenResult.rows.map((r) => [r.id, r.push_token]));

    // Persist notifications for all recipients (bulk insert)
    if (recipient_ids.length > 0) {
      const notifTable = recipient_type === 'guardian' ? 'guardian_notifications' : 'notifications';
      const idCol      = recipient_type === 'guardian' ? 'guardian_id' : 'student_id';
      const values     = recipient_ids.map((_, i) => `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5})`).join(', ');
      const params     = recipient_ids.flatMap((id) => [id, template_key, title, body, JSON.stringify(data)]);
      await db.query(
        `INSERT INTO ${notifTable} (${idCol}, type, title, body, data) VALUES ${values}`,
        params
      );
    }

    // Build FCM multicast messages (batches of 500)
    const tokens = recipient_ids.map((id) => tokenMap[id]).filter(Boolean);
    let success_count = 0;
    let failure_count = 0;
    const stale_tokens = [];

    const fcmData = {};
    for (const [k, v] of Object.entries({ type: template_key, ...data })) {
      fcmData[k] = typeof v === 'string' ? v : JSON.stringify(v);
    }

    for (let i = 0; i < tokens.length; i += 500) {
      const batch = tokens.slice(i, i + 500);
      try {
        const multicastMsg = {
          tokens: batch,
          notification: { title, body },
          data: fcmData,
          android: { priority: template.priority === 'high' ? 'high' : 'normal' },
          apns: { payload: { aps: { sound: 'default' } } },
        };
        const response = await admin.messaging().sendEachForMulticast(multicastMsg);
        success_count += response.successCount;
        failure_count += response.failureCount;

        // Collect stale tokens
        response.responses.forEach((r, idx) => {
          if (
            !r.success &&
            (r.error?.code === 'messaging/registration-token-not-registered' ||
              r.error?.code === 'messaging/invalid-registration-token')
          ) {
            stale_tokens.push(batch[idx]);
          }
        });
      } catch (err) {
        logger.error(`[sendBulk] FCM batch error: ${err.message}`);
        failure_count += batch.length;
      }
    }

    // Clear stale tokens
    if (stale_tokens.length > 0) {
      const table = recipient_type === 'guardian' ? 'guardian_accounts' : 'students';
      await db.query(
        `UPDATE ${table} SET push_token = NULL WHERE push_token = ANY($1)`,
        [stale_tokens]
      );
    }

    res.json({
      success: true,
      total: recipient_ids.length,
      fcm_attempted: tokens.length,
      success_count,
      failure_count,
    });
  } catch (err) {
    logger.error(`[sendBulk] ${err.message}`);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ── GET /api/notifications ────────────────────────────────────────────────────
// Auth required (student or guardian)
exports.getNotifications = async (req, res) => {
  try {
    let notifications, unread_count;

    if (req.user.guardian_id) {
      const result = await db.query(
        `SELECT id, student_id, type, title, body, data, read, created_at
         FROM guardian_notifications
         WHERE guardian_id = $1
         ORDER BY created_at DESC LIMIT 30`,
        [req.user.guardian_id]
      );
      const countResult = await db.query(
        'SELECT COUNT(*) FROM guardian_notifications WHERE guardian_id = $1 AND read = FALSE',
        [req.user.guardian_id]
      );
      notifications = result.rows;
      unread_count  = parseInt(countResult.rows[0].count, 10);
    } else {
      const result = await db.query(
        `SELECT id, type, title, body, data, read, created_at
         FROM notifications
         WHERE student_id = $1
         ORDER BY created_at DESC LIMIT 30`,
        [req.user.student_id]
      );
      const countResult = await db.query(
        'SELECT COUNT(*) FROM notifications WHERE student_id = $1 AND read = FALSE',
        [req.user.student_id]
      );
      notifications = result.rows;
      unread_count  = parseInt(countResult.rows[0].count, 10);
    }

    res.json({ success: true, notifications, unread_count });
  } catch (err) {
    logger.error(`[getNotifications] ${err.message}`);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ── PUT /api/notifications/:id/read ──────────────────────────────────────────
exports.markRead = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.guardian_id) {
      await db.query(
        'UPDATE guardian_notifications SET read = TRUE WHERE id = $1 AND guardian_id = $2',
        [id, req.user.guardian_id]
      );
    } else {
      await db.query(
        'UPDATE notifications SET read = TRUE WHERE id = $1 AND student_id = $2',
        [id, req.user.student_id]
      );
    }

    res.json({ success: true });
  } catch (err) {
    logger.error(`[markRead] ${err.message}`);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ── PUT /api/notifications/mark-all-read ─────────────────────────────────────
exports.markAllRead = async (req, res) => {
  try {
    if (req.user.guardian_id) {
      await db.query(
        'UPDATE guardian_notifications SET read = TRUE WHERE guardian_id = $1 AND read = FALSE',
        [req.user.guardian_id]
      );
    } else {
      await db.query(
        'UPDATE notifications SET read = TRUE WHERE student_id = $1 AND read = FALSE',
        [req.user.student_id]
      );
    }

    res.json({ success: true });
  } catch (err) {
    logger.error(`[markAllRead] ${err.message}`);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ── GET /api/notifications/preferences ───────────────────────────────────────
exports.getPreferences = async (req, res) => {
  try {
    const col = req.user.guardian_id ? 'guardian_id' : 'student_id';
    const id  = req.user.guardian_id || req.user.student_id;

    const result = await db.query(
      `SELECT category, enabled FROM notification_preferences WHERE ${col} = $1`,
      [id]
    );

    // Return all known categories with defaults for any not yet set
    const ALL_CATEGORIES = ['wellness', 'study', 'quiz', 'motivation', 'academic', 'account', 'reward'];
    const prefMap = Object.fromEntries(result.rows.map((r) => [r.category, r.enabled]));
    const preferences = ALL_CATEGORIES.map((cat) => ({
      category: cat,
      enabled: prefMap[cat] !== undefined ? prefMap[cat] : true,
    }));

    res.json({ success: true, preferences });
  } catch (err) {
    logger.error(`[getPreferences] ${err.message}`);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ── PUT /api/notifications/preferences ───────────────────────────────────────
exports.updatePreferences = async (req, res) => {
  try {
    const col = req.user.guardian_id ? 'guardian_id' : 'student_id';
    const id  = req.user.guardian_id || req.user.student_id;
    const { preferences = [] } = req.body; // [{ category, enabled }]

    if (!Array.isArray(preferences) || preferences.length === 0) {
      return res.status(400).json({ success: false, error: 'preferences array is required' });
    }

    for (const pref of preferences) {
      if (!pref.category || typeof pref.enabled !== 'boolean') continue;
      await db.query(
        `INSERT INTO notification_preferences (${col}, category, enabled)
         VALUES ($1, $2, $3)
         ON CONFLICT (${col}, category) DO UPDATE SET enabled = $3, updated_at = NOW()`,
        [id, pref.category, pref.enabled]
      );
    }

    res.json({ success: true, message: 'Preferences updated' });
  } catch (err) {
    logger.error(`[updatePreferences] ${err.message}`);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
