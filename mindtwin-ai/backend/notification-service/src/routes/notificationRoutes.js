const express = require('express');
const router = express.Router();
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

module.exports = router;
