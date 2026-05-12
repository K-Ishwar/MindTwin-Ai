import { Navigate } from 'react-router-dom';
import { useGuardianStore } from '../stores/guardianStore';

/**
 * GuardianProtectedRoute — guards routes that require a guardian session.
 * Unauthenticated visitors are redirected to /guardian/login.
 */
export default function GuardianProtectedRoute({ children }) {
  const { isAuthenticated } = useGuardianStore();

  if (!isAuthenticated) {
    return <Navigate to="/guardian/login" replace />;
  }

  return children;
}
