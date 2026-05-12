const express = require('express');
const router = express.Router();
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

module.exports = router;
