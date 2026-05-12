const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/adminController');
const jwt     = require('jsonwebtoken');

// ── Admin JWT middleware (inline — keeps auth-service as single source of truth) ──
const verifyAdminAuth = (req, res, next) => {
  const authHeader = req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'No token, authorization denied' });
  }
  try {
    const decoded = jwt.verify(
      authHeader.split(' ')[1],
      process.env.JWT_SECRET || 'supersecret'
    );
    if (!decoded.admin_id || decoded.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin token required' });
    }
    req.user = decoded;
    next();
  } catch (err) {
    const status = err.name === 'TokenExpiredError' ? 403 : 401;
    res.status(status).json({ success: false, error: err.message });
  }
};

router.use(verifyAdminAuth);

router.get('/stats',                  ctrl.getPlatformStats);
router.get('/students',               ctrl.getStudents);
router.get('/students/:id',           ctrl.getStudentDetail);
router.get('/guardians',              ctrl.getGuardians);
router.get('/notification-history',   ctrl.getNotificationHistory);

module.exports = router;
