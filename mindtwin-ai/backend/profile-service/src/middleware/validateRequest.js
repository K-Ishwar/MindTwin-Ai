const { validationResult, check } = require('express-validator');

const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
};

const updateProfileValidation = [
  check('max_daily_study_hours').optional().isInt({ min: 1, max: 16 }),
  check('preferred_study_start_time').optional().matches(/^\d{2}:\d{2}$/),
];

const onboardingValidation = [
  check('exam_dates').isArray().withMessage('exam_dates must be an array'),
  check('exam_dates.*.subject').notEmpty().withMessage('Each exam must have a subject'),
  check('exam_dates.*.exam_date').isDate().withMessage('Each exam must have a valid date'),
];

const addExamValidation = [
  check('subject', 'Subject is required').notEmpty(),
  check('exam_date', 'A valid exam date is required').isDate(),
];

module.exports = {
  validateRequest,
  updateProfileValidation,
  onboardingValidation,
  addExamValidation,
};
