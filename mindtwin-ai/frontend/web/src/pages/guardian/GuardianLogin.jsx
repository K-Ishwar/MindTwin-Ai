import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useGuardianStore } from '../../stores/guardianStore';
import { useAuthStore } from '../../stores/authStore';

export default function GuardianLogin() {
  const { login: guardianLogin } = useGuardianStore();
  const { login: studentLogin } = useAuthStore();
  const navigate = useNavigate();

  const [mode, setMode] = useState('guardian'); // 'student' | 'guardian'
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (mode === 'guardian') {
        await guardianLogin(form);
        navigate('/guardian/dashboard');
      } else {
        await studentLogin(form);
        navigate('/dashboard');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center text-3xl shadow-lg shadow-indigo-500/30">
            🧬
          </div>
          <h1 className="text-3xl font-bold text-white">Welcome back</h1>
          <p className="text-slate-400 mt-1">Sign in to MindTwin</p>
        </div>

        {/* Mode toggle */}
        <div className="flex rounded-xl bg-slate-800 border border-slate-700 p-1 mb-6">
          <button
            onClick={() => { setMode('student'); setError(''); }}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${
              mode === 'student'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Student
          </button>
          <button
            onClick={() => { setMode('guardian'); setError(''); }}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${
              mode === 'guardian'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Parent / Teacher
          </button>
        </div>

        <div className="bg-slate-800/60 rounded-2xl p-6 border border-slate-700/50">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-4 text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="you@example.com"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Password</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Your password"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold transition-all duration-200 shadow-lg shadow-indigo-500/30 mt-2"
            >
              {loading ? 'Signing in...' : 'Sign In →'}
            </button>
          </form>

          <div className="mt-4 flex flex-col gap-2 text-center text-sm text-slate-400">
            {mode === 'guardian' ? (
              <>
                <p>
                  New here?{' '}
                  <Link to="/guardian/register" className="text-indigo-400 hover:text-indigo-300 font-medium">
                    Register as Parent / Teacher
                  </Link>
                </p>
              </>
            ) : (
              <p>
                Don't have an account?{' '}
                <Link to="/onboarding" className="text-indigo-400 hover:text-indigo-300 font-medium">
                  Get started
                </Link>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
