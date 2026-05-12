import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { guardianApi } from '../../../api/guardianApi';

function stressLevelColor(level) {
  if (level === 'high') return 'text-red-400';
  if (level === 'moderate') return 'text-amber-400';
  return 'text-emerald-400';
}

export default function WeeklyReportSection({ studentId }) {
  const [weekOffset, setWeekOffset] = useState(0);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['guardian-weekly', studentId, weekOffset],
    queryFn: () => guardianApi.getWeeklySummary(studentId, weekOffset),
    enabled: !!studentId,
    staleTime: 60_000,
  });

  if (!studentId) return null;

  const handlePrint = () => window.print();

  const formatDate = (iso) =>
    iso
      ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
      : '';

  return (
    <div className="space-y-5">
      {/* Week navigation */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setWeekOffset((w) => w + 1)}
          className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 transition text-sm"
        >
          ← Prev Week
        </button>
        <span className="text-slate-400 text-sm flex-1 text-center">
          {weekOffset === 0 ? 'This Week' : `${weekOffset} week${weekOffset > 1 ? 's' : ''} ago`}
          {data?.week_of && (
            <span className="text-slate-600 ml-2">
              ({formatDate(data.week_of)} – {formatDate(data.week_end)})
            </span>
          )}
        </span>
        <button
          onClick={() => setWeekOffset((w) => Math.max(0, w - 1))}
          disabled={weekOffset === 0}
          className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 transition text-sm disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next Week →
        </button>
      </div>

      {isLoading && (
        <div className="space-y-3 animate-pulse">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-slate-800" />
          ))}
        </div>
      )}

      {isError && (
        <div className="rounded-2xl bg-red-500/10 border border-red-500/30 p-4 text-red-400 text-sm">
          Failed to load weekly report.
        </div>
      )}

      {data?.success && (
        <div id="weekly-report-print" className="space-y-5">
          {/* Summary stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="rounded-xl bg-slate-800/60 border border-slate-700/50 p-4 text-center">
              <p className="text-3xl font-black text-white">{data.sessions_done}</p>
              <p className="text-slate-400 text-xs mt-1">Sessions Done</p>
            </div>
            <div className="rounded-xl bg-slate-800/60 border border-slate-700/50 p-4 text-center">
              <p className="text-3xl font-black text-red-400">{data.sessions_missed}</p>
              <p className="text-slate-400 text-xs mt-1">Sessions Missed</p>
            </div>
            <div className="rounded-xl bg-slate-800/60 border border-slate-700/50 p-4 text-center">
              <p className="text-3xl font-black text-white">{data.quizzes_taken}</p>
              <p className="text-slate-400 text-xs mt-1">Quizzes Taken</p>
            </div>
            <div className="rounded-xl bg-slate-800/60 border border-slate-700/50 p-4 text-center">
              <p className={`text-3xl font-black ${stressLevelColor(data.stress_level_this_week)}`}>
                {data.stress_level_this_week?.charAt(0).toUpperCase() +
                  data.stress_level_this_week?.slice(1)}
              </p>
              <p className="text-slate-400 text-xs mt-1">Stress Level</p>
            </div>
          </div>

          {/* Quiz score */}
          {data.avg_quiz_score > 0 && (
            <div className="rounded-xl bg-slate-800/60 border border-slate-700/50 p-4 flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Average Quiz Score</p>
                <p className="text-white font-black text-2xl">{data.avg_quiz_score}%</p>
              </div>
              <div className="w-32">
                <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      data.avg_quiz_score >= 70
                        ? 'bg-emerald-500'
                        : data.avg_quiz_score >= 45
                        ? 'bg-amber-500'
                        : 'bg-red-500'
                    }`}
                    style={{ width: `${data.avg_quiz_score}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Topics mastered */}
          {data.topics_mastered?.length > 0 && (
            <div className="rounded-xl bg-slate-800/60 border border-slate-700/50 p-5">
              <h3 className="text-white font-semibold mb-3">✅ Topics Mastered</h3>
              <ul className="space-y-2">
                {data.topics_mastered.map((t, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-emerald-300">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-xs">
                      ✓
                    </span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Highlights */}
          {data.highlights?.length > 0 && (
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-5">
              <h3 className="text-emerald-400 font-semibold mb-3">🌟 Highlights</h3>
              <ul className="space-y-2">
                {data.highlights.map((h, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-emerald-200">
                    <span className="mt-0.5 flex-shrink-0 text-emerald-400">•</span>
                    {h}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Concerns */}
          {data.concerns?.length > 0 && (
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-5">
              <h3 className="text-amber-400 font-semibold mb-3">⚠️ Concerns</h3>
              <ul className="space-y-2">
                {data.concerns.map((c, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-amber-200">
                    <span className="mt-0.5 flex-shrink-0 text-amber-400">•</span>
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Focus tokens */}
          <div className="rounded-xl bg-slate-800/60 border border-slate-700/50 p-4 flex items-center gap-3">
            <span className="text-2xl">🪙</span>
            <div>
              <p className="text-slate-400 text-xs">Focus Tokens Earned This Week</p>
              <p className="text-white font-bold text-lg">{data.focus_tokens_earned}</p>
            </div>
          </div>

          {/* Print button */}
          <button
            onClick={handlePrint}
            className="w-full py-3 rounded-xl bg-slate-700 hover:bg-slate-600 border border-slate-600 text-white text-sm font-semibold transition flex items-center justify-center gap-2"
          >
            🖨️ Download as PDF
          </button>
        </div>
      )}

      {/* Print-specific styles */}
      <style>{`
        @media print {
          body > *:not(#weekly-report-print) { display: none !important; }
          #weekly-report-print { display: block !important; color: black !important; background: white !important; }
        }
      `}</style>
    </div>
  );
}
