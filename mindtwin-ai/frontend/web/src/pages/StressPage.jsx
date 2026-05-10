import React, { useState, useEffect } from 'react';
import { useStress } from '../hooks/useStress';

// --- SUB-COMPONENTS ---

function StressGauge({ score, label }) {
  // Map score (0-1) to an angle (0 to 180 degrees)
  const angle = Math.min(Math.max(score * 180, 0), 180);
  const rotation = angle - 90; // SVG arc starts from left
  
  // Choose color based on score
  let color = '#22c55e'; // green
  if (score >= 0.7) color = '#ef4444'; // red
  else if (score >= 0.5) color = '#f97316'; // orange
  else if (score >= 0.3) color = '#eab308'; // yellow

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-64 h-32 overflow-hidden mb-4">
        <svg viewBox="0 0 200 100" className="w-full h-full">
          {/* Base Track */}
          <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#334155" strokeWidth="20" strokeLinecap="round" />
          {/* Color Zones */}
          <path d="M 20 100 A 80 80 0 0 1 52.9 35.3" fill="none" stroke="#22c55e" strokeWidth="20" opacity="0.3" />
          <path d="M 52.9 35.3 A 80 80 0 0 1 100 20" fill="none" stroke="#eab308" strokeWidth="20" opacity="0.3" />
          <path d="M 100 20 A 80 80 0 0 1 147.1 35.3" fill="none" stroke="#f97316" strokeWidth="20" opacity="0.3" />
          <path d="M 147.1 35.3 A 80 80 0 0 1 180 100" fill="none" stroke="#ef4444" strokeWidth="20" opacity="0.3" />
          {/* Active Value */}
          <path 
            d="M 20 100 A 80 80 0 0 1 180 100" 
            fill="none" 
            stroke={color} 
            strokeWidth="20" 
            strokeLinecap="round" 
            strokeDasharray="251.2" 
            strokeDashoffset={251.2 - (angle / 180) * 251.2}
            style={{ transition: 'stroke-dashoffset 1s ease-out, stroke 1s ease-out' }}
          />
          {/* Needle pivot */}
          <circle cx="100" cy="100" r="10" fill="#cbd5e1" />
        </svg>
        {/* Needle */}
        <div 
          className="absolute bottom-0 left-1/2 w-1 h-20 bg-white origin-bottom rounded-full shadow-lg"
          style={{ 
            transform: `translateX(-50%) rotate(${rotation}deg)`, 
            transition: 'transform 1s ease-out',
            transformOrigin: 'bottom center'
          }} 
        />
      </div>
      <div className="text-2xl font-black" style={{ color }}>{label}</div>
      <div className="text-slate-400 text-sm mt-1">Current Score: {(score * 100).toFixed(0)}</div>
    </div>
  );
}

function MoodLogWidget({ onLogMood }) {
  const [selected, setSelected] = useState(null);
  const [notes, setNotes] = useState('');
  
  const emojis = [
    { score: 1, icon: '😰', label: 'Overwhelmed' },
    { score: 2, icon: '😟', label: 'Stressed' },
    { score: 3, icon: '😐', label: 'Okay' },
    { score: 4, icon: '🙂', label: 'Good' },
    { score: 5, icon: '😄', label: 'Great' }
  ];

  return (
    <div className="bg-slate-800 p-5 rounded-2xl border border-slate-700 shadow-xl">
      <h3 className="font-bold text-lg mb-4 text-white">How are you feeling right now?</h3>
      <div className="flex justify-between mb-4">
        {emojis.map(e => (
          <button
            key={e.score}
            onClick={() => setSelected(e.score)}
            className={`text-4xl transition-all duration-300 ${selected === e.score ? 'scale-125 grayscale-0' : 'scale-100 grayscale opacity-60 hover:opacity-100 hover:grayscale-0'}`}
          >
            {e.icon}
          </button>
        ))}
      </div>
      {selected && (
        <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
          <input 
            type="text" 
            placeholder="Anything on your mind? (Optional)" 
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <button 
            onClick={() => {
              onLogMood({ mood_score: selected, notes });
              setSelected(null);
              setNotes('');
            }}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 rounded-lg transition"
          >
            Log Mood
          </button>
        </div>
      )}
    </div>
  );
}

