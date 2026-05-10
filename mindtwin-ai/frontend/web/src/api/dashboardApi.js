import api from './axios';

export const dashboardApi = {
  getTodaySessions: () => api.get('/api/scheduler/today').then(r => r.data),
  getExams: () => api.get('/api/profile/exams').then(r => r.data),
  getProfile: () => api.get('/api/profile/').then(r => r.data),
  getTokenBalance: () => api.get('/api/reward/balance').then(r => r.data).catch(() => ({ balance: 0, earned_today: 0 })),
  getStressCurrent: () => api.get('/api/stress/current').then(r => r.data).catch(() => ({ score: 0.2, label: 'Calm', emoji: '😌' })),
  generatePlan: () => api.post('/api/scheduler/generate', {}).then(r => r.data),
  completeSession: (data) => api.post('/api/scheduler/session/complete', data).then(r => r.data),
  skipSession: (data) => api.post('/api/scheduler/session/skip', data).then(r => r.data),
  logMood: (mood) => api.post('/api/stress/mood', { mood_score: mood }).then(r => r.data).catch(() => ({ success: true })),
  getNotifications: () => api.get('/api/notifications').then(r => r.data).catch(() => ({ notifications: [], unread_count: 0 })),
  markNotificationRead: (id) => api.put(`/api/notifications/${id}/read`).then(r => r.data).catch(() => ({ success: false })),
};
