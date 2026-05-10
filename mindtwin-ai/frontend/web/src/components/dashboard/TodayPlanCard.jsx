import { useState } from 'react';
import { dashboardApi } from '../../api/dashboardApi';

const SUBJECT_COLORS = {
  Mathematics: '#6366F1',
  Physics: '#3B82F6',
  Chemistry: '#8B5CF6',
  Biology: '#10B981',
  History: '#F59E0B',
  English: '#EC4899',
  Geography: '#14B8A6',
  default: '#94A3B8',
};

function SessionRow({ session, onStart, onSkip }) {
  const color = SUBJECT_COLORS[session.subject] || SUBJECT_COLORS.default;

  return (
    <div className="flex items-center gap-3 py-3 border-b border-slate-700/50 last:border-0">
      {/* Subject dot */}
      <div
        className="w-3 h-3 rounded-full flex-shrink-0"
        style={{ backgroundColor: color }}
      />

      {/* Topic info */}
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate">
          {session.topic_name || 'Free slot'}
        </p>
        <p className="text-slate-500 text-xs">{session.subject} · {session.start_time}</p>
      </div>

      {/* Duration badge */}
      <span className="text-slate-400 text-xs bg-slate-700/60 px-2 py-1 rounded-lg flex-shrink-0">
        {session.duration_min}m
      </span>

      {/* Status / Action */}
      {session.status === 'completed' && (
        <span className="text-emerald-400 text-lg flex-shrink-0">✓</span>
      )}
      {session.status === 'skipped' && (
        <span className="text-slate-500 text-xs flex-shrink-0 line-through">skipped</span>
      )}
      {session.status === 'pending' && session.topic_id && (
        <div className="flex gap-1 flex-shrink-0">
          <button
            onClick={() => onStart(session)}
            className="text-xs px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition"
          >
            Start
          </button>
          <button
            onClick={() => onSkip(session)}
            className="text-xs px-2 py-1.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-400 transition"
          >
            Skip
          </button>
        </div>
      )}
      {session.status === 'free' && (
        <span className="text-slate-600 text-xs flex-shrink-0">free</span>
      )}
    </div>
  );
}

export default function TodayPlanCard({ sessions = [], isLoading, onStartSession, onPlanGenerated, onPlanError }) {
  const [generating, setGenerating] = useState(false);

  const handleGeneratePlan = async () => {
    setGenerating(true);
    try {
      await dashboardApi.generatePlan();
      onPlanGenerated?.();
    } catch (e) {
      const msg = e.response?.data?.error || 'Failed to generate plan. Please try again.';
      onPlanError?.(msg);
    } finally {
      setGenerating(false);
    }
  };

  const handleSkip = async (session) => {
    try {
      await dashboardApi.skipSession({ topic_id: session.topic_id, skip_reason: 'manual' });
      onPlanGenerated?.(); // refetch
    } catch (e) { console.error(e); }
  };

  const hasSessions = sessions.some(s => s.topic_id);
  const completedCount = sessions.filter(s => s.status === 'completed').length;
  const totalCount = sessions.filter(s => s.topic_id && s.status !== 'free').length;

  return (
    <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-white font-bold text-lg">Today's Study Plan</h2>
          <p className="text-slate-500 text-xs mt-0.5">
            {hasSessions ? `${completedCount}/${totalCount} sessions done` : 'No plan yet'}
          </p>
        </div>
        {hasSessions && (
          <span className="text-2xl">
            {completedCount === totalCount && totalCount > 0 ? '🎉' : '📚'}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-12 bg-slate-700 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : hasSessions ? (
        <div>
          {sessions.filter(s => s.topic_id).map((session, i) => (
            <SessionRow
              key={`${session.topic_id}-${i}`}
              session={session}
              onStart={onStartSession}
              onSkip={handleSkip}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center py-8 text-center">
          <div className="text-5xl mb-4">🗓️</div>
          <p className="text-slate-400 text-sm mb-5">
            Your personalised study plan hasn't been generated yet.
            <br />
            <span className="text-slate-500 text-xs">
              We'll use your exams and quiz results to build it.
            </span>
          </p>
          <button
            onClick={handleGeneratePlan}
            disabled={generating}
            className="px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-sm transition shadow-lg shadow-indigo-500/30"
          >
            {generating ? 'Generating...' : 'Generate Your Study Plan ✨'}
          </button>
        </div>
      )}
    </div>
  );
}
