import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from './components/Toast';
import ProtectedRoute from './components/ProtectedRoute';
import { useAuthStore } from './stores/authStore';
import LoginPage from './pages/LoginPage';
import OnboardingPage from './pages/OnboardingPage';
import Dashboard from './pages/Dashboard';
import QuizPage from './pages/QuizPage';
import GapReportPage from './pages/GapReportPage';
import StressPage from './pages/StressPage';

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

            {/* Auth */}
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
            <Route path="/quiz"     element={<ProtectedRoute><QuizPage /></ProtectedRoute>} />
            <Route path="/gaps"     element={<ProtectedRoute><GapReportPage /></ProtectedRoute>} />
            <Route path="/stress"   element={<ProtectedRoute><StressPage /></ProtectedRoute>} />

            {/* Future pages — stubs */}
            <Route path="/progress" element={<ProtectedRoute><PlaceholderPage title="My Progress"  emoji="📈" /></ProtectedRoute>} />
            <Route path="/rewards"  element={<ProtectedRoute><PlaceholderPage title="Rewards"      emoji="🎁" /></ProtectedRoute>} />
            <Route path="/profile"  element={<ProtectedRoute><PlaceholderPage title="Profile"      emoji="👤" /></ProtectedRoute>} />

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
