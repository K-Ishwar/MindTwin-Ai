import { create } from 'zustand';

export const useOnboardingStore = create((set) => ({
  currentStep: 0,
  examDates: [],
  studyPreferences: {
    max_daily_study_hours: 5,
    preferred_study_start_time: '08:00',
    social_media_apps: [],
  },
  baselineQuizResults: [],

  nextStep: () => set((s) => ({ currentStep: Math.min(s.currentStep + 1, 4) })),
  prevStep: () => set((s) => ({ currentStep: Math.max(s.currentStep - 1, 0) })),

  setExamDates: (examDates) => set({ examDates }),

  setPreferences: (prefs) =>
    set((s) => ({ studyPreferences: { ...s.studyPreferences, ...prefs } })),

  setQuizResult: (result) =>
    set((s) => {
      const existing = s.baselineQuizResults.filter((r) => r.topic_id !== result.topic_id);
      return { baselineQuizResults: [...existing, result] };
    }),

  reset: () =>
    set({
      currentStep: 0,
      examDates: [],
      studyPreferences: {
        max_daily_study_hours: 5,
        preferred_study_start_time: '08:00',
        social_media_apps: [],
      },
      baselineQuizResults: [],
    }),
}));
