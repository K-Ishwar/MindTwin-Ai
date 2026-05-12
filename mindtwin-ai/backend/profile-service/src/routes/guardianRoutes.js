const express = require('express');
const router = express.Router();
const guardianController = require('../controllers/guardianController');
const { verifyGuardianAuth } = require('../middleware/auth');

// All routes require a valid guardian JWT
router.use(verifyGuardianAuth);

// ── Per-student read-only endpoints ──────────────────────────────────────────
router.get('/student/:studentId/overview',      guardianController.getStudentOverview);
router.get('/student/:studentId/performance',   guardianController.getPerformanceReport);
router.get('/student/:studentId/weekly-summary',guardianController.getWeeklySummary);
router.get('/student/:studentId/exam-readiness',guardianController.getExamReadiness);

// ── Multi-student summary (useful for teachers) ───────────────────────────────
router.get('/my-students', guardianController.getMyStudentsSummary);

module.exports = router;
