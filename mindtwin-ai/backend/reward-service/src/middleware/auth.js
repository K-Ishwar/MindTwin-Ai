const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  const authHeader = req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'No token, authorization denied' });
  }
  const token = authHeader.split(' ')[1];
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'supersecret');
    next();
  } catch (err) {
    const msg = err.name === 'TokenExpiredError' ? 'Token is expired' : 'Token is not valid';
    return res.status(err.name === 'TokenExpiredError' ? 403 : 401).json({ success: false, error: msg });
  }
};
