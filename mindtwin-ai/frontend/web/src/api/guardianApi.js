import api from './axios';
import { useGuardianStore } from '../stores/guardianStore';

// Attach guardian token to requests that need it
const guardianHeaders = () => {
  const token = useGuardianStore.getState().accessToken;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const guardianApi = {
  // ── Auth ────────────────────────────────────────────────────────────────────
  login: (data) => api.post('/api/auth/guardian/login', data).then((r) => r.data),
  register: (data) => api.post('/api/auth/guardian/register', data).then((r) => r.data),
  getMe: () => api.get('/api/auth/guardian/me', { headers: guardianHeaders() }).then((r) => r.data),

  // ── Student linking ─────────────────────────────────────────────────────────
  getLinkedStudents: () =>
    api.get('/api/auth/guardian/students', { headers: guardianHeaders() }).then((r) => r.data),
  linkStudent: (student_email) =>
    api
      .post('/api/auth/guardian/link-student', { student_email }, { headers: guardianHeaders() })
      .then((r) => r.data),
  getPendingLinks: () =>
    api.get('/api/auth/guardian/pending-links', { headers: guardianHeaders() }).then((r) => r.data),
  unlinkStudent: (linkId) =>
    api.delete(`/api/auth/guardian/link/${linkId}`, { headers: guardianHeaders() }).then((r) => r.data),

  // ── Profile / data endpoints ────────────────────────────────────────────────
  getStudentOverview: (studentId) =>
    api
      .get(`/api/profile/guardian/student/${studentId}/overview`, { headers: guardianHeaders() })
      .then((r) => r.data),

  getStudentPerformance: (studentId, period = 'month') =>
    api
      .get(`/api/profile/guardian/student/${studentId}/performance?period=${period}`, {
        headers: guardianHeaders(),
      })
      .then((r) => r.data),

  getWeeklySummary: (studentId, weekOffset = 0) =>
    api
      .get(
        `/api/profile/guardian/student/${studentId}/weekly-summary?week_offset=${weekOffset}`,
        { headers: guardianHeaders() }
      )
      .then((r) => r.data),

  getExamReadiness: (studentId) =>
    api
      .get(`/api/profile/guardian/student/${studentId}/exam-readiness`, {
        headers: guardianHeaders(),
      })
      .then((r) => r.data),

  getMyStudentsSummary: (page = 1, limit = 20) =>
    api
      .get(`/api/profile/guardian/my-students?page=${page}&limit=${limit}`, {
        headers: guardianHeaders(),
      })
      .then((r) => r.data),
};
