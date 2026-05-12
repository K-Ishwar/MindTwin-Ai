'use strict';

const express = require('express');
const router  = express.Router();
const authController = require('../controllers/authController');
const {
  validateRequest,
  registerValidation,
  loginValidation,
  refreshValidation,
  guardianRegisterValidation,
  guardianLoginValidation,
  updateGuardianValidation,
  linkStudentValidation,
} = require('../middleware/validateRequest');
const { verifyStudentAuth, verifyGuardianAuth } = require('../middleware/auth');
const auth = require('../middleware/auth');   // verifyAnyAuth (default export)

// ── Student routes ────────────────────────────────────────────────────────────
router.post('/register',  registerValidation,  validateRequest, authController.register);
router.post('/login',     loginValidation,     validateRequest, authController.login);
router.post('/refresh',   refreshValidation,   validateRequest, authController.refreshToken);
router.post('/logout',    auth,                                 authController.logout);
router.get('/me',         verifyStudentAuth,                    authController.getMe);

// Email verification
router.post('/verify-email',        verifyStudentAuth, authController.verifyEmail);
router.post('/resend-verification', verifyStudentAuth, authController.resendVerification);

// Student sees all guardian requests addressed to them
router.get('/student/guardian-requests', verifyStudentAuth, authController.studentGetGuardianRequests);

// ── Guardian routes ───────────────────────────────────────────────────────────
router.post('/guardian/register', guardianRegisterValidation, validateRequest, authController.guardianRegister);
router.post('/guardian/login',    guardianLoginValidation,    validateRequest, authController.guardianLogin);

router.get('/guardian/me',  verifyGuardianAuth,                                           authController.guardianGetMe);
router.put('/guardian/me',  verifyGuardianAuth, updateGuardianValidation, validateRequest, authController.guardianUpdateMe);

router.post('/guardian/link-student',         verifyGuardianAuth, linkStudentValidation, validateRequest, authController.linkStudent);
router.post('/guardian/approve-link/:linkId', verifyStudentAuth,                          authController.approveLink);
router.post('/guardian/reject-link/:linkId',  verifyStudentAuth,                          authController.rejectLink);

router.get('/guardian/pending-links',  verifyGuardianAuth, authController.guardianPendingLinks);
router.delete('/guardian/link/:linkId',verifyGuardianAuth, authController.guardianUnlinkStudent);
router.get('/guardian/students',       verifyGuardianAuth, authController.getMyStudents);

// ── Admin routes ──────────────────────────────────────────────────────────────
router.post('/admin/login', authController.adminLogin);

module.exports = router;
