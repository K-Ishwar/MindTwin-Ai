import api from './axios';

export const analyticsApi = {
  getDashboard: (period = 'month') =>
    api.get(`/api/analytics/dashboard?period=${period}`).then(r => r.data),

  getProgress: (subject, period = 'month') => {
    const params = new URLSearchParams({ period });
    if (subject) params.set('subject', subject);
    return api.get(`/api/analytics/progress?${params}`).then(r => r.data);
  },

  getInsights: () =>
    api.get('/api/analytics/insights').then(r => r.data),

  dismissInsight: (insightId) =>
    api.post(`/api/analytics/insights/${insightId}/dismiss`).then(r => r.data),

  getWeeklyDigest: () =>
    api.get('/api/analytics/weekly-digest').then(r => r.data),

  getTwinEvolution: () =>
    api.get('/api/analytics/twin-evolution').then(r => r.data),

  getExamReadiness: (examId) =>
    api.get(`/api/analytics/exam-readiness/${examId}`).then(r => r.data),
};
