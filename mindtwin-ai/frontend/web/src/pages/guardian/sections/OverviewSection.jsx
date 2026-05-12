import { useQuery } from '@tanstack/react-query';
import { guardianApi } from '../../../api/guardianApi';

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(dateStr) {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function stressColor(severity) {
  if (!severity) return 'bg-slate-700 text-slate-300';
  const s = severity.toLowerCase();
  if (s === 'high' || s === 'severe') return 'bg-red-500/20 text-red-400 border border-red-500/30';
  if (s === 'moderate') return 'bg-amber-500/20 text-amber-400 border border-amber-500/30';
  return 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
}

function stressLabel(severity) {
  if (!severity) return 'Unknown';
  const s = severity.toLowerCase();
  if (s === 'high' || s === 'severe') return '🔴 High';
  if (s === 'moderate') return '🟡 Moderate';
  return '🟢 Low';
}

// ── 7-day bar chart (pure SVG) ────────────────────────────────────────────────

function WeekBarChart({ done, missed }) {
  // done & missed are numbers for the current week — we build a simple 7-bar chart
  // using the weekly summary data. Here we render a representative bar chart.
  const total = done + missed || 1;
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const today = new Date().getDay();

  // Distribute sessions across days proportionally (visual approximation)
  const bars = days.map((day, i) => {
    const isPast = i <= today;
    const isCompleted = isPast && done > 0 && i <= today - (today - Math.min(done, today));
    return { day, completed: isPast && i < done, missed: isPast && !isCompleted };
  });

  const W = 280;
  const H = 80;
  const barW = 28;
  const gap = (W - days.length * barW) / (days.length + 1);

  return (
    <svg viewBox={`0 0 ${W} ${H + 20}`} className="w-full" aria-label="Weekly sessions chart">
      {days.map((day, i) => {
        const x = gap + i * (barW + gap);
        const isToday = i === today;
        const filled = i < done;
        const isMissed = i <= today && !filled && i < today;
        const barH = filled ? 60 : isMissed ? 40 : 20;
        const y = H - barH;
        const fill = filled
          ? '#22c55e'
          : isMissed
          ? '#ef4444'
          : '#334155';
        return (
          <g key={day}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={barH}
              rx={6}
              fill={fill}
              opacity={isToday ? 1 : 0.8}
            />
            <text
              x={x + barW / 2}
              y={H + 14}
              textAnchor="middle"
              fontSize={9}
              fill={isToday ? '#a5b4fc' : '#64748b'}
              fontWeight={isToday ? 'bold' : 'normal'}
            >
              {day}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, accent = 'indigo' }) {
  const colors = {
    indigo: 'from-indigo-600/20 to-indigo-600/5 border-indigo-500/20',
    emerald: 'from-emerald-600/20 to-emerald-600/5 border-emerald-500/20',
    amber: 'from-amber-600/20 to-amber-600/5 border-amber-500/20',
    red: 'from-red-600/20 to-red-600/5 border-red-500/20',
  };
  return (
    <div
      className={`rounded-2xl bg-gradient-to-br ${colors[accent]} border p-4 flex flex-col gap-1`}
    >
      <span className="text-2xl">{icon}</span>
      <p className="text-slate-400 text-xs mt-1">{label}</p>
      <p className="text-white font-black text-xl leading-tight">{value}</p>
      {sub && <p className="text-slate-500 text-xs">{sub}</p>}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OverviewSection({ studentId }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['guardian-overview', studentId],
    queryFn: () => guardianApi.getStudentOverview(studentId),
    enabled: !!studentId,
    staleTime: 60_000,
  });

  const { data: weekData } = useQuery({
    queryKey: ['guardian-weekly', studentId, 0],
    queryFn: () => guardianApi.getWeeklySummary(studentId, 0),
    enabled: !!studentId,
    staleTime: 60_000,
  });

  if (!studentId) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        Select a student from the sidebar
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 rounded-2xl bg-slate-800" />
        ))}
      </div>
    );
  }

  if (isError || !data?.success) {
    return (
      <div className="rounded-2xl bg-red-500/10 border border-red-500/30 p-6 text-red-400 text-sm">
        Failed to load overview. You may not have access to this student.
      </div>
    );
  }

  const { student, current_week, stress_status, upcoming_exams, streak, token_balance, last_active } =
    data;
  const concerns = weekData?.concerns || [];
  const done = current_week.sessions_completed;
  const planned = current_week.sessions_planned;

  return (
    <div className="space-y-6">
      {/* Student header */}
      <div className="rounded-2xl bg-slate-800/60 border border-slate-700/50 p-5 flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center text-white font-black text-xl shadow-lg shadow-indigo-500/30 flex-shrink-0">
          {student.name?.slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-white font-bold text-xl truncate">{student.name}</h2>
          <p className="text-slate-400 text-sm">
            Grade {student.grade_level} · {student.board}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-slate-500 text-xs">Last active</p>
          <p className="text-slate-300 text-sm font-medium">{timeAgo(last_active)}</p>
        </div>
      </div>

      {/* 4 stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon="📚"
          label="This Week's Sessions"
          value={`${done}/${planned}`}
          sub={`${current_week.completion_rate}% completion`}
          accent="indigo"
        />
        <StatCard
          icon="⏱️"
          label="Study Hours"
          value={`${current_week.total_study_hours}h`}
          sub="This week"
          accent="emerald"
        />
        <StatCard
          icon="🔥"
          label="Streak"
          value={`${streak.current_streak} days`}
          sub={`Best: ${streak.longest_streak} days`}
          accent="amber"
        />
        <div
          className={`rounded-2xl border p-4 flex flex-col gap-1 ${stressColor(
            stress_status?.severity
          )}`}
        >
          <span className="text-2xl">🧠</span>
          <p className="text-xs mt-1 opacity-70">Stress Level</p>
          <p className="font-black text-xl leading-tight">
            {stressLabel(stress_status?.severity)}
          </p>
          <p className="text-xs opacity-60">
            {stress_status?.trend ? `Trend: ${stress_status.trend}` : 'No data'}
          </p>
        </div>
      </div>

      {/* Session progress bar */}
      {planned > 0 && (
        <div className="rounded-2xl bg-slate-800/60 border border-slate-700/50 p-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-slate-300 font-medium">Weekly session progress</span>
            <span className="text-slate-400">
              {done}/{planned} sessions
            </span>
          </div>
          <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, (done / planned) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Weekly bar chart */}
      <div className="rounded-2xl bg-slate-800/60 border border-slate-700/50 p-5">
        <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
          📊 This Week's Sessions
          <span className="text-xs text-slate-500 font-normal ml-auto">
            <span className="inline-block w-3 h-3 rounded bg-emerald-500 mr-1" />
            Done
            <span className="inline-block w-3 h-3 rounded bg-red-500 mx-1 ml-3" />
            Missed
          </span>
        </h3>
        <WeekBarChart done={done} missed={planned - done} />
      </div>

      {/* Upcoming exams */}
      {upcoming_exams?.length > 0 && (
        <div className="rounded-2xl bg-slate-800/60 border border-slate-700/50 p-5">
          <h3 className="text-white font-semibold mb-4">📅 Upcoming Exams</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {upcoming_exams.map((exam) => {
              const readinessColor =
                exam.days_away <= 7
                  ? 'border-red-500/40 bg-red-500/5'
                  : exam.days_away <= 14
                  ? 'border-amber-500/40 bg-amber-500/5'
                  : 'border-emerald-500/40 bg-emerald-500/5';
              return (
                <div
                  key={exam.subject}
                  className={`rounded-xl border p-4 flex items-center justify-between ${readinessColor}`}
                >
                  <div>
                    <p className="text-white font-semibold text-sm">{exam.subject}</p>
                    <p className="text-slate-400 text-xs mt-0.5">
                      {new Date(exam.exam_date).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-white font-black text-2xl">{exam.days_away}</p>
                    <p className="text-slate-400 text-xs">days left</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Concerns panel */}
      {concerns.length > 0 && (
        <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-5">
          <h3 className="text-amber-400 font-semibold mb-3 flex items-center gap-2">
            ⚠️ Concerns This Week
          </h3>
          <p className="text-amber-300/70 text-xs mb-3">
            Your student may need extra support this week.
          </p>
          <ul className="space-y-2">
            {concerns.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-amber-200">
                <span className="mt-0.5 flex-shrink-0">•</span>
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
