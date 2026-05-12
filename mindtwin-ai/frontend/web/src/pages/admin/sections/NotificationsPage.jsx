import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../../../api/adminApi';

const TEMPLATES = [
  { key: 'stress_high',      label: 'Stress High',       vars: [] },
  { key: 'stress_critical',  label: 'Stress Critical',   vars: [] },
  { key: 'session_reminder', label: 'Session Reminder',  vars: ['topic_name'] },
  { key: 'quiz_reminder',    label: 'Quiz Reminder',     vars: ['topic_name'] },
  { key: 'streak_at_risk',   label: 'Streak At Risk',    vars: ['streak_days'] },
  { key: 'streak_milestone', label: 'Streak Milestone',  vars: ['streak_days'] },
  { key: 'gap_detected',     label: 'Gap Detected',      vars: ['topic_name'] },
  { key: 'plan_updated',     label: 'Plan Updated',      vars: [] },
  { key: 'exam_week',        label: 'Exam Week',         vars: ['subject', 'days'] },
  { key: 'guardian_linked',  label: 'Guardian Linked',   vars: ['guardian_name'] },
  { key: 'token_milestone',  label: 'Token Milestone',   vars: ['token_count'] },
];

const TEMPLATE_PREVIEWS = {
  stress_high:      { title: 'Check in with yourself 💙', body: 'Your stress indicators are elevated. Take a moment to breathe.' },
  stress_critical:  { title: 'You deserve a break 🌿',    body: 'High stress detected. Your study plan has been adjusted for today.' },
  session_reminder: { title: 'Study time! 📚',            body: 'Your {{topic_name}} session starts in 15 minutes.' },
  quiz_reminder:    { title: 'Quick quiz check 🎯',        body: 'You have {{topic_name}} flagged as a gap. Take a 5-min quiz?' },
  streak_at_risk:   { title: 'Keep your streak alive! 🔥', body: 'Study for just 25 minutes today to maintain your {{streak_days}}-day streak.' },
  streak_milestone: { title: 'Amazing streak! 🎉',         body: "You've studied for {{streak_days}} days in a row. You're unstoppable!" },
  gap_detected:     { title: 'Gap found in {{topic_name}} 🔍', body: 'Your quiz revealed a gap. Your study plan has been updated to fix it.' },
  plan_updated:     { title: 'Study plan updated 📅',      body: "Your plan has been revised. Check today's new sessions." },
  exam_week:        { title: 'Exam week ahead! 📝',        body: '{{subject}} exam in {{days}} days. You\'ve got this!' },
  guardian_linked:  { title: 'Access approved ✅',         body: '{{guardian_name}} can now view your progress dashboard.' },
  token_milestone:  { title: 'Token milestone! 🏆',        body: "You've earned {{token_count}} tokens total. Great discipline!" },
};

function renderPreview(templateKey, vars) {
  const tpl = TEMPLATE_PREVIEWS[templateKey];
  if (!tpl) return { title: '', body: '' };
  const replace = (str) => str.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] || `{{${k}}}`);
  return { title: replace(tpl.title), body: replace(tpl.body) };
}

