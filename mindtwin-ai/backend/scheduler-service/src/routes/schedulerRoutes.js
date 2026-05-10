const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
  generatePlan,
  getActivePlan,
  getTodaySessions,
  completeSession,
  skipSession,
  replan,
} = require('../controllers/schedulerController');

// Plan generation & retrieval
router.post('/generate', auth, generatePlan);
router.get('/plan', auth, getActivePlan);
router.get('/today', auth, getTodaySessions);

// Session tracking
router.post('/session/complete', auth, completeSession);
router.post('/session/skip', auth, skipSession);

// Replanning
router.post('/replan', auth, replan);

module.exports = router;
