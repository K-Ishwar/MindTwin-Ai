'use strict';


const logger = require('../../../../shared/logger');\nconst db = require('../config/db');
const { sendWeeklyDigestEmail } = require('../services/emailService');

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'internal-secret';

/**
 * POST /api/notifications/send-weekly-digest  (internal, x-api-key protected)
 *
 * Body: { student_id, digest_data }
 *
 * Actions:
 *  1. Verify internal API key
 *  2. Fetch student record (name, email, email_verified, push_token)
 *  3. Save a "weekly_digest" notification row to the DB
 *  4. Send push notification: "Your weekly report is ready ðŸ“Š"
 *  5. If email_verified = true â†’ send HTML digest email via emailService
 *  6. Return { success, push_sent, email_sent }
 */
exports.sendWeeklyDigest = async (req, res, next) => {
  try {
    // â”€â”€ Auth â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const apiKey = req.header('x-api-key');
    if (apiKey !== INTERNAL_API_KEY) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const { student_id, digest_data } = req.body;
    if (!student_id) {
      return res.status(400).json({ success: false, error: 'student_id is required' });
    }

    // â”€â”€ Fetch student â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const studentResult = await db.query(
      `SELECT id, name, email, email_verified, push_token
       FROM students WHERE id = $1`,
      [student_id]
    );

    if (studentResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }

    const student = studentResult.rows[0];

    // â”€â”€ Build notification body â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const weekSummary = digest_data?.week_summary
      || 'Your weekly study digest is ready. Check your progress!';

    const totalHours = digest_data?.study_stats?.total_mins
      ? ((digest_data.study_stats.total_mins) / 60).toFixed(1)
      : null;

    const pushBody = totalHours
      ? `You studied ${totalHours}h this week. Tap to see your full report.`
      : weekSummary;

    // â”€â”€ Save to notifications table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const notifResult = await db.query(
      `INSERT INTO notifications (student_id, type, title, body, data)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [
        student_id,
        'weekly_digest',
        'Your weekly report is ready ðŸ“Š',
        pushBody,
        JSON.stringify({ digest_data, source: 'weekly_digest_cron' }),
      ]
    );

    const notification_id = notifResult.rows[0].id;

    // â”€â”€ Push notification (Expo push â€” fire-and-forget) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    let push_sent = false;
    if (student.push_token) {
      try {
        const { default: fetch } = await import('node-fetch').catch(() => ({ default: null }));
        const fetcher = fetch || globalThis.fetch;
        if (fetcher) {
          await fetcher('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
              to:    student.push_token,
              title: 'Your weekly report is ready ðŸ“Š',
              body:  pushBody,
              data:  { type: 'weekly_digest', notification_id },
            }),
          });
          push_sent = true;
        }
      } catch (pushErr) {
        logger.warn('[weeklyDigest] Push notification failed (non-critical):', pushErr.message);
      }
    }

    // â”€â”€ Email (only if email_verified = true) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    let email_sent = false;
    if (student.email_verified && student.email) {
      try {
        await sendWeeklyDigestEmail(
          { id: student.id, name: student.name, email: student.email },
          digest_data || {}
        );
        email_sent = true;
      } catch (emailErr) {
        logger.warn('[weeklyDigest] Email send failed (non-critical):', emailErr.message);
      }
    }

    res.json({
      success: true,
      notification_id,
      push_sent,
      email_sent,
      email_verified: !!student.email_verified,
    });
  } catch (err) {
    next(err);
  }
};
