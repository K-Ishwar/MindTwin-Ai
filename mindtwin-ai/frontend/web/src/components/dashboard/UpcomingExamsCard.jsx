import { Link } from 'react-router-dom';

function daysUntil(dateStr) {
  const exam = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((exam - now) / (1000 * 60 * 60 * 24));
}

function DaysBadge({ days }) {
  if (days <= 0) return <span className="text-xs px-2 py-1 rounded-lg bg-slate-700 text-slate-500">past</span>;
  if (days <= 7)  return <span className="text-xs px-2 py-1 rounded-lg bg-red-500/20 text-red-400 font-semibold">{days}d left</span>;
  if (days <= 14) return <span className="text-xs px-2 py-1 rounded-lg bg-amber-500/20 text-amber-400 font-semibold">{days}d left</span>;
  return <span className="text-xs px-2 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 font-semibold">{days}d left</span>;
}

export default function UpcomingExamsCard({ exams = [], isLoading }) {
  const sorted = [...exams].sort((a, b) => new Date(a.exam_date) - new Date(b.exam_date));

  if (isLoading) {
    return (
      <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 animate-pulse">
        <div className="h-4 bg-slate-700 rounded w-1/3 mb-5" />
        <div className="space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="h-10 bg-slate-700 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-white font-bold text-base">Exam Countdown</h3>
        <Link to="/onboarding" className="text-xs text-indigo-400 hover:text-indigo-300 transition">
          + Add Exam
        </Link>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-6">
          <span className="text-4xl">📅</span>
          <p className="text-slate-500 text-sm mt-3">No exams added yet.</p>
          <Link to="/onboarding" className="text-indigo-400 text-xs hover:underline mt-2 inline-block">
            Add your exams →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((exam, i) => {
            const days = daysUntil(exam.exam_date);
            const dateStr = new Date(exam.exam_date).toLocaleDateString('en-IN', {
              day: 'numeric', month: 'short'
            });
            return (
              <div key={i} className="flex items-center justify-between py-2.5 border-b border-slate-700/50 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-indigo-600/20 flex items-center justify-center text-indigo-400 text-sm font-bold">
                    {exam.subject?.charAt(0) || '?'}
                  </div>
                  <div>
                    <p className="text-white text-sm font-medium">{exam.subject}</p>
                    <p className="text-slate-500 text-xs">{dateStr}</p>
                  </div>
                </div>
                <DaysBadge days={days} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
