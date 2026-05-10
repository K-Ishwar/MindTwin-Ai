import { useState, useEffect, useRef, useCallback } from 'react';
import { dashboardApi } from '../../api/dashboardApi';

const POMODORO_SECS = 25 * 60;
const BREAK_SECS = 5 * 60;

const MOODS = ['😴', '😕', '😐', '🙂', '😊'];

// SVG circular timer
function TimerRing({ secondsLeft, totalSecs, size = 200 }) {
  const stroke = 10;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = secondsLeft / totalSecs;
  const offset = circ * (1 - pct);

  const color = pct > 0.5 ? '#6366F1' : pct > 0.2 ? '#F59E0B' : '#EF4444';

  const mins = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const secs = String(secondsLeft % 60).padStart(2, '0');

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="#334155" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.5s' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-white font-black text-4xl tabular-nums">{mins}:{secs}</span>
        <span className="text-slate-500 text-xs mt-1">remaining</span>
      </div>
    </div>
  );
}

// Token reward animation overlay
function TokenRewardAnimation({ tokens, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center z-50 bg-slate-900/80 rounded-2xl">
      <div className="text-6xl animate-bounce mb-4">🪙</div>
      <p className="text-amber-400 font-black text-3xl">+{tokens}</p>
      <p className="text-white text-lg font-semibold mt-2">Focus Tokens Earned!</p>
      <p className="text-slate-400 text-sm mt-1">Great work! Keep going 🚀</p>
    </div>
  );
}

export default function SessionModal({ session, onClose, onComplete }) {
  const [phase, setPhase] = useState('idle'); // idle | running | break | post | done
  const [secondsLeft, setSecondsLeft] = useState(POMODORO_SECS);
  const [isBreak, setIsBreak] = useState(false);
  const [pomodoroCount, setPomodoroCount] = useState(0);
  const [elapsedSecs, setElapsedSecs] = useState(0);
  const [mood, setMood] = useState(null);
  const [actualMinutes, setActualMinutes] = useState('25');
  const [submitting, setSubmitting] = useState(false);
  const [tokensEarned, setTokensEarned] = useState(0);
  const [showReward, setShowReward] = useState(false);

  const timerRef = useRef(null);
  const elapsedRef = useRef(null);

  const clearTimers = () => {
    clearInterval(timerRef.current);
    clearInterval(elapsedRef.current);
  };

  const startTimer = useCallback(() => {
    setPhase('running');
    timerRef.current = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) {
          clearInterval(timerRef.current);
          // Pomodoro done — go to break or post
          setPomodoroCount(c => c + 1);
          setIsBreak(true);
          setSecondsLeft(BREAK_SECS);
          setPhase('break');
          return BREAK_SECS;
        }
        return s - 1;
      });
    }, 1000);
    elapsedRef.current = setInterval(() => setElapsedSecs(e => e + 1), 1000);
  }, []);

  const pauseTimer = () => {
    clearTimers();
    setPhase('idle');
  };

  const handleDone = () => {
    clearTimers();
    setActualMinutes(String(Math.round(elapsedSecs / 60)));
    setPhase('post');
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await dashboardApi.completeSession({
        topic_id: session.topic_id,
        actual_duration_min: parseInt(actualMinutes) || 25,
        mood_after: mood !== null ? mood + 1 : null,
        pomodoro_count: pomodoroCount || 1,
      });
      setTokensEarned(res.tokens_earned || 5);
      setShowReward(true);
    } catch (e) {
      console.error(e);
      setPhase('done');
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => () => clearTimers(), []);

  const totalSecs = isBreak ? BREAK_SECS : POMODORO_SECS;

  return (
    <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="relative bg-slate-800 rounded-3xl border border-slate-700 w-full max-w-md shadow-2xl shadow-black/50 overflow-hidden">

        {/* Reward overlay */}
        {showReward && (
          <TokenRewardAnimation
            tokens={tokensEarned}
            onDone={() => { setShowReward(false); onComplete?.(); onClose(); }}
          />
        )}

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div>
            <p className="text-slate-500 text-xs uppercase tracking-wide">
              {isBreak ? '☕ Break Time' : '🧠 Study Session'}
            </p>
            <h2 className="text-white font-bold text-lg mt-0.5 truncate">
              {session.topic_name}
            </h2>
            <p className="text-slate-500 text-xs">{session.subject}</p>
          </div>
          <button onClick={() => { clearTimers(); onClose(); }}
            className="text-slate-500 hover:text-white text-xl transition p-1">✕</button>
        </div>

        {/* Timer / Post-session form */}
        <div className="p-6">
          {phase !== 'post' ? (
            <>
              {/* Circular timer */}
              <div className="flex flex-col items-center py-4">
                <TimerRing secondsLeft={secondsLeft} totalSecs={totalSecs} />
                <div className="flex items-center gap-2 mt-4">
                  {[...Array(Math.max(pomodoroCount, 1))].map((_, i) => (
                    <span key={i} className={`text-lg ${i < pomodoroCount ? 'opacity-100' : 'opacity-30'}`}>🍅</span>
                  ))}
                  <span className="text-slate-500 text-xs ml-1">{pomodoroCount} pomodoro{pomodoroCount !== 1 ? 's' : ''}</span>
                </div>
              </div>

              {/* Timer controls */}
              <div className="flex gap-3 mt-4">
                {phase === 'idle' && (
                  <button
                    onClick={startTimer}
                    className="flex-1 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition shadow-lg shadow-indigo-500/30"
                  >
                    {elapsedSecs === 0 ? '▶ Start' : '▶ Resume'}
                  </button>
                )}
                {phase === 'running' && (
                  <button
                    onClick={pauseTimer}
                    className="flex-1 py-3 rounded-2xl bg-slate-700 hover:bg-slate-600 text-white font-bold text-sm transition"
                  >
                    ⏸ Pause
                  </button>
                )}
                {phase === 'break' && (
                  <button
                    onClick={() => { clearTimers(); setIsBreak(false); setSecondsLeft(POMODORO_SECS); setPhase('idle'); }}
                    className="flex-1 py-3 rounded-2xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-sm transition"
                  >
                    Skip Break ⏭
                  </button>
                )}
                <button
                  onClick={handleDone}
                  className="flex-1 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition shadow-lg shadow-emerald-500/20"
                >
                  I'm done ✓
                </button>
              </div>
            </>
          ) : (
            /* Post-session form */
            <div className="space-y-5">
              <div>
                <label className="text-slate-400 text-sm block mb-2">How long did you actually study? (minutes)</label>
                <input
                  type="number"
                  value={actualMinutes}
                  onChange={e => setActualMinutes(e.target.value)}
                  min="1" max="300"
                  className="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500 transition"
                />
              </div>

              <div>
                <label className="text-slate-400 text-sm block mb-3">How are you feeling now?</label>
                <div className="flex justify-between">
                  {MOODS.map((m, i) => (
                    <button
                      key={i}
                      onClick={() => setMood(i)}
                      className={`text-2xl p-2 rounded-xl transition-all duration-200 ${
                        mood === i ? 'bg-indigo-600/40 scale-125' : 'hover:bg-slate-700 hover:scale-110'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleSubmit}
                disabled={submitting || mood === null}
                className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold transition shadow-lg shadow-indigo-500/30"
              >
                {submitting ? 'Saving...' : 'Submit & Earn Tokens 🪙'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
