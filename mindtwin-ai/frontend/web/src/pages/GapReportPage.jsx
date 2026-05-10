import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { quizApi } from '../api/quizApi';

// ── Mastery helpers ────────────────────────────────────────────────────────────
function getMasteryMeta(theta) {
  if (theta === null || theta === undefined)
    return { label: 'Not Yet Taken', color: '#475569', pct: 0 };
  if (theta > 0.5)
    return { label: 'Strong', color: '#22C55E', pct: Math.min(100, ((theta + 2) / 4) * 100) };
  if (theta > -0.5)
    return { label: 'Getting There', color: '#F59E0B', pct: Math.min(100, ((theta + 2) / 4) * 100) };
  return { label: 'Needs Work', color: '#EF4444', pct: Math.min(100, ((theta + 2) / 4) * 100) };
}

// ── Pure-CSS Donut Chart ──────────────────────────────────────────────────────
function DonutChart({ pct }) {
  const radius = 52;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (pct / 100) * circ;

  return (
    <svg width="140" height="140" viewBox="0 0 140 140">
      <circle cx="70" cy="70" r={radius} fill="none" stroke="#1E293B" strokeWidth="14" />
      <circle
        cx="70" cy="70" r={radius} fill="none"
        stroke="url(#donutGrad)" strokeWidth="14"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 70 70)"
        style={{ transition: 'stroke-dashoffset 1.2s ease' }}
      />
      <defs>
        <linearGradient id="donutGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#6366F1" />
          <stop offset="100%" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
      <text x="70" y="66" textAnchor="middle" fill="#fff" fontSize="22" fontWeight="800">{pct}%</text>
      <text x="70" y="84" textAnchor="middle" fill="#64748B" fontSize="10">mastery</text>
    </svg>
  );
}

