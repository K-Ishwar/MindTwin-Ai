import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useGuardianStore } from '../../stores/guardianStore';

export default function GuardianRegister() {
  const { register } = useGuardianStore();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'parent',
    institution_name: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const payload = {
        name: form.name,
        email: form.email,
        password: form.password,
        role: form.role,
        ...(form.role === 'teacher' && form.institution_name
          ? { institution_name: form.institution_name }
          : {}),
      };
      await register(payload);
      navigate('/guardian/login', {
        state: { message: 'Account created! Sign in and then link your student.' },
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center text-3xl shadow-lg shadow-indigo-500/30">
            🧬
          </div>
          <h1 className="text-3xl font-bold text-white">Create account</h1>
          <p className="text-slate-400 mt-1">Register as a Parent or Teacher</p>
        </div>

        <div className="bg-slate-800/60 rounded-2xl p-6 border border-slate-700/50">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-4 text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Full name */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Full Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Jane Smith"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                required
              />
            </div>

            {/* Email */}
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

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Password</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Min. 8 characters"
                minLength={8}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                required
              />
            </div>

            {/* Role radio */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">I am a…</label>
              <div className="flex gap-3">
                {['parent', 'teacher'].map((r) => (
                  <label
                    key={r}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border cursor-pointer transition text-sm font-semibold ${
                      form.role === r
                        ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
                        : 'border-slate-700 text-slate-400 hover:border-slate-500'
                    }`}
                  >
                    <input
                      type="radio"
                      name="role"
                      value={r}
                      checked={form.role === r}
                      onChange={() => setForm({ ...form, role: r })}
                      className="sr-only"
                    />
                    {r === 'parent' ? '👨‍👩‍👧 Parent' : '🏫 Teacher'}
                  </label>
                ))}
              </div>
            </div>

            {/* Institution — only for teachers */}
            {form.role === 'teacher' && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Institution Name
                </label>
                <input
                  type="text"
                  value={form.institution_name}
                  onChange={(e) => setForm({ ...form, institution_name: e.target.value })}
                  placeholder="e.g. Delhi Public School"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold transition-all duration-200 shadow-lg shadow-indigo-500/30 mt-2"
            >
              {loading ? 'Creating account...' : 'Create Account →'}
            </button>
          </form>

          <p className="text-center text-slate-400 text-sm mt-4">
            Already have an account?{' '}
            <Link to="/guardian/login" className="text-indigo-400 hover:text-indigo-300 font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
