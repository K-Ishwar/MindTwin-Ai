const express = require('express');
const router = express.Router();
const { getBaselineQuestions, getTopicQuestions, submitAttempt } = require('../controllers/quizController');
const auth = require('../middleware/auth');

// Public — called during onboarding before full login
router.get('/baseline-questions', getBaselineQuestions);

// Protected
router.get('/questions/:topicId', auth, getTopicQuestions);
router.post('/attempt', auth, submitAttempt);

module.exports = router;
