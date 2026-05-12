import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../api/axios';

export const useGuardianStore = create(
  persist(
    (set, get) => ({
      guardian: null,
      accessToken: null,
      isAuthenticated: false,
      linkedStudents: [],
      selectedStudentId: null,

      // ── Auth ──────────────────────────────────────────────────────────────

      login: async (credentials) => {
        const res = await api.post('/api/auth/guardian/login', credentials);
        const { accessToken, refreshToken, guardian } = res.data;
        localStorage.setItem('guardianRefreshToken', refreshToken);
        set({ guardian, accessToken, isAuthenticated: true });
        return res.data;
      },

      register: async (data) => {
        const res = await api.post('/api/auth/guardian/register', data);
        return res.data;
      },

      logout: () => {
        localStorage.removeItem('guardianRefreshToken');
        set({
          guardian: null,
          accessToken: null,
          isAuthenticated: false,
          linkedStudents: [],
          selectedStudentId: null,
        });
      },

      setAccessToken: (accessToken) => {
        set({ accessToken, isAuthenticated: !!accessToken });
      },

      // ── Students ──────────────────────────────────────────────────────────

      loadStudents: async () => {
        try {
          const token = get().accessToken;
          const res = await api.get('/api/auth/guardian/students', {
            headers: { Authorization: `Bearer ${token}` },
          });
          const students = res.data.students || [];
          set((state) => ({
            linkedStudents: students,
            // Auto-select first student if none selected
            selectedStudentId:
              state.selectedStudentId &&
              students.find((s) => s.id === state.selectedStudentId)
                ? state.selectedStudentId
                : students[0]?.id ?? null,
          }));
          return students;
        } catch (err) {
          console.error('[guardianStore] loadStudents error:', err);
          return [];
        }
      },

      selectStudent: (studentId) => {
        set({ selectedStudentId: studentId });
      },
    }),
    {
      name: 'mindtwin-guardian',
      partialize: (state) => ({
        guardian: state.guardian,
        accessToken: state.accessToken,
        isAuthenticated: state.isAuthenticated,
        selectedStudentId: state.selectedStudentId,
      }),
    }
  )
);
