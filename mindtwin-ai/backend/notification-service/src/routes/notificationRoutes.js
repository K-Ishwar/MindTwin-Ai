const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/notificationController');
const { sendWeeklyDigest } = require('../controllers/weeklyDigestController');
const { sendOTPEmail }     = require('../controllers/otpController');
const auth = require('../middleware/auth');

// ── Internal (API key protected) ──────────────────────────────────────────────
router.post('/send',                ctrl.sendNotification);  // single send
router.post('/send-bulk',           ctrl.sendBulk);          // multicast send
router.post('/send-weekly-digest',  sendWeeklyDigest);       // internal
router.post('/send-otp-email',      sendOTPEmail);           // internal

// ── Auth required (student or guardian JWT) ───────────────────────────────────
router.post('/register-token',    auth, ctrl.registerToken);
router.get('/',                   auth, ctrl.getNotifications);
router.put('/mark-all-read',      auth, ctrl.markAllRead);
router.put('/:id/read',           auth, ctrl.markRead);
router.get('/preferences',        auth, ctrl.getPreferences);
router.put('/preferences',        auth, ctrl.updatePreferences);

module.exports = router;
