import api from './axios';

export const stressApi = {
  getCurrent: () => api.get('/api/stress/current').then(res => res.data),
  getHistory: () => api.get('/api/stress/history').then(res => res.data),
  getWellness: () => api.get('/api/stress/wellness').then(res => res.data),
  logMood: (data) => api.post('/api/stress/mood', data).then(res => res.data),
  acknowledgeIntervention: (data) => api.post('/api/stress/intervention/acknowledge', data).then(res => res.data),
};
