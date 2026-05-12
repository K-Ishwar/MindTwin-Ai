/**
 * Email Service — Phase 8.5
 * Sends weekly digest emails via nodemailer.
 * Uses table-based, inline-styled HTML for maximum email client compatibility.
 */

'use strict';

const nodemailer = require('nodemailer');

// ── Transport ─────────────────────────────────────────────────────────────────

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST || 'smtp.gmail.com',
  port:   parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true', // true for 465, false for 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Verify transport on startup (non-fatal — email is best-effort)
transporter.verify().then(() => {
  console.log('[emailService] SMTP transport ready');
}).catch((err) => {
  console.warn('[emailService] SMTP not configured or unreachable:', err.message);
});

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Send a weekly digest email to a student.
 * @param {{ id: string, name: string, email: string }} student
 * @param {object} digestData  — shape from /api/ai/analytics/weekly-digest
 */
async function sendWeeklyDigestEmail(student, digestData) {
  const html = generateDigestHTML(student, digestData);
  const dateLabel = new Date().toLocaleDateString('en-IN', { month: 'long', day: 'numeric' });

  await transporter.sendMail({
    from:    `"MindTwin AI" <${process.env.SMTP_FROM || 'noreply@mindtwin.ai'}>`,
    to:      student.email,
    subject: `Your Week in Review — ${dateLabel}`,
    html,
    // Plain-text fallback
    text: buildPlainText(student, digestData),
  });
}

module.exports = { sendWeeklyDigestEmail };

// ── HTML Generator ────────────────────────────────────────────────────────────

