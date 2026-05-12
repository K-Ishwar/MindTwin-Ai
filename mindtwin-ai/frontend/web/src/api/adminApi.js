import api from './axios';
import { useAdminStore } from '../stores/adminStore';

const adminHeaders = () => {
  const token = useAdminStore.getState().accessToken;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const h = () => ({ headers: adminHeaders() });

export const adminApi = {
  // ── Stats ────────────────────────────────────────────────────────────────
  getStats: () =>
    api.get('/api/profile/admin/stats', h()).then((r) => r.data),

  // ── Students ─────────────────────────────────────────────────────────────
  getStudents: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(`/api/profile/admin/students?${qs}`, h()).then((r) => r.data);
  },
  getStudentDetail: (id) =>
    api.get(`/api/profile/admin/students/${id}`, h()).then((r) => r.data),

  // ── Guardians ────────────────────────────────────────────────────────────
  getGuardians: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(`/api/profile/admin/guardians?${qs}`, h()).then((r) => r.data);
  },

  // ── Notifications ────────────────────────────────────────────────────────
  getNotificationHistory: (limit = 100) =>
    api.get(`/api/profile/admin/notification-history?limit=${limit}`, h()).then((r) => r.data),

  sendNotification: (payload) =>
    api
      .post('/api/notifications/send', payload, {
        headers: {
          ...adminHeaders(),
          'x-api-key': import.meta.env.VITE_INTERNAL_API_KEY || 'internal-secret',
        },
      })
      .then((r) => r.data),

  // ── AI / Cron ────────────────────────────────────────────────────────────
  getCronStatus: () =>
    api
      .get('/api/ai/cron/status', {
        headers: {
          ...adminHeaders(),
          'x-api-key': import.meta.env.VITE_INTERNAL_API_KEY || 'internal-secret',
        },
      })
      .then((r) => r.data)
      .catch(() => ({ scheduler_running: false, jobs: [] })),

  triggerCronJob: (jobName) =>
    api
      .post(
        `/api/ai/cron/trigger/${jobName}`,
        {},
        {
          headers: {
            ...adminHeaders(),
            'x-api-key': import.meta.env.VITE_INTERNAL_API_KEY || 'internal-secret',
          },
        }
      )
      .then((r) => r.data),

  // ── Health checks ────────────────────────────────────────────────────────
  checkHealth: (service, url) =>
    api
      .get(url, { timeout: 5000 })
      .then((r) => ({ service, status: 'ok', data: r.data, latency: null }))
      .catch((e) => ({ service, status: 'error', error: e.message })),
};
