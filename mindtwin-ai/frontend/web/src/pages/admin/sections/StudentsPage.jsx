import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../../../api/adminApi';

function timeAgo(d) {
  if (!d) return '—';
  const diff = Date.now() - new Date(d).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return 'Just now';
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function stressBadge(severity) {
  if (!severity) return null;
  const s = severity.toLowerCase();
  if (s === 'high' || s === 'severe')
    return <span className="px-2 py-0.5 rounded-full text-xs bg-red-500/20 text-red-400 border border-red-500/30">High</span>;
  if (s === 'moderate')
    return <span className="px-2 py-0.5 rounded-full text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30">Moderate</span>;
  return <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Low</span>;
}

// ── Student detail side panel ─────────────────────────────────────────────────

function StudentPanel({ studentId, onClose }) {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-student-detail', studentId],
    queryFn: () => adminApi.getStudentDetail(studentId),
    enabled: !!studentId,
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-md bg-slate-900 border-l border-slate-800 h-full overflow-y-auto p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-white font-bold text-lg">Student Detail</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-xl transition">✕</button>
        </div>

        {isLoading && (
          <div className="space-y-3 animate-pulse">
            {[...Array(5)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-slate-800" />)}
          </div>
        )}

        {data?.success && (
          <>
            {/* Basic info */}
            <div className="rounded-xl bg-slate-800/60 border border-slate-700/50 p-4 space-y-1">
              <p className="text-white font-semibold text-base">{data.student.name}</p>
              <p className="text-slate-400 text-sm">{data.student.email}</p>
              <p className="text-slate-500 text-xs">Grade {data.student.grade_level} · {data.student.board}</p>
              <p className="text-slate-600 text-xs">Joined {new Date(data.student.created_at).toLocaleDateString()}</p>
            </div>

            {/* Sessions */}
            <div className="rounded-xl bg-slate-800/60 border border-slate-700/50 p-4">
              <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">Sessions</p>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-white font-bold text-xl">{data.sessions.completed || 0}</p>
                  <p className="text-slate-500 text-xs">Completed</p>
                </div>
                <div>
                  <p className="text-red-400 font-bold text-xl">{data.sessions.skipped || 0}</p>
                  <p className="text-slate-500 text-xs">Skipped</p>
                </div>
                <div>
                  <p className="text-white font-bold text-xl">{data.sessions.avg_duration || '—'}</p>
                  <p className="text-slate-500 text-xs">Avg min</p>
                </div>
              </div>
            </div>

            {/* Quizzes */}
            <div className="rounded-xl bg-slate-800/60 border border-slate-700/50 p-4">
              <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">Quizzes</p>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-white font-bold text-xl">{data.quizzes.total || 0}</p>
                  <p className="text-slate-500 text-xs">Total</p>
                </div>
                <div>
                  <p className="text-indigo-400 font-bold text-xl">{data.quizzes.avg_score || '—'}%</p>
                  <p className="text-slate-500 text-xs">Avg score</p>
                </div>
                <div>
                  <p className="text-amber-400 font-bold text-xl">{data.quizzes.gaps || 0}</p>
                  <p className="text-slate-500 text-xs">Gaps</p>
                </div>
              </div>
            </div>

            {/* Stress history */}
            {data.stress_history?.length > 0 && (
              <div className="rounded-xl bg-slate-800/60 border border-slate-700/50 p-4">
                <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">Recent Stress Logs</p>
                <div className="space-y-2">
                  {data.stress_history.slice(0, 5).map((s, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">{new Date(s.logged_at).toLocaleDateString()}</span>
                      <span className="text-white">{parseFloat(s.stress_score).toFixed(2)}</span>
                      {stressBadge(s.severity)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Guardians */}
            {data.guardians?.length > 0 && (
              <div className="rounded-xl bg-slate-800/60 border border-slate-700/50 p-4">
                <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">Linked Guardians</p>
                {data.guardians.map((g, i) => (
                  <div key={i} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-700/50 last:border-0">
                    <div>
                      <p className="text-white">{g.name}</p>
                      <p className="text-slate-500">{g.role}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full border text-xs ${
                      g.link_status === 'approved'
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                        : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                    }`}>{g.link_status}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

const SORT_COLS = ['name', 'email', 'grade_level', 'created_at'];

export default function StudentsPage() {
  const [search, setSearch]   = useState('');
  const [sort, setSort]       = useState('created_at');
  const [order, setOrder]     = useState('desc');
  const [page, setPage]       = useState(1);
  const [selected, setSelected] = useState(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-students', search, sort, order, page],
    queryFn: () => adminApi.getStudents({ search, sort, order, page, limit: 20 }),
    staleTime: 30_000,
    keepPreviousData: true,
  });

  const toggleSort = (col) => {
    if (sort === col) setOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    else { setSort(col); setOrder('asc'); }
    setPage(1);
  };

  const SortIcon = ({ col }) =>
    sort === col ? (order === 'asc' ? ' ↑' : ' ↓') : ' ↕';

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="flex gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search by name or email…"
          className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition"
        />
      </div>

      {/* Table */}
      <div className="rounded-2xl bg-slate-800/60 border border-slate-700/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                {[
                  { key: 'name',       label: 'Name' },
                  { key: 'email',      label: 'Email' },
                  { key: 'grade_level',label: 'Grade' },
                  { key: null,         label: 'Board' },
                  { key: null,         label: 'Last Active' },
                  { key: null,         label: 'Sessions/wk' },
                  { key: null,         label: 'Stress' },
                ].map((col, i) => (
                  <th
                    key={i}
                    onClick={() => col.key && toggleSort(col.key)}
                    className={`px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider ${col.key ? 'cursor-pointer hover:text-white' : ''}`}
                  >
                    {col.label}{col.key && <SortIcon col={col.key} />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="border-b border-slate-700/30">
                    {[...Array(7)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-slate-700 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              )}
              {!isLoading && data?.students?.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => setSelected(s.id)}
                  className="border-b border-slate-700/30 hover:bg-slate-700/30 cursor-pointer transition"
                >
                  <td className="px-4 py-3 text-white font-medium">{s.name}</td>
                  <td className="px-4 py-3 text-slate-400">{s.email}</td>
                  <td className="px-4 py-3 text-slate-300">{s.grade_level || '—'}</td>
                  <td className="px-4 py-3 text-slate-400">{s.board || '—'}</td>
                  <td className="px-4 py-3 text-slate-400">{timeAgo(s.last_active)}</td>
                  <td className="px-4 py-3 text-white font-semibold">{s.sessions_this_week}</td>
                  <td className="px-4 py-3">{stressBadge(s.stress_severity)}</td>
                </tr>
              ))}
              {!isLoading && data?.students?.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500 text-sm">
                    No students found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data?.pagination && data.pagination.total_pages > 1 && (
          <div className="px-4 py-3 border-t border-slate-700/50 flex items-center justify-between text-xs text-slate-400">
            <span>
              {(page - 1) * 20 + 1}–{Math.min(page * 20, data.pagination.total)} of {data.pagination.total}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-40 transition"
              >
                ← Prev
              </button>
              <button
                onClick={() => setPage((p) => Math.min(data.pagination.total_pages, p + 1))}
                disabled={page === data.pagination.total_pages}
                className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-40 transition"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Side panel */}
      {selected && <StudentPanel studentId={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
