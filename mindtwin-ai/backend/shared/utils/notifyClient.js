/**
 * notifyClient — shared utility for all backend services.
 *
 * Sends a notification via the notification-service internal API.
 * NEVER throws — notification failures must never crash business logic.
 *
 * Usage:
 *   const { sendNotification } = require('../../shared/utils/notifyClient');
 *   await sendNotification('student', student_id, 'gap_detected', { topic_name: 'Algebra' });
 */

const axios = require('axios');

const NOTIFICATION_URL =
  process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:3007';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'internal-secret';

/**
 * @param {'student'|'guardian'} recipient_type
 * @param {string}               recipient_id    — UUID
 * @param {string}               template_key    — must exist in notification_templates
 * @param {Object}               template_vars   — { key: value } pairs for {{placeholder}} substitution
 * @param {Object}               data            — extra data payload for deep linking
 */
async function sendNotification(
  recipient_type,
  recipient_id,
  template_key,
  template_vars = {},
  data = {}
) {
  try {
    await axios.post(
      `${NOTIFICATION_URL}/api/notifications/send`,
      { recipient_type, recipient_id, template_key, template_vars, data },
      {
        headers: { 'x-api-key': INTERNAL_API_KEY },
        timeout: 3000,
      }
    );
  } catch (err) {
    // Non-fatal — log and continue
    console.error(
      `[notifyClient] send failed (non-fatal): template=${template_key} recipient=${recipient_id} — ${err.message}`
    );
  }
}

/**
 * Send the same notification to multiple recipients at once.
 *
 * @param {'student'|'guardian'} recipient_type
 * @param {string[]}             recipient_ids
 * @param {string}               template_key
 * @param {Object}               template_vars
 * @param {Object}               data
 */
async function sendBulkNotification(
  recipient_type,
  recipient_ids,
  template_key,
  template_vars = {},
  data = {}
) {
  if (!recipient_ids || recipient_ids.length === 0) return;
  try {
    await axios.post(
      `${NOTIFICATION_URL}/api/notifications/send-bulk`,
      { recipient_type, recipient_ids, template_key, template_vars, data },
      {
        headers: { 'x-api-key': INTERNAL_API_KEY },
        timeout: 5000,
      }
    );
  } catch (err) {
    console.error(
      `[notifyClient] bulk send failed (non-fatal): template=${template_key} count=${recipient_ids.length} — ${err.message}`
    );
  }
}

module.exports = { sendNotification, sendBulkNotification };
