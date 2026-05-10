import { useOnboardingStore } from '../../stores/onboardingStore';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';

const FEATURES = [
  {
    icon: '🧠',
    title: 'Personalized Plans',
    desc: 'A study schedule built around your exams, pace, and strengths.',
  },
  {
    icon: '💓',
    title: 'Stress Detection',
    desc: 'We monitor your mood and adjust your plan before burnout hits.',
  },
  {
    icon: '🎮',
    title: 'Earn Your Screen Time',
    desc: 'Complete sessions to unlock social media — guilt-free.',
  },
];

export default function OnboardingStep1_Welcome() {
  const { nextStep } = useOnboardingStore();

  return (
    <OnboardingLayout showBack={false}>
      <div className="text-center mb-10">
        {/* Animated Logo */}
        <div
          className="mx-auto mb-6 w-20 h-20 rounded-2xl bg-indigo-600 flex items-center justify-center text-4xl shadow-lg shadow-indigo-500/30"
          style={{ animation: 'float 3s ease-in-out infinite' }}
        >
          🧬
        </div>

        <h1 className="text-4xl font-bold text-white mb-3 tracking-tight">
          Meet Your{' '}
          <span className="text-indigo-400">MindTwin</span>
        </h1>
        <p className="text-slate-400 text-lg max-w-sm mx-auto leading-relaxed">
          Your personal AI study companion that learns how you think.
        </p>
      </div>

      {/* Feature Cards */}
      <div className="flex flex-col gap-3 mb-10">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="flex items-start gap-4 bg-slate-800/60 rounded-2xl p-4 border border-slate-700/50 hover:border-indigo-500/30 transition-all duration-200"
          >
            <span className="text-2xl mt-0.5">{f.icon}</span>
            <div>
              <h3 className="text-white font-semibold text-sm">{f.title}</h3>
              <p className="text-slate-400 text-sm mt-0.5 leading-relaxed">{f.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={nextStep}
        className="w-full py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-lg transition-all duration-200 shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:-translate-y-0.5"
      >
        Get Started →
      </button>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
      `}</style>
    </OnboardingLayout>
  );
}
