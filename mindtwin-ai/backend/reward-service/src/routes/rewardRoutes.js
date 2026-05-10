const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const internalAuth = require('../middleware/internalAuth');
const {
  awardTokens,
  getBalance,
  unlockSocialMedia,
  getStreak,
  dailyReset,
} = require('../controllers/rewardController');

// Internal service-to-service (scheduler, quiz call these)
router.post('/award', internalAuth, awardTokens);
router.post('/daily-reset', internalAuth, dailyReset);

// Student-facing (require JWT)
router.get('/balance', auth, getBalance);
router.get('/streak', auth, getStreak);
router.post('/social-media/unlock', auth, unlockSocialMedia);

module.exports = router;