export default function NotificationsPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    recipient_type: 'student',
    recipient_id: '',
    template_key: 'plan_updated',
    vars: {},
  });
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);

  const { data: histData, isLoading: histLoading } = useQuery({
    queryKey: ['admin-notif-history'],
    queryFn: () => adminApi.getNotificationHistory(100),
    staleTime: 30_000,
  });

  const selectedTemplate = TEMPLATES.find((t) => t.key === form.template_key);
  const preview = renderPreview(form.template_key, form.vars);

  const handleSend = async () => {
    if (!form.recipient_id.trim()) {
      setSendResult({ error: 'Recipient ID is required' });
      return;
    }
    setSending(true);
    setSendResult(null);
    try {
      const res = await adminApi.sendNotification({
        recipient_type: form.recipient_type,
        recipient_id: form.recipient_id.trim(),
        template_key: form.template_key,
        template_vars: form.vars,
        data: {},
      });
      setSendResult({ success: true, fcm_sent: res.fcm_sent });
      qc.invalidateQueries({ queryKey: ['admin-notif-history'] });
    } catch (err) {
      setSendResult({ error: err.response?.data?.error || 'Send failed' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Send form */}
      <div className="rounded-2xl bg-slate-800/60 border border-slate-700/50 p-5 space-y-4">
        <h3 className="text-white font-semibold">📤 Send Manual Notification</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Recipient type */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Recipient Type</label>
            <select
              value={form.recipient_type}
              onChange={(e) => setForm({ ...form, recipient_type: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              <option value="student">Student</option>
              <option value="guardian">Guardian</option>
            </select>
          </div>

          {/* Recipient ID */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Recipient UUID</label>
            <input
              type="text"
              value={form.recipient_id}
              onChange={(e) => setForm({ ...form, recipient_id: e.target.value })}
              placeholder="Paste student or guardian UUID"
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>

          {/* Template */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Template</label>
            <select
              value={form.template_key}
              onChange={(e) => setForm({ ...form, template_key: e.target.value, vars: {} })}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              {TEMPLATES.map((t) => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Dynamic var inputs */}
          {selectedTemplate?.vars.map((v) => (
            <div key={v}>
              <label className="block text-xs text-slate-400 mb-1">{v}</label>
              <input
                type="text"
                value={form.vars[v] || ''}
                onChange={(e) => setForm({ ...form, vars: { ...form.vars, [v]: e.target.value } })}
                placeholder={`Enter ${v}`}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
          ))}
        </div>

        {/* Preview */}
        <div className="rounded-xl bg-slate-900/60 border border-slate-700/50 p-4">
          <p className="text-slate-500 text-xs mb-2 uppercase tracking-wider">Preview</p>
          <p className="text-white font-semibold text-sm">{preview.title}</p>
          <p className="text-slate-400 text-sm mt-1">{preview.body}</p>
        </div>

        {sendResult?.success && (
          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3 text-emerald-400 text-sm">
            ✓ Notification sent{sendResult.fcm_sent ? ' (FCM push delivered)' : ' (in-app only — no push token)'}
          </div>
        )}
        {sendResult?.error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3 text-red-400 text-sm">
            ✕ {sendResult.error}
          </div>
        )}

        <button
          onClick={handleSend}
          disabled={sending}
          className="px-6 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-semibold text-sm transition"
        >
          {sending ? 'Sending…' : 'Send Notification →'}
        </button>
      </div>

      {/* History table */}
      <div className="rounded-2xl bg-slate-800/60 border border-slate-700/50 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-700/50 flex items-center justify-between">
          <h3 className="text-white font-semibold text-sm">📋 Notification History (last 100)</h3>
          {histLoading && <span className="text-slate-500 text-xs">Loading…</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-700/50">
                {['Recipient', 'Type', 'Title', 'Read', 'Sent'].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-slate-400 uppercase tracking-wider font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {histData?.notifications?.map((n) => (
                <tr key={n.id} className="border-b border-slate-700/30 hover:bg-slate-700/20 transition">
                  <td className="px-4 py-2.5">
                    <span className={`px-1.5 py-0.5 rounded text-xs ${n.recipient_type === 'guardian' ? 'bg-sky-500/20 text-sky-400' : 'bg-indigo-500/20 text-indigo-400'}`}>
                      {n.recipient_type}
                    </span>
                    <span className="text-slate-400 ml-2">{n.recipient_name}</span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-400">{n.type}</td>
                  <td className="px-4 py-2.5 text-white max-w-xs truncate">{n.title}</td>
                  <td className="px-4 py-2.5">
                    {n.read
                      ? <span className="text-emerald-400">✓</span>
                      : <span className="text-slate-600">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">
                    {new Date(n.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </td>
                </tr>
              ))}
              {!histLoading && !histData?.notifications?.length && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">No notifications yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
