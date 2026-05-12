const { validationResult, check } = require('express-validator');

const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
};

const registerValidation = [
  check('name',        'Name is required').notEmpty(),
  check('email',       'Please include a valid email').isEmail(),
  check('password',    'Please enter a password with 8 or more characters').isLength({ min: 8 }),
  check('grade_level', 'Grade level is required').notEmpty(),
  check('board',       'Board is required').notEmpty(),
];

const loginValidation = [
  check('email',    'Please include a valid email').isEmail(),
  check('password', 'Password is required').exists(),
];

const refreshValidation = [
  check('refreshToken', 'Refresh token is required').notEmpty(),
];

const otpValidation = [
  check('otp', 'OTP must be a 6-digit code')
    .notEmpty()
    .isLength({ min: 6, max: 6 })
    .isNumeric(),
];

module.exports = {
  validateRequest,
  registerValidation,
  loginValidation,
  refreshValidation,
  otpValidation,
};
