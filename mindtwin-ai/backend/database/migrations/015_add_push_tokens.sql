-- Migration 015: Push tokens for students and guardians + notification templates

-- Students push token (idempotent — column may already exist from earlier migration)
ALTER TABLE students ADD COLUMN IF NOT EXISTS push_token TEXT;

-- Guardian push token
ALTER TABLE guardian_accounts ADD COLUMN IF NOT EXISTS push_token TEXT;

-- ── Notification templates ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notification_templates (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_key   VARCHAR(100) UNIQUE NOT NULL,
    title_template VARCHAR(255) NOT NULL,
    body_template  TEXT NOT NULL,
    category       VARCHAR(50),
    priority       VARCHAR(20) DEFAULT 'normal'
);

INSERT INTO notification_templates (template_key, title_template, body_template, category, priority) VALUES
  ('stress_high',        'Check in with yourself 💙',          'Your stress indicators are elevated. Take a moment to breathe.',                                    'wellness',    'high'),
  ('stress_critical',    'You deserve a break 🌿',              'High stress detected. Your study plan has been adjusted for today.',                                 'wellness',    'high'),
  ('session_reminder',   'Study time! 📚',                      'Your {{topic_name}} session starts in 15 minutes.',                                                  'study',       'normal'),
  ('quiz_reminder',      'Quick quiz check 🎯',                  'You have {{topic_name}} flagged as a gap. Take a 5-min quiz?',                                       'quiz',        'normal'),
  ('streak_at_risk',     'Keep your streak alive! 🔥',           'Study for just 25 minutes today to maintain your {{streak_days}}-day streak.',                       'motivation',  'normal'),
  ('streak_milestone',   'Amazing streak! 🎉',                   'You''ve studied for {{streak_days}} days in a row. You''re unstoppable!',                            'motivation',  'low'),
  ('gap_detected',       'Gap found in {{topic_name}} 🔍',       'Your quiz revealed a gap. Your study plan has been updated to fix it.',                              'academic',    'normal'),
  ('plan_updated',       'Study plan updated 📅',                'Your plan has been revised. Check today''s new sessions.',                                           'academic',    'normal'),
  ('exam_week',          'Exam week ahead! 📝',                  '{{subject}} exam in {{days}} days. You''ve got this!',                                               'academic',    'high'),
  ('guardian_linked',    'Access approved ✅',                   '{{guardian_name}} can now view your progress dashboard.',                                            'account',     'low'),
  ('token_milestone',    'Token milestone! 🏆',                  'You''ve earned {{token_count}} tokens total. Great discipline!',                                     'reward',      'low')
ON CONFLICT (template_key) DO UPDATE
  SET title_template = EXCLUDED.title_template,
      body_template  = EXCLUDED.body_template,
      category       = EXCLUDED.category,
      priority       = EXCLUDED.priority;
