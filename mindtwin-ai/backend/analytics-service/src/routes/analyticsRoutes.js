const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
  getDashboard,
  getExamReadiness,
  getProgress,
  getInsights,
  dismissInsight,
  getWeeklyDigest,
  getTwinEvolution,
  sendWeeklyDigestNotifications,
} = require('../controllers/analyticsController');

// Public-facing routes (auth required)
router.get('/dashboard',              auth, getDashboard);
router.get('/exam-readiness/:examId', auth, getExamReadiness);
router.get('/progress',               auth, getProgress);
router.get('/insights',               auth, getInsights);
router.post('/insights/:insightId/dismiss', auth, dismissInsight);
router.get('/weekly-digest',          auth, getWeeklyDigest);
router.get('/twin-evolution',         auth, getTwinEvolution);

// Internal route — called by cron (x-api-key protected, no JWT)
router.post('/internal/weekly-digest-notify', sendWeeklyDigestNotifications);

module.exports = router;
