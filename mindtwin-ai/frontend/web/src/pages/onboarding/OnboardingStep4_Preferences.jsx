import { useState } from 'react';
import { useOnboardingStore } from '../../stores/onboardingStore';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';

const SOCIAL_APPS = ['Instagram', 'YouTube', 'Snapchat', 'Twitter/X', 'WhatsApp', 'TikTok', 'Other'];
const START_TIMES = [
  { label: '🌅 Morning', sublabel: '7:00 AM', value: '07:00' },
  { label: '☀️ Afternoon', sublabel: '2:00 PM', value: '14:00' },
  { label: '🌙 Evening', sublabel: '7:00 PM', value: '19:00' },
];

export default function OnboardingStep4_Preferences() {
  const { studyPreferences, setPreferences, nextStep } = useOnboardingStore();
  const [hours, setHours] = useState(studyPreferences.max_daily_study_hours || 5);
  const [startTime, setStartTime] = useState(studyPreferences.preferred_study_start_time || '08:00');
  const [selectedApps, setSelectedApps] = useState(studyPreferences.social_media_apps || []);
  const [parentView, setParentView] = useState(false);

  const toggleApp = (app) => {
    setSelectedApps((prev) =>
      prev.includes(app) ? prev.filter((a) => a !== app) : [...prev, app]
    );
  };

  const handleContinue = () => {
    setPreferences({
      max_daily_study_hours: hours,
      preferred_study_start_time: startTime,
      social_media_apps: selectedApps,
      parent_view_enabled: parentView,
    });
    nextStep();
  };

  return (
    <OnboardingLayout>
      <div className="bg-slate-800/60 rounded-2xl p-6 border border-slate-700/50">
        <h2 className="text-2xl font-bold text-white mb-1">Study Preferences</h2>
        <p className="text-slate-400 text-sm mb-6">Customize how MindTwin plans your schedule.</p>

        {/* Hours Slider */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <label className="text-sm font-medium text-slate-300">Max study hours per day</label>
            <span className="text-indigo-400 font-bold text-lg">{hours}h</span>
          </div>
          <input
            type="range" min="1" max="10" value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
            className="w-full accent-indigo-500"
          />
          <div className="flex justify-between text-xs text-slate-500 mt-1">
            <span>1h</span><span>10h</span>
          </div>
        </div>

        {/* Start Time */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-slate-300 mb-3">When do you usually start studying?</label>
          <div className="grid grid-cols-3 gap-2">
            {START_TIMES.map((t) => (
              <button
                key={t.value}
                onClick={() => setStartTime(t.value)}
                className={`flex flex-col items-center py-3 rounded-xl border transition-all duration-200 ${
                  startTime === t.value
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-indigo-500/50'
                }`}
              >
                <span className="text-xl">{t.label.split(' ')[0]}</span>
                <span className="text-xs font-semibold mt-1">{t.label.split(' ').slice(1).join(' ')}</span>
                <span className="text-xs opacity-60">{t.sublabel}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Social Media */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-slate-300 mb-3">
            Which apps distract you most?
          </label>
          <div className="flex flex-wrap gap-2">
            {SOCIAL_APPS.map((app) => (
              <button
                key={app}
                onClick={() => toggleApp(app)}
                className={`px-3 py-1.5 rounded-full text-sm border transition-all duration-200 ${
                  selectedApps.includes(app)
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-indigo-500/50'
                }`}
              >
                {app}
              </button>
            ))}
          </div>
        </div>

        {/* Parent/Teacher Toggle */}
        <div className="flex items-center justify-between p-4 bg-slate-900 rounded-xl border border-slate-700 mb-6">
          <div>
            <p className="text-white text-sm font-medium">Enable parent/teacher view</p>
            <p className="text-slate-500 text-xs mt-0.5">Share your progress dashboard with a guardian</p>
          </div>
          <button
            onClick={() => setParentView(!parentView)}
            className={`w-12 h-6 rounded-full transition-all duration-200 relative ${parentView ? 'bg-indigo-600' : 'bg-slate-700'}`}
          >
            <span
              className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all duration-200 ${parentView ? 'left-7' : 'left-1'}`}
            />
          </button>
        </div>

        <button
          onClick={handleContinue}
          className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-base transition-all duration-200 shadow-lg shadow-indigo-500/30"
        >
          Continue →
        </button>
      </div>
    </OnboardingLayout>
  );
}
