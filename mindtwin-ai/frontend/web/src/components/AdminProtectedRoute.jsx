import { Navigate } from 'react-router-dom';
import { useAdminStore } from '../stores/adminStore';

export default function AdminProtectedRoute({ children }) {
  const { isAuthenticated } = useAdminStore();
  if (!isAuthenticated) return <Navigate to="/admin/login" replace />;
  return children;
}
