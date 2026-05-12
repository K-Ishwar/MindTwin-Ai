import { useState, useEffect, useCallback } from 'react';

const SERVICES = [
  { name: 'Auth Service',         url: '/api/auth/health',         key: 'auth' },
  { name: 'Profile Service',      url: '/api/profile/health',      key: 'profile' },
  { name: 'Scheduler Service',    url: '/api/scheduler/health',    key: 'scheduler' },
  { name: 'Quiz Service',         url: '/api/quiz/health',         key: 'quiz' },
  { name: 'Stress Service',       url: '/api/stress/health',       key: 'stress' },
  { name: 'Reward Service',       url: '/api/reward/health',       key: 'reward' },
  { name: 'Notification Service', url: '/api/notifications/health',key: 'notification' },
  { name: 'AI Engine',            url: '/api/ai/health',           key: 'ai' },
];

async function checkService(url) {
  const start = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const latency = Date.now() - start;
    const data = await res.json().catch(() => ({}));
    return { status: res.ok ? 'ok' : 'error', latency, data };
  } catch (err) {
    return { status: 'error', latency: Date.now() - start, error: err.message };
  }
}

function StatusDot({ status }) {
  if (status === 'ok')      return <span className="w-3 h-3 rounded-full bg-emerald-400 shadow shadow-emerald-400/50 flex-shrink-0" />;
  if (status === 'error')   return <span className="w-3 h-3 rounded-full bg-red-400 shadow shadow-red-400/50 flex-shrink-0" />;
  return <span className="w-3 h-3 rounded-full bg-slate-600 animate-pulse flex-shrink-0" />;
}

function LatencyBar({ ms }) {
  if (!ms) return null;
  const color = ms < 200 ? 'bg-emerald-500' : ms < 800 ? 'bg-amber-500' : 'bg-red-500';
  const width = Math.min(100, (ms / 2000) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${width}%` }} />
      </div>
      <span className="text-slate-400 text-xs w-14 text-right">{ms}ms</span>
    </div>
  );
}

export default function SystemHealth() {
  const [health, setHealth] = useState({});
  const [lastChecked, setLastChecked] = useState(null);
  const [checking, setChecking] = useState(false);

  const runChecks = useCallback(async () => {
    setChecking(true);
    const results = await Promise.all(
      SERVICES.map(async (svc) => {
        const result = await checkService(svc.url);
        return [svc.key, result];
      })
    );
    setHealth(Object.fromEntries(results));
    setLastChecked(new Date());
    setChecking(false);
  }, []);

  // Run on mount and every 10 seconds
  useEffect(() => {
    runChecks();
    const interval = setInterval(runChecks, 10_000);
    return () => clearInterval(interval);
  }, [runChecks]);

  const okCount    = Object.values(health).filter((h) => h.status === 'ok').length;
  const errorCount = Object.values(health).filter((h) => h.status === 'error').length;

  return (
    <div className="space-y-5">
      {/* Summary bar */}
      <div className="rounded-2xl bg-slate-800/60 border border-slate-700/50 p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-emerald-400" />
            <span className="text-emerald-400 font-semibold">{okCount} healthy</span>
          </div>
          {errorCount > 0 && (
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-red-400" />
              <span className="text-red-400 font-semibold">{errorCount} down</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          {lastChecked && (
            <span className="text-slate-500 text-xs">
              Last checked: {lastChecked.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={runChecks}
            disabled={checking}
            className="px-3 py-1.5 rounded-xl bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white text-xs font-semibold transition"
          >
            {checking ? '⟳ Checking…' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {/* Service cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {SERVICES.map((svc) => {
          const h = health[svc.key];
          return (
            <div
              key={svc.key}
              className={`rounded-2xl border p-4 space-y-3 transition ${
                h?.status === 'ok'
                  ? 'bg-slate-800/60 border-slate-700/50'
                  : h?.status === 'error'
                  ? 'bg-red-500/5 border-red-500/30'
                  : 'bg-slate-800/40 border-slate-700/30'
              }`}
            >
              <div className="flex items-center gap-3">
                <StatusDot status={h?.status} />
                <span className="text-white font-medium text-sm">{svc.name}</span>
                <span className={`ml-auto text-xs font-semibold ${
                  h?.status === 'ok' ? 'text-emerald-400' : h?.status === 'error' ? 'text-red-400' : 'text-slate-500'
                }`}>
                  {h?.status === 'ok' ? 'Healthy' : h?.status === 'error' ? 'Down' : 'Checking…'}
                </span>
              </div>

              {h?.latency !== undefined && <LatencyBar ms={h.latency} />}

              {h?.status === 'error' && h?.error && (
                <p className="text-red-400/70 text-xs truncate">{h.error}</p>
              )}

              {h?.data && Object.keys(h.data).length > 0 && (
                <div className="space-y-1">
                  {Object.entries(h.data)
                    .filter(([k]) => k !== 'status')
                    .slice(0, 4)
                    .map(([k, v]) => (
                      <div key={k} className="flex justify-between text-xs">
                        <span className="text-slate-500">{k}</span>
                        <span className="text-slate-300">{String(v)}</span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-slate-600 text-xs text-center">Auto-refreshes every 10 seconds</p>
    </div>
  );
}
