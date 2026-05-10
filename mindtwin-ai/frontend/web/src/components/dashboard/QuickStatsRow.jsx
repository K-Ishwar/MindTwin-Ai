// Circular progress ring — pure CSS/SVG, no chart library
function ProgressRing({ percent = 0, size = 72, stroke = 6 }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (percent / 100) * circ;

  return (
    <svg width={size} height={size} className="-rotate-90">
      {/* Track */}
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke="#334155" strokeWidth={stroke}
      />
      {/* Progress */}
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke="#6366F1" strokeWidth={stroke}
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
    </svg>
  );
}

export default function QuickStatsRow({ sessions = [], tokenBalance = 0, earnedToday = 0, streak = 0, isLoading }) {
  const completed = sessions.filter(s => s.status === 'completed').length;
  const total = sessions.filter(s => s.topic_id && s.status !== 'free').length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-slate-800 rounded-2xl p-5 border border-slate-700 animate-pulse h-28" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-4">
      {/* Streak */}
      <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700 flex flex-col gap-1">
        <p className="text-slate-500 text-xs font-medium uppercase tracking-wide">Streak</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-2xl">🔥</span>
          <span className="text-white font-black text-3xl">{streak}</span>
          <span className="text-slate-400 text-sm self-end pb-1">days</span>
        </div>
        <p className="text-emerald-400 text-xs mt-1">
          {streak > 0 ? 'Keep it up!' : 'Start today!'}
        </p>
      </div>

      {/* Focus Tokens */}
      <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700 flex flex-col gap-1">
        <p className="text-slate-500 text-xs font-medium uppercase tracking-wide">Focus Tokens</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-2xl">🪙</span>
          <span className="text-white font-black text-3xl">{tokenBalance}</span>
        </div>
        <p className="text-amber-400 text-xs mt-1">
          {earnedToday > 0 ? `+${earnedToday} earned today` : 'Earn more by studying'}
        </p>
      </div>

      {/* Progress ring */}
      <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700 flex items-center gap-4">
        <div className="relative flex-shrink-0">
          <ProgressRing percent={pct} />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-white font-bold text-xs">{pct}%</span>
          </div>
        </div>
        <div>
          <p className="text-slate-500 text-xs font-medium uppercase tracking-wide">Today</p>
          <p className="text-white font-bold text-lg mt-0.5">{completed}/{total}</p>
          <p className="text-slate-400 text-xs">sessions done</p>
        </div>
      </div>
    </div>
  );
}
