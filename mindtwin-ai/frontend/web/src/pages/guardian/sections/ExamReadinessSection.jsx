import { useQuery } from '@tanstack/react-query';
import { guardianApi } from '../../../api/guardianApi';

// ── Circular readiness score (pure CSS) ──────────────────────────────────────

function CircleScore({ score, label, color }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const strokeColor =
    color === 'green'
      ? '#22c55e'
      : color === 'amber'
      ? '#f59e0b'
      : '#ef4444';

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-24 h-24">
        <svg viewBox="0 0 88 88" className="w-full h-full -rotate-90">
          <circle cx="44" cy="44" r={radius} fill="none" stroke="#1e293b" strokeWidth="8" />
          <circle
            cx="44"
            cy="44"
            r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.6s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-white font-black text-xl leading-none">{Math.round(score)}</span>
          <span className="text-slate-400 text-[10px]">/ 100</span>
        </div>
      </div>
      <span
        className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
          color === 'green'
            ? 'bg-emerald-500/20 text-emerald-400'
            : color === 'amber'
            ? 'bg-amber-500/20 text-amber-400'
            : 'bg-red-500/20 text-red-400'
        }`}
      >
        {label}
      </span>
    </div>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ label, value, color = 'indigo' }) {
  const colors = {
    indigo: 'bg-indigo-500',
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
  };
  return (
    <div>
      <div className="flex justify-between text-xs text-slate-400 mb-1">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${colors[color]} rounded-full transition-all duration-500`}
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ExamReadinessSection({ studentId }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['guardian-exam-readiness', studentId],
    queryFn: () => guardianApi.getExamReadiness(studentId),
    enabled: !!studentId,
    staleTime: 120_000,
  });

  if (!studentId) return null;

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-pulse">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-64 rounded-2xl bg-slate-800" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-2xl bg-red-500/10 border border-red-500/30 p-4 text-red-400 text-sm">
        Failed to load exam readiness data.
      </div>
    );
  }

  const exams = data?.exam_readiness || [];

  if (exams.length === 0) {
    return (
      <div className="rounded-2xl bg-slate-800/60 border border-slate-700/50 p-10 text-center">
        <p className="text-4xl mb-3">📅</p>
        <p className="text-slate-400">No upcoming exams found.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
      {exams.map((exam) => {
        const color =
          exam.readiness_label === 'On Track'
            ? 'green'
            : exam.readiness_label === 'Needs Attention'
            ? 'amber'
            : 'red';

        const borderColor =
          color === 'green'
            ? 'border-emerald-500/30'
            : color === 'amber'
            ? 'border-amber-500/30'
            : 'border-red-500/30';

        return (
          <div
            key={exam.subject}
            className={`rounded-2xl bg-slate-800/60 border ${borderColor} p-5 space-y-4`}
          >
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-white font-bold text-lg">{exam.subject}</h3>
                <p className="text-slate-400 text-sm">
                  {new Date(exam.exam_date).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </p>
                <p className="text-slate-500 text-xs mt-0.5">
                  {exam.days_remaining} days remaining
                </p>
              </div>
              <CircleScore
                score={exam.readiness_score}
                label={exam.readiness_label}
                color={color}
              />
            </div>

            {/* Progress bars */}
            <div className="space-y-3">
              <ProgressBar
                label="Syllabus Coverage"
                value={exam.syllabus_coverage_percent}
                color="indigo"
              />
              <ProgressBar
                label="Topic Mastery"
                value={exam.avg_topic_mastery}
                color={color === 'green' ? 'emerald' : color === 'amber' ? 'amber' : 'red'}
              />
            </div>

            {/* Gaps */}
            {exam.gaps_detected > 0 && (
              <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3">
                <p className="text-red-400 text-xs font-semibold">
                  ⚠️ {exam.gaps_detected} knowledge gap{exam.gaps_detected > 1 ? 's' : ''} detected
                </p>
                <p className="text-red-300/60 text-xs mt-1">
                  Student has been notified to focus on these gaps.
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
