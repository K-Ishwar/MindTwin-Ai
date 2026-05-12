import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from './components/Toast';
import ProtectedRoute from './components/ProtectedRoute';
import GuardianProtectedRoute from './components/GuardianProtectedRoute';
import { useAuthStore } from './stores/authStore';
import LoginPage from './pages/LoginPage';
import OnboardingPage from './pages/OnboardingPage';
import Dashboard from './pages/Dashboard';
import QuizPage from './pages/QuizPage';
import GapReportPage from './pages/GapReportPage';
import StressPage from './pages/StressPage';
<<<<<<< HEAD
import ProgressPage from './pages/ProgressPage';
import KnowledgeGraphPage from './pages/KnowledgeGraphPage';
=======
import GuardianLogin from './pages/guardian/GuardianLogin';
import GuardianRegister from './pages/guardian/GuardianRegister';
import GuardianDashboard from './pages/guardian/GuardianDashboard';
import AdminLogin from './pages/admin/AdminLogin';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminProtectedRoute from './components/AdminProtectedRoute';
>>>>>>> cb4458a60e96d61275eb8dbf65c93cda4221c664

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

export default function App() {
  const { isAuthenticated } = useAuthStore();

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            {/* Root: smart redirect */}
            <Route
              path="/"
              element={<Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />}
            />

            {/* ── Student auth ── */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<Navigate to="/onboarding" replace />} />

            {/* Onboarding — auth not required for registration flow */}
            <Route path="/onboarding" element={<OnboardingPage />} />

            {/* Dashboard — requires auth + completed onboarding */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />

            {/* Quiz & Gap pages */}
<<<<<<< HEAD
            <Route path="/quiz"           element={<ProtectedRoute><QuizPage /></ProtectedRoute>} />
            <Route path="/gaps"           element={<ProtectedRoute><GapReportPage /></ProtectedRoute>} />
            <Route path="/stress"         element={<ProtectedRoute><StressPage /></ProtectedRoute>} />
            <Route path="/knowledge-map"  element={<ProtectedRoute><KnowledgeGraphPage /></ProtectedRoute>} />

            {/* Future pages — stubs */}
            <Route path="/progress" element={<ProtectedRoute><ProgressPage /></ProtectedRoute>} />
            <Route path="/rewards"  element={<ProtectedRoute><PlaceholderPage title="Rewards"      emoji="🎁" /></ProtectedRoute>} />
            <Route path="/profile"  element={<ProtectedRoute><PlaceholderPage title="Profile"      emoji="👤" /></ProtectedRoute>} />
=======
            <Route path="/quiz"   element={<ProtectedRoute><QuizPage /></ProtectedRoute>} />
            <Route path="/gaps"   element={<ProtectedRoute><GapReportPage /></ProtectedRoute>} />
            <Route path="/stress" element={<ProtectedRoute><StressPage /></ProtectedRoute>} />

            {/* Future student pages — stubs */}
            <Route path="/progress" element={<ProtectedRoute><PlaceholderPage title="My Progress" emoji="📈" /></ProtectedRoute>} />
            <Route path="/rewards"  element={<ProtectedRoute><PlaceholderPage title="Rewards"     emoji="🎁" /></ProtectedRoute>} />
            <Route path="/profile"  element={<ProtectedRoute><PlaceholderPage title="Profile"     emoji="👤" /></ProtectedRoute>} />

            {/* ── Guardian portal ── */}
            <Route path="/guardian/login"    element={<GuardianLogin />} />
            <Route path="/guardian/register" element={<GuardianRegister />} />
            <Route
              path="/guardian/dashboard"
              element={
                <GuardianProtectedRoute>
                  <GuardianDashboard />
                </GuardianProtectedRoute>
              }
            />

            {/* ── Admin portal ── */}
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route
              path="/admin"
              element={
                <AdminProtectedRoute>
                  <AdminDashboard />
                </AdminProtectedRoute>
              }
            />
>>>>>>> cb4458a60e96d61275eb8dbf65c93cda4221c664

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

function PlaceholderPage({ title, emoji }) {
  return (
    <div className="min-h-screen bg-[#0F172A] flex flex-col items-center justify-center gap-4 text-white">
      <span className="text-6xl">{emoji}</span>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-slate-500 text-sm">Coming in the next phase</p>
      <a href="/dashboard" className="mt-4 px-6 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold transition">
        ← Back to Dashboard
      </a>
    </div>
  );
}
