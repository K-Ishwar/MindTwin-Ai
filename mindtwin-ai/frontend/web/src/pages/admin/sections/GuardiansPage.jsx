import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../../../api/adminApi';

export default function GuardiansPage() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-guardians', page],
    queryFn: () => adminApi.getGuardians({ page, limit: 20 }),
    staleTime: 30_000,
    keepPreviousData: true,
  });

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-slate-800/60 border border-slate-700/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                {['Name', 'Email', 'Role', 'Institution', 'Linked Students', 'Joined'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && [...Array(5)].map((_, i) => (
                <tr key={i} className="border-b border-slate-700/30">
                  {[...Array(6)].map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 bg-slate-700 rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))}
              {!isLoading && data?.guardians?.map((g) => (
                <tr key={g.id} className="border-b border-slate-700/30 hover:bg-slate-700/20 transition">
                  <td className="px-4 py-3 text-white font-medium">{g.name}</td>
                  <td className="px-4 py-3 text-slate-400">{g.email}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs border ${
                      g.role === 'teacher'
                        ? 'bg-sky-500/20 text-sky-400 border-sky-500/30'
                        : 'bg-violet-500/20 text-violet-400 border-violet-500/30'
                    }`}>
                      {g.role === 'teacher' ? '🏫 Teacher' : '👨‍👩‍👧 Parent'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400">{g.institution_name || '—'}</td>
                  <td className="px-4 py-3 text-white font-semibold text-center">{g.linked_students}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {new Date(g.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {!isLoading && data?.guardians?.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500 text-sm">No guardians found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {data?.pagination && data.pagination.total_pages > 1 && (
          <div className="px-4 py-3 border-t border-slate-700/50 flex items-center justify-between text-xs text-slate-400">
            <span>Page {page} of {data.pagination.total_pages} · {data.pagination.total} total</span>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-40 transition">← Prev</button>
              <button onClick={() => setPage((p) => Math.min(data.pagination.total_pages, p + 1))} disabled={page === data.pagination.total_pages}
                className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-40 transition">Next →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
