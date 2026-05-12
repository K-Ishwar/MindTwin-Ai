const { validationResult, check } = require('express-validator');

const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
};

// ─── Student validations ──────────────────────────────────────────────────────

const registerValidation = [
  check('name', 'Name is required').notEmpty(),
  check('email', 'Please include a valid email').isEmail(),
  check('password', 'Please enter a password with 8 or more characters').isLength({ min: 8 }),
  check('grade_level', 'Grade level is required').notEmpty(),
  check('board', 'Board is required').notEmpty()
];

const loginValidation = [
  check('email', 'Please include a valid email').isEmail(),
  check('password', 'Password is required').exists()
];

const refreshValidation = [
  check('refreshToken', 'Refresh token is required').notEmpty()
];

// ─── Guardian validations ─────────────────────────────────────────────────────

const guardianRegisterValidation = [
  check('name', 'Name is required').notEmpty().trim(),
  check('email', 'Please include a valid email').isEmail().normalizeEmail(),
  check('password', 'Please enter a password with 8 or more characters').isLength({ min: 8 }),
  check('role', 'Role must be "parent" or "teacher"').isIn(['parent', 'teacher']),
  check('institution_name').optional().trim()
];

const guardianLoginValidation = [
  check('email', 'Please include a valid email').isEmail().normalizeEmail(),
  check('password', 'Password is required').exists()
];

const linkStudentValidation = [
  check('student_email', 'A valid student email is required').isEmail().normalizeEmail()
];

const updateGuardianValidation = [
  check('name').optional().trim().notEmpty().withMessage('Name cannot be blank'),
  check('institution_name').optional().trim()
];

module.exports = {
  validateRequest,
  // Student
  registerValidation,
  loginValidation,
  refreshValidation,
  // Guardian
  guardianRegisterValidation,
  guardianLoginValidation,
  updateGuardianValidation,
  linkStudentValidation
};
