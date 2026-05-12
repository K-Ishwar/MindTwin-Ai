const express = require('express');
const router = express.Router();
const { sendNotification, getNotifications, markRead, registerToken } = require('../controllers/notificationController');
const auth = require('../middleware/auth');

router.post('/register-token', auth, registerToken); // auth required
router.post('/send', sendNotification); // internal
router.get('/', auth, getNotifications); // auth required
router.put('/:id/read', auth, markRead); // auth required

module.exports = router;
