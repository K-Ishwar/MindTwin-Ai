const express = require('express');
const router = express.Router();
const { sendNotification, getNotifications, markRead } = require('../controllers/notificationController');
const auth = require('../middleware/auth');

router.post('/send', sendNotification); // internal
router.get('/', auth, getNotifications); // auth required
router.put('/:id/read', auth, markRead); // auth required

module.exports = router;
