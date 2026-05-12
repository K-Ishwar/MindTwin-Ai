'use strict';\n
const logger = require('../../../../shared/logger');\n/**
 * Weekly Digest Cron
 * Fires every Sunday at 18:00 (6 PM) IST.
 * Calls the internal analytics endpoint which fans out notifications
 * to all active students via the notification service.
 */

const cron = require('node-cron');
const axios = require('axios');

const ANALYTICS_SERVICE_URL = process.env.ANALYTICS_SERVICE_URL || 'http://analytics-service:3008';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'internal-secret';

// Cron expression: minute=0, hour=18, day-of-week=0 (Sunday)
// Timezone is set to Asia/Kolkata via TZ env var in Docker
const WEEKLY_DIGEST_CRON = process.env.WEEKLY_DIGEST_CRON || '0 18 * * 0';

function startWeeklyDigestCron() {
  cron.schedule(
    WEEKLY_DIGEST_CRON,
    async () => {
      logger.info('[WeeklyDigestCron] Triggering weekly digest notifications...');
      try {
        const res = await axios.post(
          `${ANALYTICS_SERVICE_URL}/api/analytics/internal/weekly-digest-notify`,
          {},
          { headers: { 'x-api-key': INTERNAL_API_KEY } }
        );
        logger.info('[WeeklyDigestCron] Done:', res.data);
      } catch (err) {
        logger.error('[WeeklyDigestCron] Failed:', err.message);
      }
    },
    {
      timezone: 'Asia/Kolkata',
    }
  );

  logger.info('[WeeklyDigestCron] Scheduled â€” every Sunday at 18:00 IST');
}

module.exports = { startWeeklyDigestCron };
