const db = require('../config/db');

// POST /api/notifications/send (Internal API)
exports.sendNotification = async (req, res, next) => {
  try {
    // API key check
    const apiKey = req.header('x-api-key');
    const validKey = process.env.INTERNAL_API_KEY || 'internal-secret';
    if (apiKey !== validKey) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const { student_id, type, title, body, data = {} } = req.body;
    if (!student_id || !title || !body) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const result = await db.query(
      `INSERT INTO notifications (student_id, type, title, body, data)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [student_id, type || 'general', title, body, JSON.stringify(data)]
    );

    res.json({ success: true, notification_id: result.rows[0].id });
  } catch (err) {
    console.error('Error sending notification:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// GET /api/notifications/
exports.getNotifications = async (req, res, next) => {
  try {
    const { student_id } = req.user;

    const result = await db.query(
      `SELECT id, type, title, body, data, read, created_at
       FROM notifications
       WHERE student_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [student_id]
    );

    const unreadCountResult = await db.query(
      `SELECT COUNT(*) FROM notifications WHERE student_id = $1 AND read = FALSE`,
      [student_id]
    );
    const unread_count = parseInt(unreadCountResult.rows[0].count, 10);

    res.json({ success: true, notifications: result.rows, unread_count });
  } catch (err) {
    console.error('Error fetching notifications:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// PUT /api/notifications/:id/read
exports.markRead = async (req, res, next) => {
  try {
    const { student_id } = req.user;
    const { id } = req.params;

    await db.query(
      `UPDATE notifications SET read = TRUE WHERE id = $1 AND student_id = $2`,
      [id, student_id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Error marking notification read:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// POST /api/notifications/register-token
exports.registerToken = async (req, res, next) => {
  try {
    const { student_id } = req.user;
    const { push_token } = req.body;

    if (!push_token) {
      return res.status(400).json({ success: false, error: 'push_token is required' });
    }

    await db.query(
      `UPDATE students SET push_token = $1 WHERE id = $2`,
      [push_token, student_id]
    );

    res.json({ success: true, message: 'Push token registered successfully' });
  } catch (err) {
    console.error('Error registering push token:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