function HistoryChart({ history }) {
  if (!history || history.length === 0) return <div className="text-slate-500 p-4 text-center">No history yet</div>;
  
  // history is assumed to be sorted by date (newest first). Let's reverse it for the chart (left to right).
  const data = [...history].reverse();
  
  const width = 600;
  const height = 200;
  const padding = 20;
  const graphW = width - padding * 2;
  const graphH = height - padding * 2;
  
  const points = data.map((d, i) => {
    const x = padding + (i / Math.max(1, data.length - 1)) * graphW;
    const y = padding + (1 - d.score) * graphH;
    return { x, y, ...d };
  });

  // Create segments for different colors
  const segments = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i+1];
    const avgScore = (p1.score + p2.score) / 2;
    let color = '#22c55e';
    if (avgScore >= 0.7) color = '#ef4444';
    else if (avgScore >= 0.4) color = '#f97316';
    
    segments.push({
      d: `M ${p1.x},${p1.y} L ${p2.x},${p2.y}`,
      color
    });
  }

  return (
    <div className="w-full overflow-x-auto custom-scrollbar">
      <div className="min-w-[500px]">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto drop-shadow-md">
          {/* Gridlines */}
          {[0, 0.25, 0.5, 0.75, 1].map((val) => (
            <line 
              key={val} 
              x1={padding} 
              y1={padding + (1 - val) * graphH} 
              x2={width - padding} 
              y2={padding + (1 - val) * graphH} 
              stroke="#334155" 
              strokeWidth="1" 
              strokeDasharray="4"
            />
          ))}
          
          {/* Segments */}
          {segments.map((seg, i) => (
            <path key={i} d={seg.d} fill="none" stroke={seg.color} strokeWidth="3" className="drop-shadow-lg" />
          ))}
          
          {/* Points */}
          {points.map((p, i) => {
            let color = '#22c55e';
            if (p.score >= 0.7) color = '#ef4444';
            else if (p.score >= 0.4) color = '#f97316';
            
            return (
              <g key={i} className="group cursor-pointer">
                <circle cx={p.x} cy={p.y} r="5" fill={color} stroke="#1e293b" strokeWidth="2" />
                {/* Tooltip */}
                <g className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <rect x={p.x - 40} y={p.y - 35} width="80" height="25" rx="4" fill="#0f172a" stroke="#475569" strokeWidth="1" />
                  <text x={p.x} y={p.y - 18} textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">
                    {(p.score*100).toFixed(0)} - {new Date(p.date).toLocaleDateString(undefined, {month:'short', day:'numeric'})}
                  </text>
                </g>
              </g>
            );
          })}
          
          {/* X-Axis labels (every 5th) */}
          {points.map((p, i) => {
            if (i % 5 === 0 || i === points.length - 1) {
              return (
                <text key={`label-${i}`} x={p.x} y={height - 2} textAnchor="middle" fill="#94a3b8" fontSize="10">
                  {new Date(p.date).getDate()}
                </text>
              );
            }
            return null;
          })}
        </svg>
      </div>
    </div>
  );
}

function BreathingExercise({ onComplete, onClose }) {
  const [phase, setPhase] = useState('Breathe In');
  const [timer, setTimer] = useState(4);
  const [cycle, setCycle] = useState(1);
  const [scale, setScale] = useState(1.5);
  
  useEffect(() => {
    let currentPhase = 'Breathe In';
    let timeLeft = 4;
    let cyclesDone = 0;
    setScale(1.5); // expand
    
    const interval = setInterval(() => {
      timeLeft--;
      if (timeLeft <= 0) {
        if (currentPhase === 'Breathe In') {
          currentPhase = 'Hold';
          timeLeft = 7;
          setScale(1.5);
        } else if (currentPhase === 'Hold') {
          currentPhase = 'Breathe Out';
          timeLeft = 8;
          setScale(1.0); // contract
        } else {
          cyclesDone++;
          if (cyclesDone >= 3) {
            clearInterval(interval);
            onComplete();
            return;
          }
          currentPhase = 'Breathe In';
          timeLeft = 4;
          setScale(1.5); // expand
          setCycle(cyclesDone + 1);
        }
      }
      setPhase(currentPhase);
      setTimer(timeLeft);
    }, 1000);
    
    return () => clearInterval(interval);
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/90 backdrop-blur-sm p-4">
      <div className="bg-slate-800 p-8 rounded-3xl border border-slate-700 text-center max-w-sm w-full relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white">✕</button>
        <h2 className="text-xl font-bold text-white mb-2">4-7-8 Breathing</h2>
        <p className="text-slate-400 text-sm mb-12">Cycle {cycle} of 3</p>
        
        <div className="relative w-48 h-48 mx-auto flex items-center justify-center mb-8">
          <div 
            className="absolute inset-0 bg-indigo-500/20 rounded-full"
            style={{ transform: `scale(${scale})`, transition: 'transform 1s linear' }}
          />
          <div 
            className="absolute inset-4 bg-indigo-500/40 rounded-full"
            style={{ transform: `scale(${scale * 0.9})`, transition: 'transform 1s linear' }}
          />
          <div className="relative z-10 w-32 h-32 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-full flex flex-col items-center justify-center shadow-lg shadow-indigo-500/50">
            <span className="text-2xl font-bold text-white">{timer}s</span>
          </div>
        </div>
        
        <div className="text-2xl font-black text-indigo-300 uppercase tracking-widest animate-pulse">
          {phase}
        </div>
      </div>
    </div>
  );
}

function BreakTimer({ onComplete, onClose }) {
  const [timeLeft, setTimeLeft] = useState(15 * 60);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          onComplete();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [onComplete]);

  const m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
  const s = (timeLeft % 60).toString().padStart(2, '0');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/90 backdrop-blur-sm p-4">
      <div className="bg-slate-800 p-8 rounded-3xl border border-slate-700 text-center max-w-sm w-full relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white">✕</button>
        <h2 className="text-2xl font-bold text-white mb-2">Rest & Reset</h2>
        <p className="text-slate-400 mb-8">Step away from the screen, stretch, and grab some water.</p>
        <div className="text-6xl font-black text-indigo-400 mb-8 tabular-nums">
          {m}:{s}
        </div>
        <button onClick={onComplete} className="text-sm text-slate-500 hover:text-white underline">
          End break early
        </button>
      </div>
    </div>
  );
}