// ── Accordion item per subject ─────────────────────────────────────────────────
function SubjectAccordion({ subject, topics, onFix }) {
  const [open, setOpen] = useState(true);
  const gapCount = topics.filter(t => t.gap_detected).length;

  return (
    <div className="rounded-2xl border border-slate-700/50 overflow-hidden" style={{ background: 'rgba(15,23,42,0.8)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-3">
          <span className="font-bold text-white text-sm">{subject}</span>
          {gapCount > 0 && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
              {gapCount} gap{gapCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <span className="text-slate-500 text-sm">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-5 pb-4 space-y-3">
          {topics.map(t => {
            const m = getMasteryMeta(t.theta);
            return (
              <div key={t.id || t.topic_id} className="flex items-center gap-3 py-2 border-t border-slate-800">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-white truncate">{t.topic_name}</span>
                    {t.gap_detected && (
                      <span className="shrink-0 text-xs px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400">Gap</span>
                    )}
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${m.pct}%`, background: m.color }} />
                  </div>
                  <span className="text-xs mt-0.5 block" style={{ color: m.color }}>{m.label}</span>
                </div>
                <button
                  onClick={() => onFix(t)}
                  className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg transition"
                  style={{
                    background: t.gap_detected ? 'rgba(239,68,68,0.15)' : 'rgba(99,102,241,0.15)',
                    color: t.gap_detected ? '#F87171' : '#818CF8',
                    border: t.gap_detected ? '1px solid #EF444440' : '1px solid #6366F140',
                  }}
                >
                  {t.gap_detected ? 'Fix Gap' : 'Practice'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// GAP REPORT PAGE
// ══════════════════════════════════════════════════════════════════════════════
export default function GapReportPage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [replanning, setReplanning] = useState(false);
  const [replanDone, setReplanDone] = useState(false);

  useEffect(() => {
    quizApi.getGapReport().then(d => { setData(d); setLoading(false); });
  }, []);

  const handleReplan = async () => {
    setReplanning(true);
    const gaps = data?.gaps || [];
    await quizApi.replan(gaps).catch(() => {});
    setReplanning(false);
    setReplanDone(true);
    setTimeout(() => setReplanDone(false), 4000);
  };

  const handleFix = (topic) => {
    navigate('/quiz', { state: { autoStart: topic.id || topic.topic_id, topicName: topic.topic_name } });
  };

  // Group all topics by subject
  const allTopics = data?.all_topics || data?.gaps || [];
  const subjects = [...new Set(allTopics.map(t => t.subject))];

  const overallPct = data?.overall_mastery != null
    ? Math.round(data.overall_mastery * 100)
    : 62;

  // Top 3 priority fixes (gap_detected, lowest theta)
  const gapTopics = allTopics
    .filter(t => t.gap_detected)
    .sort((a, b) => (a.theta ?? -3) - (b.theta ?? -3))
    .slice(0, 3);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-slate-400 text-sm">Loading gap analysis…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F172A] text-white">
      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(239,68,68,0.12) 0%, transparent 55%)',
      }} />

      <div className="relative max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <Link to="/quiz" className="text-slate-500 text-sm hover:text-slate-300 transition mb-2 block">← Practice</Link>
            <h1 className="text-3xl font-black text-white">Your Learning Gaps</h1>
            <p className="text-slate-400 text-sm mt-1">Diagnostic overview across all subjects</p>
          </div>
        </div>

        {/* Overall mastery donut */}
        <div
          className="rounded-2xl border border-slate-700/50 p-6 flex items-center gap-6"
          style={{ background: 'rgba(15,23,42,0.9)' }}
        >
          <DonutChart pct={overallPct} />
          <div className="space-y-2">
            <p className="text-lg font-bold text-white">Overall Mastery</p>
            <p className="text-slate-400 text-sm">
              {overallPct >= 80 ? 'You\'re doing great! Keep up the momentum.' :
               overallPct >= 60 ? 'Good progress — a few areas need attention.' :
               'Several gaps detected. Focus on priority fixes below.'}
            </p>
            <div className="flex gap-4 mt-2">
              {[
                { color: '#22C55E', label: 'Strong' },
                { color: '#F59E0B', label: 'Getting There' },
                { color: '#EF4444', label: 'Needs Work' },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: l.color }} />
                  <span className="text-xs text-slate-400">{l.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Priority fixes */}
        {gapTopics.length > 0 && (
          <div
            className="rounded-2xl border border-red-500/20 p-5 space-y-3"
            style={{ background: 'rgba(239,68,68,0.06)' }}
          >
            <h2 className="text-base font-bold text-red-400">🎯 Top {gapTopics.length} Priority Fixes</h2>
            {gapTopics.map((t, i) => {
              const m = getMasteryMeta(t.theta);
              return (
                <div key={t.id || t.topic_id} className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center text-xs font-black shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{t.topic_name}</p>
                    <p className="text-xs text-slate-500">{t.subject} · {m.label}</p>
                  </div>
                  <button
                    onClick={() => handleFix(t)}
                    className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition"
                  >
                    Fix Now →
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Subject breakdown */}
        <div className="space-y-3">
          <h2 className="text-base font-bold text-white">Subject Breakdown</h2>
          {subjects.length === 0 ? (
            <div className="text-center py-10 text-slate-500 text-sm">No topic data yet. Take some quizzes to see your breakdown.</div>
          ) : (
            subjects.map(subj => (
              <SubjectAccordion
                key={subj}
                subject={subj}
                topics={allTopics.filter(t => t.subject === subj)}
                onFix={handleFix}
              />
            ))
          )}
        </div>

        {/* Replan button */}
        <div className="pb-8">
          <button
            id="replan-btn"
            onClick={handleReplan}
            disabled={replanning}
            className="w-full py-4 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2"
            style={{
              background: replanDone ? 'linear-gradient(135deg,#22C55E,#16A34A)' : 'linear-gradient(135deg,#6366F1,#8B5CF6)',
              boxShadow: '0 0 30px rgba(99,102,241,0.3)',
            }}
          >
            {replanning ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Generating revised plan…
              </>
            ) : replanDone ? '✅ Study Plan Updated!' : '📋 Generate Revised Study Plan'}
          </button>
        </div>
      </div>
    </div>
  );
}
