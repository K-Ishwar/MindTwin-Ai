const express = require('express');
const router = express.Router();
const stressController = require('../controllers/stressController');
const auth = require('../middleware/auth');

router.get('/current', auth, stressController.getCurrentStress);
router.get('/history', auth, stressController.getStressHistory);
router.post('/mood', auth, stressController.logMood);
router.post('/intervention/acknowledge', auth, stressController.acknowledgeIntervention);
router.get('/wellness', auth, stressController.getWellnessSummary);

module.exports = router;
