import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

/**
 * ProtectedRoute — guards routes requiring authentication.
 *
 * Behaviours:
 *  • Not authenticated → redirect to /login
 *  • Authenticated but onboarding_completed is false → redirect to /onboarding
 *  • Fully authenticated → render children
 *
 * Pass requireOnboarding={false} to allow partially-onboarded users through
 * (e.g. the onboarding page itself uses this to let step-3 users through).
 */
export default function ProtectedRoute({ children, requireOnboarding = true }) {
  const { isAuthenticated, student } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requireOnboarding && student && student.onboarding_completed === false) {
    return <Navigate to="/onboarding" replace />;
  }

  return children;
}
