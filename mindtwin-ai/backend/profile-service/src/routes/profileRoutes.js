const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');
const auth = require('../middleware/auth');
const {
  validateRequest,
  updateProfileValidation,
  onboardingValidation,
  addExamValidation,
} = require('../middleware/validateRequest');

// Profile
router.get('/', auth, profileController.getProfile);
router.put('/', auth, updateProfileValidation, validateRequest, profileController.updateProfile);

// Onboarding
router.post('/onboarding/complete', auth, onboardingValidation, validateRequest, profileController.completeOnboarding);

// Exams
router.post('/exams', auth, addExamValidation, validateRequest, profileController.addExam);
router.get('/exams', auth, profileController.getExams);
router.delete('/exams/:examId', auth, profileController.deleteExam);

// Digital Twin
router.get('/twin', auth, profileController.getTwinStats);

// Topic Progress
router.get('/progress', auth, profileController.getTopicProgress);

module.exports = router;
