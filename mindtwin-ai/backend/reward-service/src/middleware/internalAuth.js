/**
 * Internal API key middleware.
 * Used for service-to-service calls (scheduler, quiz) that award/deduct tokens.
 * Key is set in env: INTERNAL_API_KEY
 * Header expected: X-Internal-Key: <key>
 */
module.exports = (req, res, next) => {
  const internalKey = process.env.INTERNAL_API_KEY || 'mindtwin-internal-secret';
  const provided = req.header('X-Internal-Key');

  if (!provided || provided !== internalKey) {
    return res.status(403).json({ success: false, error: 'Forbidden: invalid internal API key' });
  }
  next();
};
