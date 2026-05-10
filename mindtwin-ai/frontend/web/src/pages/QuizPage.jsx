import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { quizApi } from '../api/quizApi';
import { useQuiz, QUIZ_STATES } from '../hooks/useQuiz';

// ── Mastery helpers ────────────────────────────────────────────────────────────
function getMasteryMeta(theta) {
  if (theta === null || theta === undefined)
    return { label: 'Not Yet Taken', color: '#475569', bg: 'rgba(71,85,105,0.2)', pct: 0 };
  if (theta > 0.5)
    return { label: 'Strong', color: '#22C55E', bg: 'rgba(34,197,94,0.15)', pct: Math.min(100, ((theta + 2) / 4) * 100) };
  if (theta > -0.5)
    return { label: 'Getting There', color: '#F59E0B', bg: 'rgba(245,158,11,0.15)', pct: Math.min(100, ((theta + 2) / 4) * 100) };
  return { label: 'Needs Work', color: '#EF4444', bg: 'rgba(239,68,68,0.15)', pct: Math.min(100, ((theta + 2) / 4) * 100) };
}

function sortTopics(topics) {
  return [...topics].sort((a, b) => {
    if (a.gap_detected && !b.gap_detected) return -1;
    if (!a.gap_detected && b.gap_detected) return 1;
    const ta = a.theta ?? -3;
    const tb = b.theta ?? -3;
    return ta - tb;
  });
}

// ── SUBJECT TABS ──────────────────────────────────────────────────────────────
const SUBJECTS = ['All', 'Mathematics', 'Physics', 'Chemistry'];

