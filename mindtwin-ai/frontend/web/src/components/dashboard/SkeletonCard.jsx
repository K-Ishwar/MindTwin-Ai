// Skeleton loader components for dashboard
export function SkeletonCard({ className = '' }) {
  return (
    <div className={`bg-slate-800 rounded-2xl p-6 border border-slate-700 animate-pulse ${className}`}>
      <div className="h-4 bg-slate-700 rounded w-1/3 mb-4" />
      <div className="space-y-3">
        <div className="h-3 bg-slate-700 rounded w-full" />
        <div className="h-3 bg-slate-700 rounded w-4/5" />
        <div className="h-3 bg-slate-700 rounded w-2/3" />
      </div>
    </div>
  );
}

export function SkeletonStat() {
  return (
    <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700 animate-pulse flex flex-col gap-2">
      <div className="h-3 bg-slate-700 rounded w-1/2" />
      <div className="h-8 bg-slate-700 rounded w-1/3" />
      <div className="h-3 bg-slate-700 rounded w-2/3" />
    </div>
  );
}
