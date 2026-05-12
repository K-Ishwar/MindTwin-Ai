import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { guardianApi } from '../../../api/guardianApi';
import { useGuardianStore } from '../../../stores/guardianStore';

export default function LinkStudentSection() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState(null); // null | 'loading' | 'success' | 'error'
  const [message, setMessage] = useState('');
  const queryClient = useQueryClient();
  const { loadStudents } = useGuardianStore();

  const { data: pendingData, refetch: refetchPending } = useQuery({
    queryKey: ['guardian-pending-links'],
    queryFn: guardianApi.getPendingLinks,
    staleTime: 30_000,
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus('loading');
    setMessage('');
    try {
      await guardianApi.linkStudent(email.trim());
      setStatus('success');
      setMessage('Request sent! Your student will see a notification to approve access.');
      setEmail('');
      refetchPending();
      // Reload students in case one was just approved
      await loadStudents();
      queryClient.invalidateQueries({ queryKey: ['guardian-students'] });
    } catch (err) {
      setStatus('error');
      setMessage(err.response?.data?.error || 'Failed to send request. Please try again.');
    }
  };

  const pendingLinks = pendingData?.pending_links || [];

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h2 className="text-white font-bold text-xl mb-1">Link a Student</h2>
        <p className="text-slate-400 text-sm">
          Enter your student's registered email address. They'll receive a notification to approve
          your access.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">
            Student's Email Address
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="student@example.com"
            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
            required
          />
        </div>

        {status === 'success' && (
          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3 text-emerald-400 text-sm flex items-start gap-2">
            <span>✓</span>
            {message}
          </div>
        )}
        {status === 'error' && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3 text-red-400 text-sm flex items-start gap-2">
            <span>✕</span>
            {message}
          </div>
        )}

        <button
          type="submit"
          disabled={status === 'loading'}
          className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold transition"
        >
          {status === 'loading' ? 'Sending request...' : 'Send Link Request →'}
        </button>
      </form>

      {/* Pending requests */}
      {pendingLinks.length > 0 && (
        <div>
          <h3 className="text-slate-300 font-semibold text-sm mb-3">
            ⏳ Pending Requests ({pendingLinks.length})
          </h3>
          <div className="space-y-2">
            {pendingLinks.map((link) => (
              <div
                key={link.link_id}
                className="rounded-xl bg-slate-800/60 border border-slate-700/50 p-4 flex items-center justify-between"
              >
                <div>
                  <p className="text-white text-sm font-medium">{link.student_name}</p>
                  <p className="text-slate-400 text-xs">{link.student_email}</p>
                  <p className="text-slate-500 text-xs mt-0.5">
                    Grade {link.grade_level} · {link.board}
                  </p>
                </div>
                <span className="text-xs px-2 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  Awaiting approval
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
