import React from 'react';
import { useOnboardingStore } from '../../stores/onboardingStore';

const STEPS = ['Welcome', 'Profile', 'Exams', 'Preferences', 'Quiz'];

export default function OnboardingLayout({ children, showBack = true }) {
  const { currentStep, prevStep } = useOnboardingStore();

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center px-4 py-8 font-sans">
      {/* Step Indicator */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((label, i) => (
          <React.Fragment key={label}>
            <div className="flex flex-col items-center gap-1">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                  i < currentStep
                    ? 'bg-indigo-500 text-white'
                    : i === currentStep
                    ? 'bg-indigo-500 text-white ring-4 ring-indigo-500/30'
                    : 'bg-slate-700 text-slate-400'
                }`}
              >
                {i < currentStep ? '✓' : i + 1}
              </div>
              <span
                className={`text-[10px] hidden sm:block ${
                  i === currentStep ? 'text-indigo-400' : 'text-slate-500'
                }`}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`h-0.5 w-8 sm:w-12 transition-all duration-300 ${
                  i < currentStep ? 'bg-indigo-500' : 'bg-slate-700'
                }`}
              />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Card */}
      <div className="w-full max-w-lg">
        {showBack && currentStep > 0 && (
          <button
            onClick={prevStep}
            className="flex items-center gap-1 text-slate-400 hover:text-white transition mb-4 text-sm"
          >
            <span>←</span> Back
          </button>
        )}
        {children}
      </div>
    </div>
  );
}
