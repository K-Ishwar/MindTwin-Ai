'use strict';


const logger = require('../../../../shared/logger');\n/**
 * OTP Email Controller
 * Called internally by auth-service after generating a verification OTP.
 * Sends a clean HTML email with the 6-digit code.
 */

const nodemailer = require('nodemailer');

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'internal-secret';

// Reuse the same transporter config as emailService
const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST || 'smtp.gmail.com',
  port:   parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * POST /api/notifications/send-otp-email  (internal, x-api-key protected)
 * Body: { student_id, email, name, otp }
 */
exports.sendOTPEmail = async (req, res, next) => {
  try {
    const apiKey = req.header('x-api-key');
    if (apiKey !== INTERNAL_API_KEY) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const { email, name, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ success: false, error: 'email and otp are required' });
    }

    const html = buildOTPEmail(name || 'Student', String(otp));

    await transporter.sendMail({
      from:    `"MindTwin AI" <${process.env.SMTP_FROM || 'noreply@mindtwin.ai'}>`,
      to:      email,
      subject: 'Your MindTwin verification code',
      html,
      text:    `Hi ${name},\n\nYour MindTwin verification code is: ${otp}\n\nThis code expires in 10 minutes.\n\nIf you didn't create an account, ignore this email.`,
    });

    res.json({ success: true, message: 'OTP email sent' });
  } catch (err) {
    // Non-fatal from caller's perspective â€” log and return 500 so caller can warn
    logger.error('[otpController] Failed to send OTP email:', err.message);
    res.status(500).json({ success: false, error: 'Failed to send OTP email' });
  }
};

// â”€â”€ HTML template â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function buildOTPEmail(name, otp) {
  // Split OTP into individual digit boxes for visual clarity
  const digits = otp.split('').map((d) =>
    `<td style="width:44px;height:52px;background:#1E293B;border:2px solid #6366F1;border-radius:10px;text-align:center;vertical-align:middle;font-size:28px;font-weight:900;color:#FFFFFF;font-family:monospace;">${d}</td>
     <td style="width:8px;"></td>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Verify your MindTwin account</title>
</head>
<body style="margin:0;padding:0;background-color:#0F172A;font-family:Arial,Helvetica,sans-serif;">
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#0F172A;min-height:100vh;">
  <tr>
    <td align="center" style="padding:40px 16px;">
      <table cellpadding="0" cellspacing="0" border="0" width="480" style="max-width:480px;width:100%;">

        <!-- Card -->
        <tr>
          <td style="background:#1E293B;border-radius:20px;padding:40px 36px;border:1px solid #334155;">

            <!-- Logo -->
            <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
              <tr>
                <td style="background:#6366F1;border-radius:12px;width:44px;height:44px;text-align:center;vertical-align:middle;font-size:22px;">ðŸ§¬</td>
                <td style="padding-left:12px;vertical-align:middle;">
                  <span style="font-size:18px;font-weight:800;color:#FFFFFF;">MindTwin</span>
                </td>
              </tr>
            </table>

            <!-- Heading -->
            <h1 style="margin:0 0 8px;font-size:24px;font-weight:900;color:#FFFFFF;">Verify your email</h1>
            <p style="margin:0 0 28px;font-size:15px;color:#94A3B8;line-height:1.6;">
              Hi ${esc(name)}, enter this code in the MindTwin app to verify your email address.
            </p>

            <!-- OTP digit boxes -->
            <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
              <tr>${digits}</tr>
            </table>

            <!-- Expiry note -->
            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:28px;">
              <tr>
                <td style="background:#0F172A;border-radius:10px;padding:12px 16px;border:1px solid #334155;">
                  <p style="margin:0;font-size:13px;color:#64748B;">
                    â± This code expires in <strong style="color:#F59E0B;">10 minutes</strong>.
                    If you didn't create a MindTwin account, you can safely ignore this email.
                  </p>
                </td>
              </tr>
            </table>

            <!-- Footer note -->
            <p style="margin:0;font-size:12px;color:#334155;text-align:center;">
              Â© ${new Date().getFullYear()} MindTwin AI Â· noreply@mindtwin.app
            </p>

          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