// ══════════════════════════════════════════════════════════════════════════════
// TOPIC SELECTION SCREEN
// ══════════════════════════════════════════════════════════════════════════════
function TopicSelectionScreen({ onStartQuiz }) {
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeSubject, setActiveSubject] = useState('All');

  useEffect(() => {
    quizApi.getTopics().then(data => {
      setTopics(data.topics || []);
      setLoading(false);
    });
  }, []);

  const filtered = sortTopics(
    activeSubject === 'All' ? topics : topics.filter(t => t.subject === activeSubject)
  );

  return (
    <div className="min-h-screen bg-[#0F172A] text-white">
      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(99,102,241,0.18) 0%, transparent 60%)',
      }} />

      <div className="relative max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <Link to="/dashboard" className="text-slate-500 text-sm hover:text-slate-300 transition flex items-center gap-1 mb-2">
              ← Dashboard
            </Link>
            <h1 className="text-3xl font-black text-white">Practice &amp; Assessment</h1>
            <p className="text-slate-400 text-sm mt-1">Select a topic to start an adaptive quiz</p>
          </div>
          <Link to="/gaps" className="px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 hover:border-red-500/50 text-sm font-semibold text-red-400 hover:text-red-300 transition flex items-center gap-2">
            📊 Gap Report
          </Link>
        </div>

        {/* Subject Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {SUBJECTS.map(s => (
            <button
              key={s}
              onClick={() => setActiveSubject(s)}
              className="px-5 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition"
              style={{
                background: activeSubject === s ? 'linear-gradient(135deg,#6366F1,#8B5CF6)' : 'rgba(30,41,59,0.8)',
                color: activeSubject === s ? '#fff' : '#94A3B8',
                border: activeSubject === s ? '1px solid transparent' : '1px solid #1E293B',
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Topics Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="rounded-2xl bg-slate-800/60 border border-slate-700/50 p-5 animate-pulse">
                <div className="h-4 bg-slate-700 rounded w-3/4 mb-3" />
                <div className="h-2 bg-slate-700 rounded w-full mb-2" />
                <div className="h-3 bg-slate-700 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(topic => {
              const m = getMasteryMeta(topic.theta);
              return (
                <div
                  key={topic.id}
                  className="rounded-2xl border border-slate-700/60 p-5 flex flex-col gap-3 transition hover:border-indigo-500/40 hover:scale-[1.01]"
                  style={{ background: 'rgba(15,23,42,0.9)', backdropFilter: 'blur(12px)' }}
                >
                  {/* Topic name + gap badge */}
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-bold text-white text-sm leading-snug">{topic.topic_name}</span>
                    {topic.gap_detected && (
                      <span className="shrink-0 text-xs font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                        Gap Detected
                      </span>
                    )}
                  </div>

                  {/* Subject tag */}
                  <span className="text-xs text-slate-500 font-medium">{topic.subject}</span>

                  {/* Mastery bar */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold" style={{ color: m.color }}>{m.label}</span>
                      <span className="text-xs text-slate-500">{m.pct > 0 ? `${Math.round(m.pct)}%` : '—'}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-700 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${m.pct}%`, background: m.color }}
                      />
                    </div>
                  </div>

                  {/* Last assessed */}
                  <p className="text-xs text-slate-500">
                    {topic.last_assessed ? `Last assessed: ${topic.last_assessed}` : 'Never assessed'}
                  </p>

                  {/* Start button */}
                  <button
                    onClick={() => onStartQuiz(topic.id, topic.topic_name)}
                    className="mt-auto w-full py-2 rounded-xl text-sm font-bold transition"
                    style={{
                      background: topic.gap_detected
                        ? 'linear-gradient(135deg,#EF4444,#DC2626)'
                        : 'linear-gradient(135deg,#6366F1,#8B5CF6)',
                      boxShadow: topic.gap_detected ? '0 0 20px rgba(239,68,68,0.25)' : '0 0 20px rgba(99,102,241,0.25)',
                    }}
                  >
                    {topic.gap_detected ? '🚨 Fix Gap' : '▶ Start Quiz'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ACTIVE QUIZ SCREEN
// ══════════════════════════════════════════════════════════════════════════════
function ActiveQuizScreen({ quiz, onExit }) {
  const {
    quizState, isLoading, error,
    topicName, totalQuestions, currentIndex,
    timeLeft, timerMax,
    currentQuestion, selectedOption, revealData,
    currentTheta, getThetaLabel,
    submitAnswer, nextQuestion, selectOption, resetQuiz,
  } = quiz;

  const isLast = currentIndex === totalQuestions - 1;
  const thetaMeta = getThetaLabel(currentTheta);
  const timerPct = (timeLeft / timerMax) * 100;
  const timerColor = timeLeft > 30 ? '#6366F1' : timeLeft > 10 ? '#F59E0B' : '#EF4444';

  // Theta visual bar (6 blocks)
  const thetaBlocks = 6;
  const thetaFilled = currentTheta !== null
    ? Math.round(((currentTheta + 2) / 4) * thetaBlocks)
    : 0;

  const OPTIONS = ['A', 'B', 'C', 'D'];

  if (isLoading && quizState === QUIZ_STATES.STARTING) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-slate-400">Loading quiz for <span className="text-white font-bold">{topicName}</span>…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center">
        <div className="text-center space-y-4 max-w-sm px-6">
          <span className="text-5xl">⚠️</span>
          <p className="text-red-400 font-semibold">{error}</p>
          <button onClick={() => { resetQuiz(); onExit(); }} className="px-6 py-2 rounded-xl bg-slate-800 text-sm font-semibold text-white">← Back</button>
        </div>
      </div>
    );
  }

  if (!currentQuestion) return null;

  const optionLabels = {
    A: currentQuestion.options?.A || '',
    B: currentQuestion.options?.B || '',
    C: currentQuestion.options?.C || '',
    D: currentQuestion.options?.D || '',
  };

  return (
    <div className="min-h-screen bg-[#0F172A] text-white flex flex-col">
      {/* Timer bar */}
      <div className="h-1 w-full bg-slate-800">
        <div
          className="h-full transition-all duration-1000"
          style={{ width: `${timerPct}%`, background: timerColor }}
        />
      </div>

      <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-6 flex flex-col gap-5">

        {/* Top bar */}
        <div className="flex items-center justify-between">
          <button onClick={() => { resetQuiz(); onExit(); }} className="text-slate-500 hover:text-slate-300 text-sm transition">✕ Exit</button>
          <span className="text-xs font-bold text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20">
            {topicName}
          </span>
          <span className="text-sm text-slate-400 font-mono">{timeLeft}s</span>
        </div>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5 flex-wrap">
          {[...Array(totalQuestions)].map((_, i) => (
            <div
              key={i}
              className="rounded-full transition-all duration-300"
              style={{
                width: i === currentIndex ? '10px' : '8px',
                height: i === currentIndex ? '10px' : '8px',
                background: i < currentIndex ? '#6366F1' : i === currentIndex ? '#A5B4FC' : '#1E293B',
                boxShadow: i === currentIndex ? '0 0 8px #6366F1' : 'none',
                animation: i === currentIndex ? 'pulse 1.5s infinite' : 'none',
              }}
            />
          ))}
        </div>

        {/* Theta indicator */}
        {currentTheta !== null && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>Estimated ability:</span>
            <div className="flex gap-0.5">
              {[...Array(thetaBlocks)].map((_, i) => (
                <div key={i} className="w-4 h-1.5 rounded-sm"
                  style={{ background: i < thetaFilled ? thetaMeta.color : '#1E293B' }} />
              ))}
            </div>
            <span style={{ color: thetaMeta.color }}>{thetaMeta.label}</span>
          </div>
        )}

        {/* Question badge + text */}
        <div
          className="rounded-2xl border border-slate-700/60 p-6 space-y-3"
          style={{ background: 'rgba(15,23,42,0.95)' }}
        >
          <span className="text-xs font-black text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">
            Q{currentIndex + 1}
          </span>
          <p className="text-white text-lg font-semibold leading-relaxed">
            {currentQuestion.question_text}
          </p>
        </div>

        {/* Options */}
        <div className="grid grid-cols-1 gap-3">
          {OPTIONS.map(opt => {
            const label = optionLabels[opt];
            if (!label) return null;

            let bg = 'rgba(30,41,59,0.8)';
            let border = '1px solid #1E293B';
            let textColor = '#CBD5E1';

            if (revealData) {
              if (opt === revealData.correctOption) {
                bg = 'rgba(34,197,94,0.15)'; border = '1px solid #22C55E'; textColor = '#86EFAC';
              } else if (opt === selectedOption && !revealData.isCorrect) {
                bg = 'rgba(239,68,68,0.15)'; border = '1px solid #EF4444'; textColor = '#FCA5A5';
              }
            } else if (opt === selectedOption) {
              bg = 'rgba(99,102,241,0.2)'; border = '1px solid #6366F1'; textColor = '#C7D2FE';
            }

            return (
              <button
                key={opt}
                id={`option-${opt}`}
                onClick={() => selectOption(opt)}
                disabled={!!revealData}
                className="w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 hover:scale-[1.01]"
                style={{ background: bg, border, color: textColor }}
              >
                <span className="font-black mr-2 opacity-60">{opt}.</span>{label}
              </button>
            );
          })}
        </div>

        {/* Explanation reveal */}
        {revealData && (
          <div
            className="rounded-xl border p-4 text-sm leading-relaxed animate-slide-up"
            style={{
              background: revealData.isCorrect ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
              border: `1px solid ${revealData.isCorrect ? '#22C55E40' : '#EF444440'}`,
              color: '#CBD5E1',
            }}
          >
            <p className="font-bold mb-1" style={{ color: revealData.isCorrect ? '#22C55E' : '#EF4444' }}>
              {revealData.isCorrect ? '✅ Correct!' : '❌ Incorrect'}
            </p>
            {revealData.explanation}
          </div>
        )}

        {/* Action button */}
        <div className="mt-auto">
          {!revealData ? (
            <button
              id="submit-answer-btn"
              onClick={submitAnswer}
              disabled={!selectedOption}
              className="w-full py-3 rounded-xl font-bold text-sm transition-all"
              style={{
                background: selectedOption ? 'linear-gradient(135deg,#6366F1,#8B5CF6)' : '#1E293B',
                color: selectedOption ? '#fff' : '#475569',
                cursor: selectedOption ? 'pointer' : 'not-allowed',
              }}
            >
              Submit Answer
            </button>
          ) : (
            <button
              id="next-question-btn"
              onClick={nextQuestion}
              className="w-full py-3 rounded-xl font-bold text-sm transition-all"
              style={{ background: 'linear-gradient(135deg,#6366F1,#8B5CF6)' }}
            >
              {isLast ? 'View Results →' : 'Next Question →'}
            </button>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slide-up {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-slide-up { animation: slide-up 0.35s ease both; }
        @keyframes pulse {
          0%,100% { opacity:1; } 50% { opacity:0.4; }
        }
      `}</style>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// RESULTS SCREEN
