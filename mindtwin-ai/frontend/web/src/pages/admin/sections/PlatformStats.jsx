import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../../../api/adminApi';

// ── Pure-SVG bar chart ────────────────────────────────────────────────────────

function BarChart({ data, label, color = '#6366f1' }) {
  if (!data || data.length === 0) {
    return <p className="text-slate-600 text-xs text-center py-6">No data</p>;
  }
  const max = Math.max(...data.map((d) => d.count), 1);
  const W = 560;
  const H = 100;
  const barW = Math.max(8, Math.floor((W - 20) / data.length) - 4);
  const gap  = Math.floor((W - 20) / data.length);

  return (
    <svg viewBox={`0 0 ${W} ${H + 24}`} className="w-full" aria-label={label}>
      {data.map((d, i) => {
        const barH = Math.max(4, Math.round((d.count / max) * H));
        const x = 10 + i * gap;
        const y = H - barH;
        const dayLabel = typeof d.day === 'string'
          ? new Date(d.day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
          : String(d.day ?? d.subject ?? '');
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={barH} rx={3} fill={color} opacity={0.85} />
            <text x={x + barW / 2} y={H + 14} textAnchor="middle" fontSize={8} fill="#475569">
              {dayLabel.length > 6 ? dayLabel.slice(0, 6) : dayLabel}
            </text>
            <title>{`${dayLabel}: ${d.count}`}</title>
          </g>
        );
      })}
    </svg>
  );
}

// ── SVG Pie chart ─────────────────────────────────────────────────────────────

function PieChart({ data }) {
  if (!data || data.length === 0) return null;
  const total = data.reduce((s, d) => s + d.count, 0) || 1;
  const COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe', '#ede9fe'];
  const R = 60;
  const CX = 80;
  const CY = 80;

  let cumAngle = -Math.PI / 2;
  const slices = data.map((d, i) => {
    const angle = (d.count / total) * 2 * Math.PI;
    const x1 = CX + R * Math.cos(cumAngle);
    const y1 = CY + R * Math.sin(cumAngle);
    cumAngle += angle;
    const x2 = CX + R * Math.cos(cumAngle);
    const y2 = CY + R * Math.sin(cumAngle);
    const large = angle > Math.PI ? 1 : 0;
    return { path: `M${CX},${CY} L${x1},${y1} A${R},${R} 0 ${large},1 ${x2},${y2} Z`, color: COLORS[i % COLORS.length], label: d.grade, count: d.count };
  });

  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 160 160" className="w-36 h-36 flex-shrink-0">
        {slices.map((s, i) => (
          <path key={i} d={s.path} fill={s.color} stroke="#0f172a" strokeWidth={1.5}>
            <title>{`Grade ${s.label}: ${s.count}`}</title>
          </path>
        ))}
      </svg>
      <ul className="space-y-1.5 text-xs">
        {slices.map((s, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: s.color }} />
            <span className="text-slate-300">Grade {s.label}</span>
            <span className="text-slate-500 ml-auto">{s.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, color = 'violet' }) {
  const colors = {
    violet:  'from-violet-600/20 to-violet-600/5 border-violet-500/20',
    indigo:  'from-indigo-600/20 to-indigo-600/5 border-indigo-500/20',
    emerald: 'from-emerald-600/20 to-emerald-600/5 border-emerald-500/20',
    amber:   'from-amber-600/20 to-amber-600/5 border-amber-500/20',
    red:     'from-red-600/20 to-red-600/5 border-red-500/20',
    sky:     'from-sky-600/20 to-sky-600/5 border-sky-500/20',
  };
  return (
    <div className={`rounded-2xl bg-gradient-to-br ${colors[color]} border p-5`}>
      <span className="text-2xl">{icon}</span>
      <p className="text-slate-400 text-xs mt-2">{label}</p>
      <p className="text-white font-black text-2xl mt-0.5">{value}</p>
      {sub && <p className="text-slate-500 text-xs mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function PlatformStats() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: adminApi.getStats,
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
        {[...Array(6)].map((_, i) => <div key={i} className="h-28 rounded-2xl bg-slate-800" />)}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-4 text-red-400 text-sm flex items-center justify-between">
        Failed to load platform stats.
        <button onClick={refetch} className="text-xs underline">Retry</button>
      </div>
    );
  }

  const s = data.stats;
  const stressColor = s.avg_stress_7d >= 0.7 ? 'red' : s.avg_stress_7d >= 0.4 ? 'amber' : 'emerald';

  return (
    <div className="space-y-6">
      {/* 6 stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard icon="🎓" label="Total Students"       value={s.total_students.toLocaleString()}  color="violet" />
        <StatCard icon="⚡" label="Active This Week"     value={s.active_students.toLocaleString()} sub="≥1 session" color="indigo" />
        <StatCard icon="👨‍👩‍👧" label="Total Guardians"    value={s.total_guardians.toLocaleString()} color="sky" />
        <StatCard icon="📚" label="Sessions Completed"   value={s.total_sessions.toLocaleString()}  color="emerald" />
        <StatCard icon="🎯" label="Quizzes Taken"        value={s.total_quizzes.toLocaleString()}   color="indigo" />
        <StatCard
          icon="🧠"
          label="Avg Stress (7d)"
          value={s.avg_stress_7d.toFixed(2)}
          sub={s.avg_stress_7d >= 0.7 ? 'High' : s.avg_stress_7d >= 0.4 ? 'Moderate' : 'Low'}
          color={stressColor}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-2xl bg-slate-800/60 border border-slate-700/50 p-5">
          <h3 className="text-white font-semibold text-sm mb-4">📈 Daily Active Users (14d)</h3>
          <BarChart data={s.daily_active_users} label="Daily active users" color="#6366f1" />
        </div>
        <div className="rounded-2xl bg-slate-800/60 border border-slate-700/50 p-5">
          <h3 className="text-white font-semibold text-sm mb-4">📚 Sessions Completed / Day (14d)</h3>
          <BarChart data={s.daily_sessions} label="Sessions per day" color="#22c55e" />
        </div>
      </div>

      {/* Bottom row: subjects + grade pie */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-2xl bg-slate-800/60 border border-slate-700/50 p-5">
          <h3 className="text-white font-semibold text-sm mb-4">🏆 Most Popular Subjects</h3>
          <BarChart
            data={s.popular_subjects.map((p) => ({ day: p.subject, count: p.count }))}
            label="Popular subjects"
            color="#8b5cf6"
          />
        </div>
        <div className="rounded-2xl bg-slate-800/60 border border-slate-700/50 p-5">
          <h3 className="text-white font-semibold text-sm mb-4">🎓 Students by Grade Level</h3>
          <PieChart data={s.grade_distribution} />
        </div>
      </div>
    </div>
  );
}
