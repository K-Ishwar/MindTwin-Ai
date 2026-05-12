import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../api/axios';

export const useAdminStore = create(
  persist(
    (set) => ({
      admin: null,
      accessToken: null,
      isAuthenticated: false,

      login: async (credentials) => {
        const res = await api.post('/api/auth/admin/login', credentials);
        const { accessToken, admin } = res.data;
        set({ admin, accessToken, isAuthenticated: true });
        return res.data;
      },

      logout: () => {
        set({ admin: null, accessToken: null, isAuthenticated: false });
      },
    }),
    {
      name: 'mindtwin-admin',
      partialize: (s) => ({
        admin: s.admin,
        accessToken: s.accessToken,
        isAuthenticated: s.isAuthenticated,
      }),
    }
  )
);