// ══════════════════════════════════════════════════════════════════════════════
function ResultsScreen({ result, topicName, onRetake, onExit }) {
  const [displayScore, setDisplayScore] = useState(0);
  const [showTokens, setShowTokens] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let start = 0;
    const end = Math.round(result.score_percent);
    const step = Math.max(1, Math.floor(end / 40));
    const timer = setInterval(() => {
      start = Math.min(start + step, end);
      setDisplayScore(start);
      if (start >= end) clearInterval(timer);
    }, 40);
    const tokenTimer = setTimeout(() => setShowTokens(true), 1200);
    return () => { clearInterval(timer); clearTimeout(tokenTimer); };
  }, [result.score_percent]);

  const score = result.score_percent;
  const badge = score >= 85 ? { label: 'Excellent 🏆', color: '#22C55E' }
    : score >= 70 ? { label: 'Proficient 🎯', color: '#6366F1' }
    : score >= 50 ? { label: 'Developing 📖', color: '#F59E0B' }
    : { label: 'Needs Work 📝', color: '#EF4444' };

  const thetaDelta = (result.theta_after - result.theta_before).toFixed(2);
  const thetaUp = parseFloat(thetaDelta) >= 0;

  const gapCard = result.gap_detected
    ? { bg: 'rgba(239,68,68,0.1)', border: '#EF444440', icon: '🚨', text: result.revision_hours > 2 ? `Gap detected — ${result.revision_hours}h of revision recommended` : 'Gap detected — focus on this before moving on' }
    : score >= 80
    ? { bg: 'rgba(34,197,94,0.1)', border: '#22C55E40', icon: '✅', text: 'No gap detected — keep it up!' }
    : { bg: 'rgba(245,158,11,0.1)', border: '#F59E0B40', icon: '⚠️', text: `Minor gap — ${result.revision_hours || 1}h of revision recommended` };

  return (
    <div className="min-h-screen bg-[#0F172A] text-white flex flex-col items-center justify-start py-10 px-4">
      <div className="w-full max-w-md space-y-5">
        {/* Back */}
        <button onClick={onExit} className="text-slate-500 text-sm hover:text-slate-300 transition">← Back to Topics</button>

        {/* Score circle */}
        <div className="flex flex-col items-center gap-3 py-6">
          <div
            className="w-36 h-36 rounded-full flex items-center justify-center border-4"
            style={{ borderColor: badge.color, boxShadow: `0 0 40px ${badge.color}40` }}
          >
            <div className="text-center">
              <div className="text-4xl font-black" style={{ color: badge.color }}>{displayScore}%</div>
              <div className="text-xs text-slate-400 mt-1">{result.correct_count}/{result.total_questions} correct</div>
            </div>
          </div>
          <div className="text-lg font-bold" style={{ color: badge.color }}>{badge.label}</div>
          <div className="text-sm text-slate-400 text-center">{result.feedback_message}</div>
        </div>

        {/* Theta change */}
        <div className="rounded-2xl border border-slate-700/50 p-4 bg-slate-800/40 flex items-center justify-between">
          <span className="text-sm text-slate-400">Ability estimate</span>
          <span className="text-sm font-bold text-white">
            {result.theta_before?.toFixed(1)} → {result.theta_after?.toFixed(1)}
            <span className="ml-2 text-xs" style={{ color: thetaUp ? '#22C55E' : '#EF4444' }}>
              {thetaUp ? '↑' : '↓'} {Math.abs(thetaDelta)}
            </span>
          </span>
        </div>

        {/* Gap card */}
        <div
          className="rounded-2xl p-4 flex gap-3 items-start"
          style={{ background: gapCard.bg, border: `1px solid ${gapCard.border}` }}
        >
          <span className="text-xl">{gapCard.icon}</span>
          <p className="text-sm text-slate-200">{gapCard.text}</p>
        </div>

        {/* Prereq gaps */}
        {result.prereq_gaps?.length > 0 && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
            <p className="text-xs text-amber-400 font-bold mb-2">Before revisiting this, strengthen:</p>
            <div className="flex flex-wrap gap-2">
              {result.prereq_gaps.map((g, i) => (
                <span key={i} className="text-xs px-2 py-1 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/20">{g}</span>
              ))}
            </div>
          </div>
        )}

        {/* Token reward */}
        {result.tokens_earned > 0 && showTokens && (
          <div className="rounded-2xl border border-yellow-400/30 bg-yellow-400/10 p-4 flex items-center gap-3 animate-slide-up">
            <span className="text-3xl">🪙</span>
            <div>
              <p className="text-yellow-300 font-bold text-sm">+{result.tokens_earned} tokens earned!</p>
              <p className="text-slate-400 text-xs">Great score — reward credited to your wallet</p>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onRetake}
            className="py-3 rounded-xl text-sm font-bold border border-slate-700 text-slate-300 hover:border-indigo-500/50 hover:text-white transition"
          >
            🔄 Retake Quiz
          </button>
          <button
            onClick={() => navigate('/dashboard')}
            className="py-3 rounded-xl text-sm font-bold transition"
            style={{ background: 'linear-gradient(135deg,#6366F1,#8B5CF6)' }}
          >
            📚 Study This
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slide-up {
          from { opacity:0; transform:translateY(12px); }
          to   { opacity:1; transform:translateY(0); }
        }
        .animate-slide-up { animation: slide-up 0.4s ease both; }
      `}</style>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN QuizPage ORCHESTRATOR
// ══════════════════════════════════════════════════════════════════════════════
export default function QuizPage() {
  const quiz = useQuiz();
  const { quizState, startQuiz, resetQuiz, quizResult, topicName } = quiz;

  const handleStartQuiz = (topicId, name) => startQuiz(topicId, name);
  const handleExit = () => resetQuiz();
  const handleRetake = () => { resetQuiz(); };

  if (quizState === QUIZ_STATES.IDLE) {
    return <TopicSelectionScreen onStartQuiz={handleStartQuiz} />;
  }

  if (quizState === QUIZ_STATES.FINISHED && quizResult) {
    return (
      <ResultsScreen
        result={quizResult}
        topicName={topicName}
        onRetake={handleRetake}
        onExit={handleExit}
      />
    );
  }

  return <ActiveQuizScreen quiz={quiz} onExit={handleExit} />;
}
