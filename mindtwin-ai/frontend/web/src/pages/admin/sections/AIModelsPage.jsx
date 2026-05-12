import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../../../api/adminApi';

function ModelCard({ icon, name, details, action, onAction, loading }) {
  return (
    <div className="rounded-2xl bg-slate-800/60 border border-slate-700/50 p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{icon}</span>
          <div>
            <p className="text-white font-semibold">{name}</p>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              Active
            </span>
          </div>
        </div>
        {action && (
          <button
            onClick={onAction}
            disabled={loading}
            className="px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-semibold transition"
          >
            {loading ? 'Running…' : action}
          </button>
        )}
      </div>
      <div className="space-y-2">
        {details.map((d, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <span className="text-slate-400">{d.label}</span>
            <span className="text-white font-medium">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AIModelsPage() {
  const qc = useQueryClient();
  const [triggering, setTriggering] = useState({});
  const [triggerResult, setTriggerResult] = useState({});

  const { data: cronData, isLoading: cronLoading, refetch: refetchCron } = useQuery({
    queryKey: ['admin-cron-status'],
    queryFn: adminApi.getCronStatus,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const trigger = async (jobName) => {
    setTriggering((t) => ({ ...t, [jobName]: true }));
    setTriggerResult((r) => ({ ...r, [jobName]: null }));
    try {
      const res = await adminApi.triggerCronJob(jobName);
      setTriggerResult((r) => ({ ...r, [jobName]: { success: true, msg: `Triggered at ${new Date(res.triggered_at).toLocaleTimeString()}` } }));
      refetchCron();
    } catch (err) {
      setTriggerResult((r) => ({ ...r, [jobName]: { error: err.response?.data?.detail || err.message } }));
    } finally {
      setTriggering((t) => ({ ...t, [jobName]: false }));
    }
  };

  const jobs = cronData?.jobs || [];
  const findJob = (name) => jobs.find((j) => j.id === name || j.name?.toLowerCase().includes(name));

  const stressJob  = findJob('stress');
  const twinJob    = findJob('twin');
  const rewardJob  = findJob('reward') || findJob('reset');

  return (
    <div className="space-y-6">
      {/* Model cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        <ModelCard
          icon="🧠"
          name="Stress LSTM"
          details={[
            { label: 'Model type',    value: 'LSTM + Behavioral' },
            { label: 'Next run',      value: stressJob?.next_run_time ? new Date(stressJob.next_run_time).toLocaleString() : '—' },
            { label: 'Last run',      value: stressJob?.last_run_time || 'N/A' },
            { label: 'Status',        value: cronData?.scheduler_running ? 'Scheduler running' : 'Scheduler stopped' },
          ]}
          action="Retrain Model"
          onAction={() => trigger('nightly_stress_checks')}
          loading={triggering['nightly_stress_checks']}
        />
        <ModelCard
          icon="🤖"
          name="Digital Twin Engine"
          details={[
            { label: 'Algorithm',     value: 'iSVD Collaborative' },
            { label: 'Next run',      value: twinJob?.next_run_time ? new Date(twinJob.next_run_time).toLocaleString() : '—' },
            { label: 'Last run',      value: twinJob?.last_run_time || 'N/A' },
            { label: 'Scheduler',     value: cronData?.scheduler_running ? '✓ Running' : '✗ Stopped' },
          ]}
          action="Run Twin Update"
          onAction={() => trigger('twin_update_batch')}
          loading={triggering['twin_update_batch']}
        />
        <ModelCard
          icon="🔍"
          name="Gap Detector (IRT)"
          details={[
            { label: 'Algorithm',     value: '3PL Item Response Theory' },
            { label: 'Trigger',       value: 'Per quiz attempt' },
            { label: 'Next run',      value: rewardJob?.next_run_time ? new Date(rewardJob.next_run_time).toLocaleString() : '—' },
            { label: 'Mode',          value: 'Real-time inference' },
          ]}
        />
      </div>

      {/* Trigger result banners */}
      {Object.entries(triggerResult).map(([job, result]) =>
        result ? (
          <div
            key={job}
            className={`rounded-xl p-3 text-sm ${
              result.success
                ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                : 'bg-red-500/10 border border-red-500/30 text-red-400'
            }`}
          >
            {result.success ? `✓ ${job}: ${result.msg}` : `✕ ${job}: ${result.error}`}
          </div>
        ) : null
      )}

      {/* Cron job status table */}
      <div className="rounded-2xl bg-slate-800/60 border border-slate-700/50 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-700/50 flex items-center justify-between">
          <h3 className="text-white font-semibold text-sm">⏰ Cron Job Status</h3>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${cronData?.scheduler_running ? 'bg-emerald-400' : 'bg-red-400'}`} />
            <span className="text-xs text-slate-400">
              {cronData?.scheduler_running ? 'Scheduler running' : 'Scheduler stopped'}
            </span>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/50">
              {['Job ID', 'Name', 'Next Run', 'Last Run'].map((h) => (
                <th key={h} className="px-4 py-2.5 text-left text-xs text-slate-400 uppercase tracking-wider font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cronLoading && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500 text-xs">Loading…</td></tr>
            )}
            {!cronLoading && jobs.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500 text-xs">No jobs registered or AI engine unreachable.</td></tr>
            )}
            {jobs.map((job) => (
              <tr key={job.id} className="border-b border-slate-700/30 hover:bg-slate-700/20 transition">
                <td className="px-4 py-2.5 text-slate-400 font-mono text-xs">{job.id}</td>
                <td className="px-4 py-2.5 text-white">{job.name}</td>
                <td className="px-4 py-2.5 text-slate-300 text-xs">
                  {job.next_run_time ? new Date(job.next_run_time).toLocaleString() : '—'}
                </td>
                <td className="px-4 py-2.5 text-slate-500 text-xs">{job.last_run_time || 'N/A'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