function generateDigestHTML(student, digest) {
  const {
    study_stats   = {},
    quiz_stats    = {},
    top_subjects  = [],
    study_streak  = 0,
    week_summary  = '',
    generated_at  = new Date().toISOString(),
  } = digest || {};

  const totalMins    = parseInt(study_stats.total_mins    || 0, 10);
  const totalHours   = (totalMins / 60).toFixed(1);
  const totalSessions= parseInt(study_stats.total_sessions || 0, 10);
  const activeDays   = parseInt(study_stats.active_days   || 0, 10);
  const avgScore     = parseFloat(quiz_stats.avg_score    || 0).toFixed(0);
  const quizCount    = parseInt(quiz_stats.quiz_count     || 0, 10);

  // Best moment: highest-scoring subject or streak
  const bestSubject  = top_subjects[0]?.subject || null;
  const bestMins     = top_subjects[0]?.mins    || 0;

  // Subject bar chart — max bar width 200px
  const maxMins = top_subjects.reduce((m, s) => Math.max(m, s.mins || 0), 1);
  const subjectBars = top_subjects.slice(0, 5).map((s) => {
    const pct   = Math.round(((s.mins || 0) / maxMins) * 100);
    const color = SUBJECT_COLORS[s.subject] || '#6366F1';
    const hrs   = ((s.mins || 0) / 60).toFixed(1);
    return `
      <tr>
        <td style="padding:4px 0;font-size:13px;color:#94A3B8;width:90px;vertical-align:middle;">${esc(s.subject)}</td>
        <td style="padding:4px 8px;vertical-align:middle;">
          <table cellpadding="0" cellspacing="0" border="0" style="width:200px;">
            <tr>
              <td style="background:#1E293B;border-radius:4px;height:10px;overflow:hidden;">
                <div style="width:${pct}%;height:10px;background:${color};border-radius:4px;"></div>
              </td>
            </tr>
          </table>
        </td>
        <td style="padding:4px 0;font-size:12px;color:#64748B;white-space:nowrap;">${hrs}h</td>
      </tr>`;
  }).join('');

  // Streak fire emoji
  const streakEmoji = study_streak >= 7 ? '🔥' : study_streak >= 3 ? '⚡' : '📅';

  const appUrl = process.env.APP_URL || 'https://mindtwin.app';
  const unsubUrl = `${appUrl}/unsubscribe?email=${encodeURIComponent(student.email)}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Your Week in Review — MindTwin</title>
</head>
<body style="margin:0;padding:0;background-color:#0F172A;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">

<!-- Outer wrapper -->
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#0F172A;min-height:100vh;">
  <tr>
    <td align="center" style="padding:24px 16px;">

      <!-- Email card — max 600px -->
      <table cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;">

        <!-- ══ SECTION 1: HEADER ══ -->
        <tr>
          <td style="background:linear-gradient(135deg,#1E293B 0%,#0F172A 100%);border-radius:16px 16px 0 0;padding:32px 32px 24px;border:1px solid #334155;border-bottom:none;">
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td>
                  <!-- Logo row -->
                  <table cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="background:#6366F1;border-radius:12px;width:44px;height:44px;text-align:center;vertical-align:middle;font-size:22px;">🧬</td>
                      <td style="padding-left:12px;vertical-align:middle;">
                        <span style="font-size:18px;font-weight:800;color:#FFFFFF;letter-spacing:-0.5px;">MindTwin</span>
                        <span style="font-size:11px;color:#6366F1;display:block;margin-top:1px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">AI Study Companion</span>
                      </td>
                    </tr>
                  </table>
                </td>
                <td align="right" style="vertical-align:middle;">
                  <span style="font-size:11px;color:#475569;">${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
                </td>
              </tr>
            </table>

            <!-- Greeting -->
            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:28px;">
              <tr>
                <td>
                  <p style="margin:0;font-size:13px;color:#6366F1;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Weekly Digest</p>
                  <h1 style="margin:6px 0 0;font-size:28px;font-weight:900;color:#FFFFFF;line-height:1.2;">
                    Hi ${esc(student.name)},<br>
                    <span style="color:#6366F1;">here's your week</span> 👋
                  </h1>
                  ${week_summary ? `<p style="margin:12px 0 0;font-size:15px;color:#94A3B8;line-height:1.6;">${esc(week_summary)}</p>` : ''}
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ══ SECTION 2: THIS WEEK AT A GLANCE (2×2 stat grid) ══ -->
        <tr>
          <td style="background:#1E293B;padding:24px 32px;border-left:1px solid #334155;border-right:1px solid #334155;">
            <p style="margin:0 0 16px;font-size:13px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:1px;">This Week at a Glance</p>
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <!-- Study Hours -->
                <td width="48%" style="background:#0F172A;border-radius:12px;padding:16px;border:1px solid #334155;vertical-align:top;">
                  <p style="margin:0;font-size:28px;font-weight:900;color:#6366F1;">${totalHours}<span style="font-size:14px;color:#64748B;font-weight:600;">h</span></p>
                  <p style="margin:4px 0 0;font-size:12px;color:#64748B;font-weight:600;">Study Hours</p>
                  <p style="margin:4px 0 0;font-size:11px;color:#475569;">${activeDays} active days</p>
                </td>
                <td width="4%"></td>
                <!-- Sessions -->
                <td width="48%" style="background:#0F172A;border-radius:12px;padding:16px;border:1px solid #334155;vertical-align:top;">
                  <p style="margin:0;font-size:28px;font-weight:900;color:#3B82F6;">${totalSessions}</p>
                  <p style="margin:4px 0 0;font-size:12px;color:#64748B;font-weight:600;">Sessions</p>
                  <p style="margin:4px 0 0;font-size:11px;color:#475569;">Completed this week</p>
                </td>
              </tr>
              <tr><td colspan="3" style="height:10px;"></td></tr>
              <tr>
                <!-- Avg Quiz Score -->
                <td width="48%" style="background:#0F172A;border-radius:12px;padding:16px;border:1px solid #334155;vertical-align:top;">
                  <p style="margin:0;font-size:28px;font-weight:900;color:#22C55E;">${avgScore}<span style="font-size:14px;color:#64748B;font-weight:600;">%</span></p>
                  <p style="margin:4px 0 0;font-size:12px;color:#64748B;font-weight:600;">Avg Quiz Score</p>
                  <p style="margin:4px 0 0;font-size:11px;color:#475569;">${quizCount} quiz${quizCount !== 1 ? 'zes' : ''} taken</p>
                </td>
                <td width="4%"></td>
                <!-- Streak -->
                <td width="48%" style="background:#0F172A;border-radius:12px;padding:16px;border:1px solid #334155;vertical-align:top;">
                  <p style="margin:0;font-size:28px;font-weight:900;color:#F59E0B;">${study_streak} ${streakEmoji}</p>
                  <p style="margin:4px 0 0;font-size:12px;color:#64748B;font-weight:600;">Day Streak</p>
                  <p style="margin:4px 0 0;font-size:11px;color:#475569;">${study_streak >= 7 ? 'On fire! Keep going' : study_streak >= 3 ? 'Building momentum' : 'Start your streak'}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ══ SECTION 3: BEST MOMENT ══ -->
        ${bestSubject ? `
        <tr>
          <td style="background:#1E293B;padding:0 32px 24px;border-left:1px solid #334155;border-right:1px solid #334155;">
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="background:linear-gradient(135deg,#6366F120,#8B5CF620);border:1px solid #6366F140;border-radius:12px;padding:16px;">
                  <table cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr>
                      <td style="vertical-align:middle;">
                        <p style="margin:0;font-size:11px;font-weight:700;color:#6366F1;text-transform:uppercase;letter-spacing:1px;">⭐ Best Moment</p>
                        <p style="margin:6px 0 0;font-size:16px;font-weight:800;color:#FFFFFF;">Most time in ${esc(bestSubject)}</p>
                        <p style="margin:4px 0 0;font-size:13px;color:#94A3B8;">${((bestMins || 0) / 60).toFixed(1)} hours of focused study — your strongest subject this week.</p>
                      </td>
                      <td style="vertical-align:middle;text-align:right;padding-left:16px;font-size:36px;">🏆</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>` : ''}

        <!-- ══ SECTION 4: SUBJECT PROGRESS BARS ══ -->
        ${top_subjects.length > 0 ? `
        <tr>
          <td style="background:#1E293B;padding:0 32px 24px;border-left:1px solid #334155;border-right:1px solid #334155;">
            <p style="margin:0 0 14px;font-size:13px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:1px;">Subject Breakdown</p>
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
              ${subjectBars}
            </table>
          </td>
        </tr>` : ''}

        <!-- ══ SECTION 5: TOP INSIGHTS ══ -->
        ${(digest.insights || []).length > 0 ? `
        <tr>
          <td style="background:#1E293B;padding:0 32px 24px;border-left:1px solid #334155;border-right:1px solid #334155;">
            <p style="margin:0 0 14px;font-size:13px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:1px;">💡 Top Insights</p>
            ${(digest.insights || []).slice(0, 3).map((ins) => `
            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:8px;">
              <tr>
                <td style="background:#0F172A;border-radius:10px;padding:12px 14px;border-left:3px solid #6366F1;">
                  <p style="margin:0;font-size:13px;font-weight:700;color:#FFFFFF;">${esc(ins.title || '')}</p>
                  ${ins.body ? `<p style="margin:4px 0 0;font-size:12px;color:#64748B;line-height:1.5;">${esc(ins.body)}</p>` : ''}
                </td>
              </tr>
            </table>`).join('')}
          </td>
        </tr>` : ''}

        <!-- ══ SECTION 6: NEXT WEEK PREVIEW ══ -->
        ${(digest.upcoming_exams || []).length > 0 || (digest.priority_topics || []).length > 0 ? `
        <tr>
          <td style="background:#1E293B;padding:0 32px 24px;border-left:1px solid #334155;border-right:1px solid #334155;">
            <p style="margin:0 0 14px;font-size:13px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:1px;">📅 Next Week Preview</p>
            ${(digest.upcoming_exams || []).slice(0, 3).map((e) => `
            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:8px;">
              <tr>
                <td style="background:#EF444415;border:1px solid #EF444430;border-radius:10px;padding:10px 14px;">
                  <p style="margin:0;font-size:13px;font-weight:700;color:#F87171;">📝 ${esc(e.subject)} — ${e.days_remaining}d left</p>
                  ${e.exam_date ? `<p style="margin:3px 0 0;font-size:11px;color:#64748B;">${new Date(e.exam_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}</p>` : ''}
                </td>
              </tr>
            </table>`).join('')}
            ${(digest.priority_topics || []).length > 0 ? `
            <p style="margin:12px 0 8px;font-size:12px;color:#64748B;font-weight:600;">Priority topics to cover:</p>
            ${(digest.priority_topics || []).slice(0, 3).map((t) => `
            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:6px;">
              <tr>
                <td style="padding:2px 0;">
                  <span style="display:inline-block;width:6px;height:6px;background:#6366F1;border-radius:50%;vertical-align:middle;margin-right:8px;"></span>
                  <span style="font-size:13px;color:#CBD5E1;">${esc(t)}</span>
                </td>
              </tr>
            </table>`).join('')}` : ''}
          </td>
        </tr>` : ''}

        <!-- ══ SECTION 7: CTA BUTTON ══ -->
        <tr>
          <td style="background:#1E293B;padding:0 32px 32px;border-left:1px solid #334155;border-right:1px solid #334155;">
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td align="center">
                  <a href="${appUrl}/progress"
                     style="display:inline-block;background:linear-gradient(135deg,#6366F1,#8B5CF6);color:#FFFFFF;font-size:15px;font-weight:800;text-decoration:none;padding:14px 36px;border-radius:12px;letter-spacing:0.3px;">
                    Open MindTwin →
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ══ SECTION 8: FOOTER ══ -->
        <tr>
          <td style="background:#0F172A;border-radius:0 0 16px 16px;padding:20px 32px;border:1px solid #334155;border-top:1px solid #1E293B;">
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="text-align:center;">
                  <p style="margin:0;font-size:12px;color:#475569;">
                    You're receiving this because you have an active MindTwin account.
                  </p>
                  <p style="margin:8px 0 0;font-size:12px;color:#334155;">
                    <a href="${unsubUrl}" style="color:#475569;text-decoration:underline;">Unsubscribe from weekly digests</a>
                    &nbsp;·&nbsp;
                    <a href="${appUrl}" style="color:#475569;text-decoration:underline;">mindtwin.app</a>
                  </p>
                  <p style="margin:12px 0 0;font-size:11px;color:#1E293B;">
                    © ${new Date().getFullYear()} MindTwin AI. All rights reserved.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>
      <!-- /Email card -->

    </td>
  </tr>
</table>
<!-- /Outer wrapper -->

</body>
</html>`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Escape HTML special characters for safe inline insertion */
function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const SUBJECT_COLORS = {
  Mathematics: '#6366F1',
  Physics:     '#3B82F6',
  Chemistry:   '#10B981',
  Biology:     '#F59E0B',
  History:     '#EC4899',
  English:     '#8B5CF6',
};

/** Plain-text fallback for email clients that don't render HTML */
function buildPlainText(student, digest) {
  const { study_stats = {}, quiz_stats = {}, study_streak = 0, week_summary = '' } = digest || {};
  const hrs = ((parseInt(study_stats.total_mins || 0, 10)) / 60).toFixed(1);
  return [
    `Hi ${student.name}, here's your MindTwin weekly digest`,
    '─'.repeat(40),
    week_summary,
    '',
    `Study Hours:   ${hrs}h`,
    `Sessions:      ${study_stats.total_sessions || 0}`,
    `Avg Quiz Score:${parseFloat(quiz_stats.avg_score || 0).toFixed(0)}%`,
    `Study Streak:  ${study_streak} days`,
    '',
    'Open MindTwin: https://mindtwin.app/progress',
    '',
    'To unsubscribe, visit: https://mindtwin.app/unsubscribe',
  ].join('\n');
}
