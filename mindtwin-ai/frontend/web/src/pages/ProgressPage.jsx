import { useState, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAnalytics } from '../hooks/useAnalytics';
import { analyticsApi } from '../api/analyticsApi';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS & HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const SUBJECT_COLORS = {
  Mathematics: '#6366f1', Physics: '#3b82f6', Chemistry: '#10b981',
  Biology: '#f59e0b', History: '#ec4899', English: '#8b5cf6', default: '#64748b',
};

const INSIGHT_ICONS = {
  study_habit: '🕐', wellbeing: '💚', knowledge_gap: '🧠',
  exam_prep: '📅', positive: '⭐', default: '📊',
};

const INSIGHT_COLORS = {
  warning:  { border: 'border-amber-500/30',   bg: 'bg-amber-500/5',   pill: 'bg-amber-500/20 text-amber-300' },
  critical: { border: 'border-red-500/30',     bg: 'bg-red-500/5',     pill: 'bg-red-500/20 text-red-300' },
  info:     { border: 'border-blue-500/30',    bg: 'bg-blue-500/5',    pill: 'bg-blue-500/20 text-blue-300' },
  success:  { border: 'border-emerald-500/30', bg: 'bg-emerald-500/5', pill: 'bg-emerald-500/20 text-emerald-300' },
  default:  { border: 'border-slate-700',      bg: 'bg-slate-800',     pill: 'bg-slate-700 text-slate-400' },
};

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ─────────────────────────────────────────────────────────────────────────────
// SKELETON
// ─────────────────────────────────────────────────────────────────────────────
function Skeleton({ className = '' }) {
  return <div className={`animate-pulse bg-slate-700/60 rounded-xl ${className}`} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — PAGE HEADER
// ─────────────────────────────────────────────────────────────────────────────
function PageHeader({ period, onPeriod }) {
  const periods = [
    { key: '7days', label: 'Last 7 Days' },
    { key: 'month', label: 'Last 30 Days' },
    { key: 'all',   label: 'All Time' },
  ];
  return (
    <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:mb-6">
      <div>
        <Link to="/dashboard" className="text-slate-500 text-sm hover:text-slate-300 transition mb-1 block print:hidden">
          ← Dashboard
        </Link>
        <h1 className="text-3xl font-black text-white">Your Progress</h1>
        <p className="text-slate-400 text-sm mt-1">Analytics, mastery &amp; twin evolution</p>
      </div>
      <div className="flex items-center gap-3 flex-wrap print:hidden">
        <div className="flex bg-slate-800 border border-slate-700 rounded-xl p-1 gap-1">
          {periods.map(p => (
            <button
              key={p.key}
              onClick={() => onPeriod(p.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                period === p.key ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 hover:border-indigo-500/50 text-slate-300 hover:text-white text-xs font-semibold transition"
        >
          🖨 Export Report
        </button>
      </div>
    </header>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — PERFORMANCE TIMELINE CHART (hand-rolled SVG, no library)
// ─────────────────────────────────────────────────────────────────────────────

const LINE_DEFS = [
  { key: 'study_hours', label: 'Study Hours', color: '#6366f1', yAxis: 'left'  },
  { key: 'quiz_score',  label: 'Quiz Score',  color: '#22c55e', yAxis: 'right' },
  { key: 'stress',      label: 'Stress',      color: '#ef4444', yAxis: 'right' },
  { key: 'mood',        label: 'Mood',        color: '#a855f7', yAxis: 'right' },
];

function buildChartData(timeline) {
  if (!timeline || timeline.length === 0) return [];
  return timeline.map(day => ({
    date:        day.study_date,
    study_hours: parseFloat(((day.total_duration_min || 0) / 60).toFixed(2)),
    quiz_score:  parseFloat(day.avg_score_percent || 0),
    stress:      parseFloat(((day.stress_score || 0) * 100).toFixed(1)),
    mood:        parseFloat(((day.avg_mood || 3) / 5 * 100).toFixed(1)),
  }));
}

function TimelineChart({ timeline, isLoading }) {
  const svgRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);
  const [visible, setVisible] = useState({ study_hours: true, quiz_score: true, stress: true, mood: true });

  const W = 900, H = 280, PL = 52, PR = 52, PT = 20, PB = 40;
  const gW = W - PL - PR, gH = H - PT - PB;

  const data = buildChartData(timeline);
  const n = data.length;

  const xOf = i => PL + (n <= 1 ? gW / 2 : (i / (n - 1)) * gW);
  const yLeft  = v => PT + gH - clamp(v / 12, 0, 1) * gH;
  const yRight = v => PT + gH - clamp(v / 100, 0, 1) * gH;
  const yOf = (key, v) => LINE_DEFS.find(l => l.key === key)?.yAxis === 'left' ? yLeft(v) : yRight(v);

  const pathFor = key => {
    if (n === 0) return '';
    return data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i).toFixed(1)},${yOf(key, d[key]).toFixed(1)}`).join(' ');
  };

  const handleMouseMove = useCallback((e) => {
    if (!svgRef.current || n === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (W / rect.width);
    const idx = clamp(Math.round((mx - PL) / gW * (n - 1)), 0, n - 1);
    setTooltip({ idx, x: xOf(idx), d: data[idx] });
  }, [data, n]);

  if (isLoading) return <Skeleton className="h-72 w-full" />;

  return (
    <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <h2 className="text-white font-bold text-lg">Performance Timeline</h2>
        <div className="flex flex-wrap gap-2">
          {LINE_DEFS.map(l => (
            <button
              key={l.key}
              onClick={() => setVisible(v => ({ ...v, [l.key]: !v[l.key] }))}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition"
              style={visible[l.key]
                ? { background: l.color + '25', borderColor: l.color + '70', color: l.color }
                : { background: 'transparent', borderColor: '#334155', color: '#64748b' }}
            >
              <span className="w-2 h-2 rounded-full" style={{ background: visible[l.key] ? l.color : '#475569' }} />
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <div className="w-full overflow-x-auto">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto"
          style={{ minWidth: 480 }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setTooltip(null)}
        >
          {/* Horizontal grid + dual axis labels */}
          {[0, 3, 6, 9, 12].map(v => (
            <g key={v}>
              <line x1={PL} y1={yLeft(v)} x2={W - PR} y2={yLeft(v)} stroke="#1e293b" strokeWidth="1" strokeDasharray="4 4" />
              <text x={PL - 6} y={yLeft(v) + 4} textAnchor="end" fill="#64748b" fontSize="10">{v}h</text>
              <text x={W - PR + 6} y={yRight(v / 12 * 100) + 4} textAnchor="start" fill="#64748b" fontSize="10">{Math.round(v / 12 * 100)}</text>
            </g>
          ))}

          {/* Axis titles */}
          <text x={14} y={PT + gH / 2} textAnchor="middle" fill="#94a3b8" fontSize="9"
            transform={`rotate(-90,14,${PT + gH / 2})`}>Hours</text>
          <text x={W - 14} y={PT + gH / 2} textAnchor="middle" fill="#94a3b8" fontSize="9"
            transform={`rotate(90,${W - 14},${PT + gH / 2})`}>Score %</text>

          {/* X-axis date ticks */}
          {data.map((d, i) => {
            const step = Math.max(1, Math.floor(n / 8));
            if (i % step !== 0 && i !== n - 1) return null;
            return (
              <text key={i} x={xOf(i)} y={H - 6} textAnchor="middle" fill="#64748b" fontSize="9">
                {fmtDate(d.date)}
              </text>
            );
          })}

          {/* Data lines */}
          {LINE_DEFS.map(l => visible[l.key] && n > 0 && (
            <path key={l.key} d={pathFor(l.key)} fill="none" stroke={l.color}
              strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
          ))}

          {/* Hover dots */}
          {tooltip && LINE_DEFS.map(l => visible[l.key] && (
            <circle key={l.key} cx={tooltip.x} cy={yOf(l.key, tooltip.d[l.key])}
              r="5" fill={l.color} stroke="#0f172a" strokeWidth="2" />
          ))}

          {/* Vertical crosshair */}
          {tooltip && (
            <line x1={tooltip.x} y1={PT} x2={tooltip.x} y2={PT + gH}
              stroke="#475569" strokeWidth="1" strokeDasharray="3 3" />
          )}

          {/* Tooltip box */}
          {tooltip && (() => {
            const tx = clamp(tooltip.x - 72, PL, W - PL - 148);
            const ty = PT + 4;
            const rows = LINE_DEFS.filter(l => visible[l.key]);
            return (
              <g>
                <rect x={tx} y={ty} width="148" height={rows.length * 16 + 26} rx="6"
                  fill="#1e293b" stroke="#334155" strokeWidth="1" />
                <text x={tx + 8} y={ty + 14} fill="#94a3b8" fontSize="9" fontWeight="600">
                  {fmtDate(tooltip.d.date)}
                </text>
                {rows.map((l, i) => (
                  <g key={l.key}>
                    <circle cx={tx + 14} cy={ty + 26 + i * 16} r="3" fill={l.color} />
                    <text x={tx + 24} y={ty + 30 + i * 16} fill="#e2e8f0" fontSize="9">
                      {l.label}: {l.key === 'study_hours' ? `${tooltip.d[l.key]}h` : `${tooltip.d[l.key]}%`}
                    </text>
                  </g>
                ))}
              </g>
            );
          })()}
        </svg>
      </div>

      {n === 0 && (
        <p className="text-center py-8 text-slate-500 text-sm">
          No activity data yet — start studying to see your timeline.
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — SUBJECT MASTERY CARDS
// ─────────────────────────────────────────────────────────────────────────────

function MasteryCard({ subject, data }) {
  const [expanded, setExpanded] = useState(false);

  const color = SUBJECT_COLORS[subject] || SUBJECT_COLORS.default;
  const mastery = parseFloat(data.mastery_score || data.avg_score_percent || 0);
  const totalTopics = parseInt(data.total_topics || 0);
  const completed   = parseInt(data.completed_topics || 0);
  const inProgress  = Math.max(0, Math.round(totalTopics * 0.2));
  const needsWork   = Math.max(0, totalTopics - completed - inProgress);
  const notAssessed = Math.max(0, totalTopics - completed - inProgress - needsWork);
  const studyHours  = parseFloat(((data.total_study_mins || 0) / 60).toFixed(1));

  // Predicted score range: mastery ± 10
  const predLow  = Math.max(0,   Math.round(mastery - 10));
  const predHigh = Math.min(100, Math.round(mastery + 10));

  const segments = [
    { label: 'Mastered',     count: completed,   color: '#22c55e' },
    { label: 'In Progress',  count: inProgress,  color: '#f59e0b' },
    { label: 'Needs Work',   count: needsWork,   color: '#ef4444' },
    { label: 'Not Assessed', count: notAssessed, color: '#475569' },
  ].filter(s => s.count > 0);

  const total = segments.reduce((s, x) => s + x.count, 0) || 1;

  return (
    <div
      className="bg-slate-800 rounded-2xl border border-slate-700 p-5 cursor-pointer hover:border-slate-600 transition"
      onClick={() => setExpanded(e => !e)}
    >
      {/* Header row */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-3 h-3 rounded-full" style={{ background: color }} />
            <h3 className="text-white font-bold text-base">{subject}</h3>
          </div>
          <p className="text-slate-400 text-xs">{totalTopics} topics · {studyHours}h studied</p>
        </div>
        <div className="text-right">
          <span className="text-3xl font-black" style={{ color }}>{Math.round(mastery)}%</span>
          <p className="text-slate-500 text-xs mt-0.5">mastery</p>
        </div>
      </div>

      {/* Stacked bar */}
      <div className="h-3 rounded-full overflow-hidden flex mb-3 bg-slate-700">
        {segments.map((s, i) => (
          <div
            key={i}
            style={{ width: `${(s.count / total) * 100}%`, background: s.color }}
            title={`${s.label}: ${s.count}`}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3">
        {segments.map((s, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs text-slate-400">
            <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
            {s.label} ({s.count})
          </div>
        ))}
      </div>

      {/* Predicted score + time */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400">
          Predicted: <span className="text-white font-semibold">{predLow}–{predHigh}%</span>
        </span>
        <span className="text-slate-500">{studyHours}h studied</span>
        <span className="text-indigo-400">{expanded ? '▲ Less' : '▼ Details'}</span>
      </div>

      {/* Expanded per-topic table */}
      {expanded && (
        <div className="mt-4 border-t border-slate-700 pt-4" onClick={e => e.stopPropagation()}>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 text-left">
                <th className="pb-2 font-semibold">Topic</th>
                <th className="pb-2 font-semibold text-right">Score</th>
                <th className="pb-2 font-semibold text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {(data.topics || []).map((t, i) => {
                const score = parseFloat(t.avg_score_percent || t.score_percent || 0);
                const status = score >= 70 ? 'Mastered' : score >= 40 ? 'In Progress' : 'Needs Work';
                const statusColor = score >= 70 ? '#22c55e' : score >= 40 ? '#f59e0b' : '#ef4444';
                return (
                  <tr key={i} className="border-t border-slate-700/50">
                    <td className="py-1.5 text-slate-300 truncate max-w-[160px]">{t.topic_name || t.subject}</td>
                    <td className="py-1.5 text-right text-white font-semibold">{Math.round(score)}%</td>
                    <td className="py-1.5 text-right font-semibold" style={{ color: statusColor }}>{status}</td>
                  </tr>
                );
              })}
              {(!data.topics || data.topics.length === 0) && (
                <tr><td colSpan="3" className="py-3 text-center text-slate-500">No topic data yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SubjectMasterySection({ mastery, progressBySubject, isLoading }) {
  // Merge mastery + progress data by subject
  const subjects = {};
  (mastery || []).forEach(m => { subjects[m.subject] = { ...subjects[m.subject], ...m }; });
  (progressBySubject || []).forEach(p => { subjects[p.subject] = { ...subjects[p.subject], ...p }; });

  const entries = Object.entries(subjects);

  if (isLoading) {
    return (
      <div>
        <h2 className="text-white font-bold text-lg mb-4">Subject Mastery</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-48" />)}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-white font-bold text-lg mb-4">Subject Mastery</h2>
      {entries.length === 0 ? (
        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-8 text-center text-slate-500 text-sm">
          No mastery data yet. Take some quizzes to see your subject breakdown.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {entries.map(([subject, data]) => (
            <MasteryCard key={subject} subject={subject} data={data} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 — BEHAVIORAL INSIGHTS PANEL
// ─────────────────────────────────────────────────────────────────────────────

function InsightCard({ insight, onDismiss }) {
  const theme = INSIGHT_COLORS[insight.severity] || INSIGHT_COLORS.default;
  const icon  = INSIGHT_ICONS[insight.type] || INSIGHT_ICONS.default;
  const lowData = insight.low_confidence;

  return (
    <div className={`rounded-2xl border p-5 ${theme.border} ${theme.bg} relative`}>
      {/* Dismiss button */}
      {!insight.dismissed && (
        <button
          onClick={() => onDismiss(insight.id)}
          className="absolute top-3 right-3 w-6 h-6 rounded-full bg-slate-700/60 hover:bg-slate-600 text-slate-400 hover:text-white text-xs flex items-center justify-center transition"
          title="Dismiss"
        >
          ✕
        </button>
      )}

      <div className="flex items-start gap-3">
        <span className="text-2xl flex-shrink-0 mt-0.5">{icon}</span>
        <div className="flex-1 min-w-0 pr-6">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="text-white font-bold text-sm">{insight.title}</h3>
            {lowData && (
              <span className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                ⚠ Limited data
              </span>
            )}
            {insight.dismissed && (
              <span className="text-xs text-slate-500 bg-slate-700/50 px-2 py-0.5 rounded-full">Dismissed</span>
            )}
          </div>
          <p className="text-slate-400 text-xs leading-relaxed mb-3">{insight.body}</p>
          {insight.recommendation && (
            <div className="inline-block bg-indigo-500/15 border border-indigo-500/25 text-indigo-300 text-xs px-3 py-1.5 rounded-full">
              💡 {insight.recommendation}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InsightsPanel({ insights, onDismiss, isLoading }) {
  const [showAll, setShowAll] = useState(false);

  if (isLoading) {
    return (
      <div>
        <h2 className="text-white font-bold text-lg mb-4">Personal Insights</h2>
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-28" />)}
        </div>
      </div>
    );
  }

  const active    = insights.filter(i => !i.dismissed);
  const dismissed = insights.filter(i => i.dismissed);
  const visible   = showAll ? active : active.slice(0, 4);
  const hasMore   = active.length > 4;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-white font-bold text-lg">Personal Insights</h2>
        {dismissed.length > 0 && (
          <span className="text-xs text-slate-500">{dismissed.length} dismissed</span>
        )}
      </div>

      {active.length === 0 ? (
        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-8 text-center text-slate-500 text-sm">
          No insights yet — keep studying and we'll surface patterns here.
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(insight => (
            <InsightCard key={insight.id} insight={insight} onDismiss={onDismiss} />
          ))}
          {hasMore && (
            <button
              onClick={() => setShowAll(s => !s)}
              className="w-full py-2.5 rounded-xl border border-slate-700 text-slate-400 hover:text-white hover:border-slate-600 text-xs font-semibold transition"
            >
              {showAll ? '▲ Show Less' : `▼ Show ${active.length - 4} More`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5 — DIGITAL TWIN EVOLUTION
// ─────────────────────────────────────────────────────────────────────────────

const TWIN_LINE_DEFS = [
  { key: 'Consistency',    color: '#6366f1', dimIdx: 0 },
  { key: 'Performance',    color: '#22c55e', dimIdx: 1 },
  { key: 'Stress',         color: '#ef4444', dimIdx: 12, invert: true },
  { key: 'Learning Pace',  color: '#a855f7', dimIdx: 13 },
];

function TwinMiniChart({ dimensions, isLoading }) {
  // Build a small radar-style bar chart from the 16 labelled dimensions
  const W = 600, H = 180, PL = 40, PR = 20, PT = 16, PB = 30;
  const gW = W - PL - PR, gH = H - PT - PB;

  if (isLoading) return <Skeleton className="h-44 w-full" />;
  if (!dimensions || dimensions.length === 0) {
    return <p className="text-slate-500 text-sm text-center py-8">Twin data not yet available.</p>;
  }

  // Pick the 4 tracked dimensions
  const tracked = TWIN_LINE_DEFS.map(def => {
    const dim = dimensions.find(d => d.label === def.key) || dimensions[def.dimIdx] || null;
    return { ...def, value: dim ? dim.normalised : 0 };
  });

  const n = tracked.length;
  const barW = Math.floor(gW / n) - 8;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      {/* Grid */}
      {[0, 0.25, 0.5, 0.75, 1].map(v => (
        <g key={v}>
          <line x1={PL} y1={PT + gH * (1 - v)} x2={W - PR} y2={PT + gH * (1 - v)}
            stroke="#1e293b" strokeWidth="1" strokeDasharray="3 3" />
          <text x={PL - 4} y={PT + gH * (1 - v) + 4} textAnchor="end" fill="#64748b" fontSize="9">
            {Math.round(v * 100)}
          </text>
        </g>
      ))}

      {/* Bars */}
      {tracked.map((t, i) => {
        const x = PL + i * (gW / n) + (gW / n - barW) / 2;
        const barH = t.value * gH;
        const y = PT + gH - barH;
        return (
          <g key={t.key}>
            <rect x={x} y={PT} width={barW} height={gH} rx="4" fill={t.color + '15'} />
            <rect x={x} y={y} width={barW} height={barH} rx="4" fill={t.color + '80'} />
            <rect x={x} y={y} width={barW} height={Math.min(4, barH)} rx="2" fill={t.color} />
            <text x={x + barW / 2} y={H - 8} textAnchor="middle" fill={t.color} fontSize="9" fontWeight="600">
              {t.key}
            </text>
            <text x={x + barW / 2} y={y - 4} textAnchor="middle" fill="#e2e8f0" fontSize="9" fontWeight="700">
              {Math.round(t.value * 100)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function TwinEvolutionSection({ twinEvolution, twinDimensions, isLoading }) {
  if (isLoading) {
    return (
      <div>
        <h2 className="text-white font-bold text-lg mb-4">How your learning profile is evolving</h2>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const dims = twinDimensions || [];

  // Stat cards
  const consistency = dims.find(d => d.label === 'Study Consistency');
  const performance = dims.find(d => d.label === 'Quiz Performance');
  const stress      = dims.find(d => d.label === 'Stress Resilience');
  const strongest   = dims.length > 0
    ? dims.reduce((a, b) => a.normalised > b.normalised ? a : b)
    : null;

  const growthScore = consistency && performance
    ? Math.round((consistency.normalised + performance.normalised) / 2 * 100)
    : null;

  const peerPercentile = twinEvolution?.peer_cluster_id != null
    ? Math.min(99, Math.max(1, 50 + (twinEvolution.peer_cluster_id % 50)))
    : null;

  return (
    <div>
      <h2 className="text-white font-bold text-lg mb-4">How your learning profile is evolving</h2>

      <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5 mb-4">
        <TwinMiniChart dimensions={dims} isLoading={false} />
      </div>

      {/* 3 stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Growth Score */}
        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5 text-center">
          <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-2">Growth Score</p>
          {growthScore !== null ? (
            <>
              <p className="text-4xl font-black text-indigo-400">{growthScore}</p>
              <p className="text-xs mt-1" style={{ color: growthScore >= 60 ? '#22c55e' : '#f59e0b' }}>
                {growthScore >= 60 ? '↑ On track' : '↓ Needs focus'}
              </p>
            </>
          ) : (
            <p className="text-slate-500 text-sm">Not enough data</p>
          )}
        </div>

        {/* Strongest Dimension */}
        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5 text-center">
          <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-2">Strongest Dimension</p>
          {strongest ? (
            <>
              <p className="text-white font-bold text-lg leading-tight">{strongest.label}</p>
              <p className="text-emerald-400 text-sm mt-1">{Math.round(strongest.normalised * 100)}% score</p>
            </>
          ) : (
            <p className="text-slate-500 text-sm">Not yet assessed</p>
          )}
        </div>

        {/* Peer Percentile */}
        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5 text-center">
          <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-2">Peer Percentile</p>
          {peerPercentile !== null ? (
            <>
              <p className="text-4xl font-black text-violet-400">{peerPercentile}%</p>
              <p className="text-slate-400 text-xs mt-1">
                Better than {peerPercentile}% of students in your cluster
              </p>
            </>
          ) : (
            <p className="text-slate-500 text-sm">Cluster not assigned yet</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6 — EXAM READINESS DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────

// Animated SVG arc gauge
function ReadinessGauge({ score, animated }) {
  const R = 54, CX = 70, CY = 70;
  const circ = Math.PI * R; // half-circle circumference
  const offset = circ - (score / 100) * circ;

  let color = '#22c55e';
  if (score < 40) color = '#ef4444';
  else if (score < 65) color = '#f59e0b';

  return (
    <svg viewBox="0 0 140 90" className="w-36 h-24">
      {/* Track */}
      <path
        d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
        fill="none" stroke="#1e293b" strokeWidth="12" strokeLinecap="round"
      />
      {/* Fill */}
      <path
        d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
        fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={animated ? offset : circ}
        style={{ transition: 'stroke-dashoffset 1.2s ease-out, stroke 0.5s' }}
      />
      {/* Score text */}
      <text x={CX} y={CY - 4} textAnchor="middle" fill="white" fontSize="20" fontWeight="800">
        {score}
      </text>
      <text x={CX} y={CY + 12} textAnchor="middle" fill="#64748b" fontSize="9">
        readiness
      </text>
    </svg>
  );
}

function MiniBar({ label, value, color }) {
  return (
    <div className="mb-2">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-400">{label}</span>
        <span className="text-white font-semibold">{Math.round(value)}%</span>
      </div>
      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${clamp(value, 0, 100)}%`, background: color }}
        />
      </div>
    </div>
  );
}

function ExamReadinessCard({ exam }) {
  const navigate = useNavigate();
  const [animated, setAnimated] = useState(false);

  const { data: readiness, isLoading } = useQuery({
    queryKey: ['exam-readiness', exam.id],
    queryFn: () => analyticsApi.getExamReadiness(exam.id),
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  // Trigger gauge animation after mount
  useState(() => { setTimeout(() => setAnimated(true), 100); });

  const score = readiness?.readiness?.readiness_score ?? readiness?.readiness_score ?? 0;
  const grade = readiness?.readiness?.predicted_grade ?? readiness?.predicted_grade ?? '—';
  const weakTopics = readiness?.readiness?.weak_topics ?? readiness?.weak_topics ?? [];
  const actions    = readiness?.readiness?.recommended_actions ?? readiness?.recommended_actions ?? [];
  const daysLeft   = readiness?.readiness?.days_remaining ?? readiness?.days_remaining ?? null;

  const daysUntil = exam.exam_date
    ? Math.max(0, Math.ceil((new Date(exam.exam_date) - new Date()) / 86400000))
    : daysLeft;

  const coverage    = readiness?.readiness?.completion_percent ?? 50;
  const masteryPct  = readiness?.readiness?.avg_quiz_score ?? score * 0.8;
  const consistency = Math.min(100, score + 5);
  const stressScore = Math.max(0, 100 - score * 0.3);

  let urgencyColor = '#22c55e';
  if (daysUntil <= 7)  urgencyColor = '#ef4444';
  else if (daysUntil <= 14) urgencyColor = '#f59e0b';

  return (
    <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5">
      {/* Exam header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-white font-bold text-base">{exam.subject}</h3>
          <p className="text-slate-400 text-xs mt-0.5">
            {exam.exam_date ? new Date(exam.exam_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' }) : ''}
          </p>
          {daysUntil !== null && (
            <span
              className="inline-block mt-1 text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ background: urgencyColor + '20', color: urgencyColor }}
            >
              {daysUntil === 0 ? 'Today!' : `${daysUntil}d left`}
            </span>
          )}
        </div>
        {isLoading ? (
          <Skeleton className="w-36 h-24" />
        ) : (
          <div className="flex flex-col items-center">
            <ReadinessGauge score={Math.round(score)} animated={animated} />
            <span className="text-xs text-slate-400 mt-1">
              Predicted: <span className="text-white font-bold">{grade}</span>
            </span>
          </div>
        )}
      </div>

      {/* Component mini-bars */}
      {!isLoading && (
        <div className="mb-4">
          <MiniBar label="Coverage"    value={coverage}    color="#6366f1" />
          <MiniBar label="Mastery"     value={masteryPct}  color="#22c55e" />
          <MiniBar label="Consistency" value={consistency} color="#3b82f6" />
          <MiniBar label="Stress Ctrl" value={stressScore} color="#a855f7" />
        </div>
      )}

      {/* Critical gaps */}
      {weakTopics.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-semibold text-red-400 mb-2">Critical gaps to fix:</p>
          <div className="flex flex-wrap gap-2">
            {weakTopics.map((t, i) => (
              <button
                key={i}
                onClick={() => navigate('/quiz', { state: { topicName: t.topic_name || t } })}
                className="text-xs px-2.5 py-1 rounded-full bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25 transition font-semibold"
              >
                {t.topic_name || t} →
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Recommended actions */}
      {actions.length > 0 && (
        <div className="space-y-1">
          {actions.slice(0, 2).map((a, i) => (
            <p key={i} className="text-xs text-slate-400 flex items-start gap-1.5">
              <span className="text-indigo-400 mt-0.5">•</span> {a}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function ExamReadinessSection({ exams, isLoading }) {
  const upcoming = (exams || [])
    .filter(e => new Date(e.exam_date) >= new Date())
    .sort((a, b) => new Date(a.exam_date) - new Date(b.exam_date));

  if (isLoading) {
    return (
      <div>
        <h2 className="text-white font-bold text-lg mb-4">Exam Readiness</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2].map(i => <Skeleton key={i} className="h-72" />)}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-white font-bold text-lg mb-4">Exam Readiness</h2>
      {upcoming.length === 0 ? (
        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-8 text-center text-slate-500 text-sm">
          No upcoming exams. <Link to="/profile" className="text-indigo-400 hover:underline">Add exams →</Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {upcoming.map(exam => (
            <ExamReadinessCard key={exam.id} exam={exam} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ROOT PAGE COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function ProgressPage() {
  const {
    period, changePeriod,
    dashboard, timeline, exams,
    progressBySubject, mastery,
    insights, dismissInsight,
    twinEvolution, twinDimensions,
    isLoading, isDashboardLoading, isInsightsLoading, isTwinLoading,
  } = useAnalytics();

  return (
    <div className="min-h-screen bg-[#0F172A] text-white pb-20">
      {/* Subtle background glow */}
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{ background: 'radial-gradient(ellipse 80% 40% at 50% -10%, rgba(99,102,241,0.12) 0%, transparent 55%)' }}
      />

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-10 z-10">

        {/* ── S1: Header ── */}
        <PageHeader period={period} onPeriod={changePeriod} />

        {/* ── S2: Timeline Chart ── */}
        <TimelineChart timeline={timeline} isLoading={isDashboardLoading} />

        {/* ── S3: Subject Mastery ── */}
        <SubjectMasterySection
          mastery={mastery}
          progressBySubject={progressBySubject}
          isLoading={isDashboardLoading}
        />

        {/* ── S4: Insights ── */}
        <InsightsPanel
          insights={insights}
          onDismiss={dismissInsight}
          isLoading={isInsightsLoading}
        />

        {/* ── S5: Twin Evolution ── */}
        <TwinEvolutionSection
          twinEvolution={twinEvolution}
          twinDimensions={twinDimensions}
          isLoading={isTwinLoading}
        />

        {/* ── S6: Exam Readiness ── */}
        <ExamReadinessSection exams={exams} isLoading={isDashboardLoading} />

        <p className="text-center text-slate-700 text-xs pb-4">
          MindTwin AI · Analytics powered by your digital twin
        </p>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          body { background: white !important; color: black !important; }
          .print\\:hidden { display: none !important; }
          .bg-slate-800, .bg-slate-900 { background: #f8fafc !important; }
          .text-white { color: #0f172a !important; }
          .text-slate-400 { color: #475569 !important; }
          .border-slate-700 { border-color: #e2e8f0 !important; }
        }
      `}</style>
    </div>
  );
}
