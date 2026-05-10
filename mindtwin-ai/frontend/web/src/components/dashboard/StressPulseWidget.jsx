import { useState } from 'react';
import { dashboardApi } from '../../api/dashboardApi';

const MOODS = ['😴', '😕', '😐', '🙂', '😊'];

function getStressConfig(score) {
  if (score < 0.4) return { color: '#10B981', label: 'Calm', emoji: '😌', ring: 'border-emerald-500', bg: 'bg-emerald-500/10' };
  if (score < 0.7) return { color: '#F59E0B', label: 'A bit tense', emoji: '😐', ring: 'border-amber-500', bg: 'bg-amber-500/10' };
  return { color: '#EF4444', label: 'High pressure', emoji: '😰', ring: 'border-red-500', bg: 'bg-red-500/10' };
}

export default function StressPulseWidget({ stressScore = 0.2, isLoading }) {
  const [showMoodPicker, setShowMoodPicker] = useState(false);
  const [selectedMood, setSelectedMood] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  const cfg = getStressConfig(stressScore);

  const handleMoodSubmit = async (moodIdx) => {
    setSelectedMood(moodIdx);
    try {
      await dashboardApi.logMood(moodIdx + 1);
    } catch (e) { /* non-critical */ }
    setSubmitted(true);
    setTimeout(() => { setShowMoodPicker(false); setSubmitted(false); }, 1500);
  };

  if (isLoading) {
    return <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 animate-pulse h-44" />;
  }

  return (
    <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
      <h3 className="text-white font-bold text-base mb-4">How you're feeling</h3>

      <div className="flex items-center gap-5">
        {/* Pulse circle */}
        <div className={`relative w-20 h-20 rounded-full border-4 ${cfg.ring} ${cfg.bg} flex items-center justify-center flex-shrink-0`}>
          {/* Pulse ring animation */}
          <div
            className={`absolute inset-0 rounded-full border-4 ${cfg.ring} animate-ping opacity-20`}
            style={{ animationDuration: '2s' }}
          />
          <span className="text-2xl">{cfg.emoji}</span>
        </div>

        <div className="flex-1">
          <p className="text-white font-semibold text-lg">{cfg.label}</p>
          <p className="text-slate-500 text-xs mt-1">
            Stress index: {(stressScore * 10).toFixed(1)}/10
          </p>
          {!showMoodPicker ? (
            <button
              onClick={() => setShowMoodPicker(true)}
              className="mt-3 text-xs text-indigo-400 hover:text-indigo-300 underline underline-offset-2 transition"
            >
              Log your mood →
            </button>
          ) : submitted ? (
            <p className="mt-3 text-emerald-400 text-sm font-medium animate-pulse">Mood logged! 🌟</p>
          ) : (
            <div className="flex gap-2 mt-3">
              {MOODS.map((m, i) => (
                <button
                  key={i}
                  onClick={() => handleMoodSubmit(i)}
                  className={`text-xl p-1.5 rounded-xl transition hover:scale-125 ${
                    selectedMood === i ? 'bg-indigo-600/40 scale-125' : 'hover:bg-slate-700'
                  }`}
                  title={`Mood ${i + 1}/5`}
                >
                  {m}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
