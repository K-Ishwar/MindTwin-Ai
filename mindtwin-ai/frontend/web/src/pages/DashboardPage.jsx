import { useAuthStore } from '../stores/authStore';
import { useNavigate } from 'react-router-dom';

export default function DashboardPage() {
  const { student, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center px-4 text-center">
      <div
        className="mb-6 w-20 h-20 rounded-2xl bg-indigo-600 flex items-center justify-center text-4xl shadow-lg shadow-indigo-500/30"
        style={{ animation: 'float 3s ease-in-out infinite' }}
      >
        🧬
      </div>
      <h1 className="text-4xl font-bold text-white mb-2">
        Welcome, <span className="text-indigo-400">{student?.name || 'Explorer'}!</span>
      </h1>
      <p className="text-slate-400 text-lg mb-2">Your MindTwin is ready.</p>
      <div className="flex gap-3 mt-4 text-sm">
        <span className="bg-indigo-900/40 border border-indigo-500/30 text-indigo-300 px-3 py-1.5 rounded-full">
          {student?.grade_level}
        </span>
        <span className="bg-slate-800 border border-slate-700 text-slate-300 px-3 py-1.5 rounded-full">
          {student?.board}
        </span>
      </div>
      <p className="text-slate-500 text-sm mt-6 mb-8">Dashboard coming in Phase 3 🚀</p>
      <button
        onClick={handleLogout}
        className="px-6 py-2.5 rounded-xl bg-slate-800 border border-slate-700 hover:border-red-500/50 text-slate-400 hover:text-red-400 transition text-sm"
      >
        Sign out
      </button>
      <style>{`@keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }`}</style>
    </div>
  );
}
