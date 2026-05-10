import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useOnboardingStore } from '../../stores/onboardingStore';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';

const GRADE_LEVELS = [
  'Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12',
  'College 1st Year', 'College 2nd Year', 'College 3rd Year', 'Competitive Exam',
];
const BOARDS = ['CBSE', 'ICSE', 'Maharashtra State Board', 'Telangana Board', 'Other'];

export default function OnboardingStep2_Profile() {
  const { register, login, setStudent } = useAuthStore();
  const { nextStep } = useOnboardingStore();

  const [form, setForm] = useState({
    name: '', email: '', password: '', confirmPassword: '',
    grade_level: '', board: '',
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState('');

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Name is required';
    if (!/\S+@\S+\.\S+/.test(form.email)) errs.email = 'Valid email required';
    if (form.password.length < 8) errs.password = 'Min 8 characters';
    if (form.password !== form.confirmPassword) errs.confirmPassword = 'Passwords do not match';
    if (!form.grade_level) errs.grade_level = 'Select your grade';
    if (!form.board) errs.board = 'Select your board';
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setLoading(true);
    setServerError('');
    try {
      await register({ name: form.name, email: form.email, password: form.password, grade_level: form.grade_level, board: form.board });
      const loginData = await login({ email: form.email, password: form.password });
      setStudent(loginData.student);
      nextStep();
    } catch (err) {
      setServerError(err.response?.data?.error || 'Registration failed. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const field = (key, label, type = 'text', placeholder = '') => (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-1">{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        placeholder={placeholder}
        className={`w-full bg-slate-800 border rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition ${errors[key] ? 'border-red-500' : 'border-slate-700'}`}
      />
      {errors[key] && <p className="text-red-400 text-xs mt-1">{errors[key]}</p>}
    </div>
  );

  return (
    <OnboardingLayout>
      <div className="bg-slate-800/60 rounded-2xl p-6 border border-slate-700/50">
        <h2 className="text-2xl font-bold text-white mb-1">Create your account</h2>
        <p className="text-slate-400 text-sm mb-6">Tell us a bit about yourself to get started.</p>

        {serverError && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-4 text-red-400 text-sm">
            {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {field('name', 'Full Name', 'text', 'Arjun Kumar')}
          {field('email', 'Email', 'email', 'you@example.com')}
          {field('password', 'Password', 'password', 'Min 8 characters')}
          {field('confirmPassword', 'Confirm Password', 'password', 'Repeat your password')}

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Grade Level</label>
            <select
              value={form.grade_level}
              onChange={(e) => setForm({ ...form, grade_level: e.target.value })}
              className={`w-full bg-slate-800 border rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition ${errors.grade_level ? 'border-red-500' : 'border-slate-700'}`}
            >
              <option value="">Select grade...</option>
              {GRADE_LEVELS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
            {errors.grade_level && <p className="text-red-400 text-xs mt-1">{errors.grade_level}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Board</label>
            <select
              value={form.board}
              onChange={(e) => setForm({ ...form, board: e.target.value })}
              className={`w-full bg-slate-800 border rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition ${errors.board ? 'border-red-500' : 'border-slate-700'}`}
            >
              <option value="">Select board...</option>
              {BOARDS.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
            {errors.board && <p className="text-red-400 text-xs mt-1">{errors.board}</p>}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-base transition-all duration-200 shadow-lg shadow-indigo-500/30 mt-2"
          >
            {loading ? 'Creating account...' : 'Create Account →'}
          </button>
        </form>
      </div>
    </OnboardingLayout>
  );
}
