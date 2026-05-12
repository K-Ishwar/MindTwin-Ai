import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { guardianApi } from '../../../api/guardianApi';

// ── Mini SVG sparkline ────────────────────────────────────────────────────────

function Sparkline({ data, color = '#6366f1' }) {
  if (!data || data.length < 2) {
    return <span className="text-slate-600 text-xs">No data</span>;
  }

  const values = data.map((d) => parseFloat(d.theta) || 0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const W = 80;
  const H = 28;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W;
    const y = H - ((v - min) / range) * H;
    return `${x},${y}`;
  });

  const lastVal = values[values.length - 1];
  const firstVal = values[0];
  const trend = lastVal > firstVal ? '#22c55e' : lastVal < firstVal ? '#ef4444' : '#94a3b8';

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-20 h-7" aria-label="Theta trend sparkline">
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={trend}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── Subject accordion row ─────────────────────────────────────────────────────

function SubjectRow({ subject }) {
  const [open, setOpen] = useState(false);

  const score = subject.avg_quiz_score || 0;
  const statusColor =
    score >= 70
      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
      : score >= 45
      ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
      : 'bg-red-500/20 text-red-400 border-red-500/30';
  const statusLabel = score >= 70 ? 'Strong' : score >= 45 ? 'Average' : 'Needs Work';

  const improvement = subject.improvement_percent || 0;
  const improvColor = improvement > 0 ? 'text-emerald-400' : improvement < 0 ? 'text-red-400' : 'text-slate-400';

  return (
    <div className="rounded-xl border border-slate-700/50 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 p-4 bg-slate-800/60 hover:bg-slate-800 transition text-left"
      >
        <span className="text-white font-semibold flex-1">{subject.subject_name}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full border ${statusColor}`}>
          {statusLabel}
        </span>
        {subject.gap_count > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
            {subject.gap_count} gap{subject.gap_count > 1 ? 's' : ''}
          </span>
        )}
        <span className="text-slate-500 text-sm ml-2">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="p-4 bg-slate-900/40 border-t border-slate-700/50 space-y-4">
          {/* Topics covered */}
          <div>
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>Topics covered</span>
              <span>{subject.topics_covered}</span>
            </div>
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full"
                style={{ width: `${Math.min(100, subject.topics_covered * 10)}%` }}
              />
            </div>
          </div>

          {/* Score + sparkline */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-xs">Avg Quiz Score</p>
              <p className="text-white font-bold text-lg">{score}%</p>
            </div>
            <div className="text-center">
              <p className="text-slate-400 text-xs mb-1">Mastery Trend</p>
              <Sparkline data={subject.theta_trend} />
            </div>
            <div className="text-right">
              <p className="text-slate-400 text-xs">Improvement</p>
              <p className={`font-bold text-lg ${improvColor}`}>
                {improvement > 0 ? '+' : ''}{improvement}%
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const PERIODS = [
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'all_time', label: 'All Time' },
];

export default function PerformanceSection({ studentId }) {
  const [period, setPeriod] = useState('month');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['guardian-performance', studentId, period],
    queryFn: () => guardianApi.getStudentPerformance(studentId, period),
    enabled: !!studentId,
    staleTime: 60_000,
  });

  if (!studentId) return null;

  const trendBanner = {
    improving: { bg: 'bg-emerald-500/10 border-emerald-500/30', text: 'text-emerald-400', icon: '📈', label: 'Overall trend: Improving' },
    declining: { bg: 'bg-red-500/10 border-red-500/30', text: 'text-red-400', icon: '📉', label: 'Overall trend: Declining' },
    stable:    { bg: 'bg-slate-700/40 border-slate-600/30', text: 'text-slate-300', icon: '➡️', label: 'Overall trend: Stable' },
  };

  const trend = trendBanner[data?.overall_trend] || trendBanner.stable;

  return (
    <div className="space-y-5">
      {/* Period filter */}
      <div className="flex rounded-xl bg-slate-800 border border-slate-700 p-1 w-fit">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
              period === p.key
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="space-y-3 animate-pulse">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-slate-800" />
          ))}
        </div>
      )}

      {isError && (
        <div className="rounded-2xl bg-red-500/10 border border-red-500/30 p-4 text-red-400 text-sm">
          Failed to load performance data.
        </div>
      )}

      {data?.success && (
        <>
          {/* Overall trend banner */}
          <div className={`rounded-xl border p-4 flex items-center gap-3 ${trend.bg}`}>
            <span className="text-xl">{trend.icon}</span>
            <div>
              <p className={`font-semibold ${trend.text}`}>{trend.label}</p>
              {data.strongest_subject && (
                <p className="text-slate-400 text-xs mt-0.5">
                  Strongest: <span className="text-white">{data.strongest_subject}</span>
                  {data.weakest_subject && data.weakest_subject !== data.strongest_subject && (
                    <> · Needs focus: <span className="text-amber-400">{data.weakest_subject}</span></>
                  )}
                </p>
              )}
            </div>
            {data.study_consistency_percent !== null && (
              <div className="ml-auto text-right">
                <p className="text-slate-400 text-xs">Study consistency</p>
                <p className="text-white font-bold">{data.study_consistency_percent}%</p>
              </div>
            )}
          </div>

          {/* Subject accordions */}
          <div className="space-y-3">
            {data.subjects?.length === 0 && (
              <p className="text-slate-500 text-sm text-center py-8">
                No performance data for this period.
              </p>
            )}
            {data.subjects?.map((s) => (
              <SubjectRow key={s.subject_name} subject={s} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
