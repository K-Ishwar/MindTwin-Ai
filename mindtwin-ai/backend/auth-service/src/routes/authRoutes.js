const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const {
  validateRequest,
  registerValidation,
  loginValidation,
  refreshValidation,
  otpValidation,
} = require('../middleware/validateRequest');
const auth = require('../middleware/auth');

router.post('/register',             registerValidation, validateRequest, authController.register);
router.post('/login',                loginValidation,    validateRequest, authController.login);
router.post('/refresh',              refreshValidation,  validateRequest, authController.refreshToken);
router.post('/logout',               auth, authController.logout);
router.get('/me',                    auth, authController.getMe);

// Email verification
router.post('/verify-email',         auth, otpValidation, validateRequest, authController.verifyEmail);
router.post('/resend-verification',  auth, authController.resendVerification);

module.exports = router;