// --- MAIN PAGE ---

export default function StressPage() {
  const { current, history, wellness, isLoading, logMood, acknowledgeIntervention } = useStress();
  const [activeModal, setActiveModal] = useState(null); // 'breathing' | 'break' | null
  const [drivingOpen, setDrivingOpen] = useState(false);

  if (isLoading || !current || !history) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const score = current.predictions?.tomorrow || 0;
  const sev = current.severity || 'low';
  
  const handleAcknowledge = async (intervention, action_taken) => {
    await acknowledgeIntervention({
      intervention_type: intervention.type,
      action: intervention.action,
      action_taken
    });
    setActiveModal(null);
  };

  const getPillColor = (val) => {
    if (val >= 0.7) return 'bg-red-500/20 text-red-400 border-red-500/30';
    if (val >= 0.5) return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    if (val >= 0.3) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    return 'bg-green-500/20 text-green-400 border-green-500/30';
  };
  
  const getLabel = (val) => {
    if (val >= 0.7) return 'Critical';
    if (val >= 0.5) return 'High';
    if (val >= 0.3) return 'Moderate';
    return 'Low';
  };

  return (
    <div className="min-h-screen bg-[#0F172A] text-white pb-20">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <header>
          <h1 className="text-3xl font-black text-white">Stress & Wellness</h1>
          <p className="text-slate-400">Monitor your cognitive load and prevent burnout.</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* SECTION 1: Overview Card */}
          <div className="md:col-span-2 bg-slate-800 rounded-2xl border border-slate-700 p-6 shadow-xl relative overflow-hidden">
            <div className="flex flex-col items-center">
              <StressGauge 
                score={score} 
                label={
                  score >= 0.7 ? "Overwhelmed 🆘" : 
                  score >= 0.5 ? "High pressure 😰" : 
                  score >= 0.3 ? "A bit tense 😐" : "Calm 😌"
                } 
              />
              
              <div className="flex flex-wrap gap-3 mt-6 justify-center w-full">
                <div className={`px-4 py-2 rounded-full border text-sm font-semibold ${getPillColor(score)}`}>
                  Tomorrow: {getLabel(score)}
                </div>
                <div className={`px-4 py-2 rounded-full border text-sm font-semibold ${getPillColor(current.predictions?.['3days'] || 0)}`}>
                  3 Days: {getLabel(current.predictions?.['3days'] || 0)}
                </div>
                <div className={`px-4 py-2 rounded-full border text-sm font-semibold ${getPillColor(current.predictions?.['5days'] || 0)}`}>
                  5 Days: {getLabel(current.predictions?.['5days'] || 0)}
                </div>
              </div>

              {/* What's driving this */}
              <div className="w-full mt-8">
                <button 
                  onClick={() => setDrivingOpen(!drivingOpen)}
                  className="w-full flex items-center justify-between p-3 bg-slate-900/50 rounded-lg text-sm font-semibold hover:bg-slate-900 transition"
                >
                  <span>What's driving this?</span>
                  <span>{drivingOpen ? '▲' : '▼'}</span>
                </button>
                {drivingOpen && (
                  <div className="p-4 bg-slate-900/30 rounded-b-lg border-t border-slate-700 text-sm space-y-2">
                    {current.behavioral_highlights?.["What's driving this"]?.map((item, i) => (
                      <div key={i} className="flex items-start gap-2 text-slate-300">
                        <span className="text-indigo-400">⚡</span>
                        {item}
                      </div>
                    )) || <div className="text-slate-500">Not enough data to determine drivers.</div>}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* SECTION 2: Mood & Interventions */}
          <div className="space-y-6">
            <MoodLogWidget onLogMood={logMood} />
            
            {/* SECTION 3: Active Interventions */}
            {current.interventions?.length > 0 && score >= 0.3 && (
              <div className="space-y-3">
                <h3 className="font-bold text-lg text-white">Recommended Actions</h3>
                {current.interventions.map((intv, idx) => (
                  <div key={idx} className={`p-4 rounded-xl border relative overflow-hidden ${intv.priority === 'urgent' ? 'bg-red-500/10 border-red-500/30' : 'bg-slate-800 border-slate-700'}`}>
                    <h4 className="font-bold text-white mb-1">{intv.title || (intv.type === 'plan_adjustment' ? 'Plan Adjusted' : 'Wellness Action')}</h4>
                    {intv.message && <p className="text-xs text-slate-400 mb-3">{intv.message}</p>}
                    
                    {intv.type === 'breathing_exercise' && (
                      <button 
                        onClick={() => setActiveModal({ ...intv, type: 'breathing' })}
                        className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-bold transition"
                      >
                        Start 5-min Breathing
                      </button>
                    )}
                    {intv.type === 'break_reminder' && (
                      <button 
                        onClick={() => setActiveModal({ ...intv, type: 'break' })}
                        className="w-full py-2 bg-teal-600 hover:bg-teal-500 rounded-lg text-sm font-bold transition"
                      >
                        Take a Break
                      </button>
                    )}
                    {intv.type === 'plan_adjustment' && (
                      <button 
                        onClick={() => handleAcknowledge(intv, 'done')}
                        className="w-full py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-bold transition"
                      >
                        Acknowledge
                      </button>
                    )}
                    {intv.type === 'wellness_alert' && (
                      <button 
                        onClick={() => handleAcknowledge(intv, 'done')}
                        className="w-full py-2 bg-red-600 hover:bg-red-500 rounded-lg text-sm font-bold transition mt-2"
                      >
                        I understand
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* SECTION 4: History Chart */}
        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 shadow-xl">
          <div className="flex justify-between items-end mb-6">
            <div>
              <h3 className="text-xl font-bold text-white">Stress History (30 Days)</h3>
              <p className="text-sm text-slate-400 mt-1">
                Weekly Average: <span className="text-white font-bold">{wellness?.weekly_avg?.toFixed(2) || '0.00'}</span> 
                {' '}{wellness?.mood_trend === 'worsening' ? '↑' : wellness?.mood_trend === 'improving' ? '↓' : '→'}
              </p>
            </div>
          </div>
          <HistoryChart history={history.history} />
        </div>

        {/* SECTION 5: Wellness Stats */}
        {wellness && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 text-center">
              <div className="text-3xl font-black text-indigo-400 mb-1">{wellness.breathing_exercises_done || 0}</div>
              <div className="text-xs text-slate-400 uppercase font-semibold">Breathing Sessions</div>
            </div>
            <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 text-center">
              <div className="text-3xl font-black text-teal-400 mb-1">{wellness.interventions_this_week || 0}</div>
              <div className="text-xs text-slate-400 uppercase font-semibold">Interventions Taken</div>
            </div>
            <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 text-center">
              <div className="text-lg font-bold text-white mb-2 leading-tight">
                {wellness.mood_trend === 'improving' ? 'Improving 🌱' : wellness.mood_trend === 'worsening' ? 'Declining ⚠️' : 'Stable ⚖️'}
              </div>
              <div className="text-xs text-slate-400 uppercase font-semibold">Recent Trend</div>
            </div>
            <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 text-center flex flex-col justify-center">
              <div className="text-xs text-slate-300 italic">
                "{wellness.recommended_actions?.[0] || 'Keep up the good work!'}"
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {activeModal?.type === 'breathing' && (
        <BreathingExercise 
          onClose={() => setActiveModal(null)} 
          onComplete={() => handleAcknowledge(activeModal, 'done')} 
        />
      )}
      {activeModal?.type === 'break' && (
        <BreakTimer 
          onClose={() => setActiveModal(null)} 
          onComplete={() => handleAcknowledge(activeModal, 'done')} 
        />
      )}
    </div>
  );
}
