import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import confetti from 'canvas-confetti';
import api from '../../api/axios';
import { useOnboardingStore } from '../../stores/onboardingStore';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';

const EMOJI_OPTIONS = [
  { emoji: '😕', label: 'Very Lost', score: 20 },
  { emoji: '😐', label: 'Shaky', score: 40 },
  { emoji: '🙂', label: 'Okay', score: 60 },
  { emoji: '😊', label: 'Good', score: 80 },
  { emoji: '🌟', label: 'Confident', score: 100 },
];

// Fallback topics if the quiz endpoint isn't ready yet
const FALLBACK_TOPICS = [
  { id: 'fallback-1', topic_name: 'Algebra & Equations', subject: 'Mathematics' },
  { id: 'fallback-2', topic_name: 'Organic Chemistry Basics', subject: 'Chemistry' },
  { id: 'fallback-3', topic_name: 'Mechanics (Newton\'s Laws)', subject: 'Physics' },
  { id: 'fallback-4', topic_name: 'Cell Biology', subject: 'Biology' },
  { id: 'fallback-5', topic_name: 'Modern History', subject: 'History' },
];

export default function OnboardingStep5_BaselineQuiz() {
  const navigate = useNavigate();
  const { examDates, studyPreferences, baselineQuizResults, setQuizResult, reset } = useOnboardingStore();

  const [topics, setTopics] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/api/quiz/baseline-questions')
      .then((res) => setTopics(res.data.topics || FALLBACK_TOPICS))
      .catch(() => setTopics(FALLBACK_TOPICS))
      .finally(() => setLoading(false));
  }, []);

  const handleAnswer = async (score) => {
    const topic = topics[currentQuestion];
    setQuizResult({ topic_id: topic.id, score_percent: score });
    setSelected(score);

    await new Promise((r) => setTimeout(r, 400)); // Brief visual feedback

    if (currentQuestion < topics.length - 1) {
      setCurrentQuestion((q) => q + 1);
      setSelected(null);
    } else {
      await handleSubmit();
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    try {
      await api.post('/api/profile/onboarding/complete', {
        exam_dates: examDates,
        study_preferences: studyPreferences,
        baseline_quiz_results: baselineQuizResults,
      });

      // 🎉 Confetti!
      confetti({ particleCount: 180, spread: 100, origin: { y: 0.6 }, colors: ['#6366f1', '#818cf8', '#c7d2fe', '#ffffff'] });
      setTimeout(() => confetti({ particleCount: 80, angle: 60, spread: 55, origin: { x: 0 } }), 300);
      setTimeout(() => confetti({ particleCount: 80, angle: 120, spread: 55, origin: { x: 1 } }), 500);

      reset();
      setTimeout(() => navigate('/dashboard'), 1500);
    } catch (err) {
      setError(err.response?.data?.error || 'Submission failed. Please try again.');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <OnboardingLayout>
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </OnboardingLayout>
    );
  }

  const topic = topics[currentQuestion];
  const progress = ((currentQuestion) / topics.length) * 100;

  return (
    <OnboardingLayout>
      <div className="bg-slate-800/60 rounded-2xl p-6 border border-slate-700/50">
        <h2 className="text-2xl font-bold text-white mb-1">Quick Check-in</h2>
        <p className="text-slate-400 text-sm mb-4">
          This helps us understand where you are right now. Don't stress — there are no wrong answers here.
        </p>

        {/* Progress Bar */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-slate-400 text-sm font-medium whitespace-nowrap">
            {currentQuestion + 1} / {topics.length}
          </span>
        </div>

        {/* Question */}
        <div className="text-center mb-6">
          <p className="text-slate-400 text-xs uppercase tracking-widest mb-1">{topic?.subject}</p>
          <h3 className="text-xl font-bold text-white mb-2">{topic?.topic_name}</h3>
          <p className="text-slate-400 text-sm">How comfortable are you with this topic?</p>
        </div>

        {/* Emoji Options */}
        <div className="grid grid-cols-5 gap-2 mb-4">
          {EMOJI_OPTIONS.map((opt) => (
            <button
              key={opt.score}
              onClick={() => !submitting && handleAnswer(opt.score)}
              disabled={submitting || selected !== null}
              className={`flex flex-col items-center py-3 px-1 rounded-xl border transition-all duration-200 ${
                selected === opt.score
                  ? 'bg-indigo-600 border-indigo-500 scale-110'
                  : 'bg-slate-900 border-slate-700 hover:border-indigo-500/50 hover:bg-slate-800'
              }`}
            >
              <span className="text-2xl">{opt.emoji}</span>
              <span className="text-xs text-slate-400 mt-1 leading-tight text-center">{opt.label}</span>
            </button>
          ))}
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-400 text-sm">
            {error}
          </div>
        )}

        {submitting && (
          <div className="flex items-center justify-center gap-3 mt-4 text-indigo-400">
            <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Building your MindTwin...</span>
          </div>
        )}
      </div>
    </OnboardingLayout>
  );
}
