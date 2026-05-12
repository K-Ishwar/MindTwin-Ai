const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const {
  validateRequest,
  registerValidation,
  loginValidation,
  refreshValidation,
  guardianRegisterValidation,
  guardianLoginValidation,
  updateGuardianValidation,
  linkStudentValidation
} = require('../middleware/validateRequest');
const auth = require('../middleware/auth');
const { verifyStudentAuth, verifyGuardianAuth } = require('../middleware/auth');

// ─── Student routes ───────────────────────────────────────────────────────────
router.post('/register',  registerValidation,  validateRequest, authController.register);
router.post('/login',     loginValidation,     validateRequest, authController.login);
router.post('/refresh',   refreshValidation,   validateRequest, authController.refreshToken);
router.post('/logout',    auth,                                 authController.logout);
router.get('/me',         verifyStudentAuth,                    authController.getMe);

// Student sees all guardian requests addressed to them (pending + history)
router.get('/student/guardian-requests', verifyStudentAuth, authController.studentGetGuardianRequests);

// ─── Guardian routes ──────────────────────────────────────────────────────────

// Auth
router.post('/guardian/register', guardianRegisterValidation, validateRequest, authController.guardianRegister);
router.post('/guardian/login',    guardianLoginValidation,    validateRequest, authController.guardianLogin);

// Guardian profile — view & update own account
router.get('/guardian/me',  verifyGuardianAuth,                                         authController.guardianGetMe);
router.put('/guardian/me',  verifyGuardianAuth, updateGuardianValidation, validateRequest, authController.guardianUpdateMe);

// Links — guardian initiates; student approves/rejects
router.post('/guardian/link-student',          verifyGuardianAuth, linkStudentValidation, validateRequest, authController.linkStudent);
router.post('/guardian/approve-link/:linkId',  verifyStudentAuth,                         authController.approveLink);
router.post('/guardian/reject-link/:linkId',   verifyStudentAuth,                         authController.rejectLink);

// Guardian views pending (awaiting student approval) and removes a link
router.get('/guardian/pending-links',          verifyGuardianAuth, authController.guardianPendingLinks);
router.delete('/guardian/link/:linkId',        verifyGuardianAuth, authController.guardianUnlinkStudent);

// Guardian views approved linked students
router.get('/guardian/students', verifyGuardianAuth, authController.getMyStudents);

module.exports = router;
