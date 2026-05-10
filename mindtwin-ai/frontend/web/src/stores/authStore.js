import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../api/axios';

export const useAuthStore = create(
  persist(
    (set, get) => ({
      student: null,
      accessToken: null,
      isAuthenticated: false,

      setStudent: (student) => set({ student }),

      setAccessToken: (accessToken) => {
        set({ accessToken, isAuthenticated: !!accessToken });
      },

      login: async (credentials) => {
        const res = await api.post('/api/auth/login', credentials);
        const { accessToken, refreshToken, student } = res.data;
        localStorage.setItem('refreshToken', refreshToken);
        set({ student, accessToken, isAuthenticated: true });
        return res.data;
      },

      register: async (data) => {
        const res = await api.post('/api/auth/register', data);
        return res.data;
      },

      logout: () => {
        localStorage.removeItem('refreshToken');
        set({ student: null, accessToken: null, isAuthenticated: false });
      },
    }),
    {
      name: 'mindtwin-auth',
      partialize: (state) => ({
        student: state.student,
        accessToken: state.accessToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
