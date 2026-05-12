const express = require('express');
const router = express.Router();
<<<<<<< HEAD
const { sendNotification, getNotifications, markRead, registerToken } = require('../controllers/notificationController');
const { sendWeeklyDigest } = require('../controllers/weeklyDigestController');
const { sendOTPEmail }     = require('../controllers/otpController');
const auth = require('../middleware/auth');

router.post('/register-token',      auth, registerToken);   // auth required
router.post('/send',                sendNotification);       // internal (x-api-key)
router.post('/send-weekly-digest',  sendWeeklyDigest);       // internal (x-api-key)
router.post('/send-otp-email',      sendOTPEmail);           // internal (x-api-key)
router.get('/',                     auth, getNotifications); // auth required
router.put('/:id/read',             auth, markRead);         // auth required
=======
const ctrl = require('../controllers/notificationController');
const auth = require('../middleware/auth');

// ── Internal (API key protected) ──────────────────────────────────────────────
router.post('/send',      ctrl.sendNotification);  // single send
router.post('/send-bulk', ctrl.sendBulk);          // multicast send

// ── Auth required (student or guardian JWT) ───────────────────────────────────
router.post('/register-token',    auth, ctrl.registerToken);
router.get('/',                   auth, ctrl.getNotifications);
router.put('/mark-all-read',      auth, ctrl.markAllRead);
router.put('/:id/read',           auth, ctrl.markRead);
router.get('/preferences',        auth, ctrl.getPreferences);
router.put('/preferences',        auth, ctrl.updatePreferences);
>>>>>>> cb4458a60e96d61275eb8dbf65c93cda4221c664

module.exports = router;
