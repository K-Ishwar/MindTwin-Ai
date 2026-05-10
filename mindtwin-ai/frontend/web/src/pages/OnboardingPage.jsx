import { useOnboardingStore } from '../stores/onboardingStore';
import OnboardingStep1_Welcome from './onboarding/OnboardingStep1_Welcome';
import OnboardingStep2_Profile from './onboarding/OnboardingStep2_Profile';
import OnboardingStep3_Exams from './onboarding/OnboardingStep3_Exams';
import OnboardingStep4_Preferences from './onboarding/OnboardingStep4_Preferences';
import OnboardingStep5_BaselineQuiz from './onboarding/OnboardingStep5_BaselineQuiz';

const STEPS = [
  OnboardingStep1_Welcome,
  OnboardingStep2_Profile,
  OnboardingStep3_Exams,
  OnboardingStep4_Preferences,
  OnboardingStep5_BaselineQuiz,
];

export default function OnboardingPage() {
  const { currentStep } = useOnboardingStore();
  const StepComponent = STEPS[currentStep];
  return <StepComponent />;
}
