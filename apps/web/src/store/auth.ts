import { create } from 'zustand';
import { api, tokenStore } from '@/lib/api';
import type { AuthProfile } from '@/lib/types';

interface AuthState {
  user: AuthProfile | null;
  status: 'idle' | 'loading' | 'authenticated' | 'anonymous';
  login: (email: string, password: string) => Promise<AuthProfile>;
  loadSession: () => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: AuthProfile) => void;
  can: (permission: string) => boolean;
  hasRole: (...roles: string[]) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  status: 'idle',

  async login(email, password) {
    const { data } = await api.post<{
      accessToken: string;
      refreshToken: string;
      user: AuthProfile;
    }>('/auth/login', { email, password });

    tokenStore.set(data.accessToken, data.refreshToken);
    set({ user: data.user, status: 'authenticated' });
    return data.user;
  },

  async loadSession() {
    if (!tokenStore.access) {
      set({ user: null, status: 'anonymous' });
      return;
    }
    set({ status: 'loading' });
    try {
      const { data } = await api.get<AuthProfile>('/auth/me');
      set({ user: data, status: 'authenticated' });
    } catch {
      tokenStore.clear();
      set({ user: null, status: 'anonymous' });
    }
  },

  async logout() {
    const refreshToken = tokenStore.refresh;
    if (refreshToken) {
      await api.post('/auth/logout', { refreshToken }).catch(() => undefined);
    }
    tokenStore.clear();
    set({ user: null, status: 'anonymous' });
  },

  setUser(user) {
    set({ user, status: 'authenticated' });
  },

  can(permission) {
    return get().user?.permissions.includes(permission) ?? false;
  },

  hasRole(...roles) {
    const user = get().user;
    return roles.some((role) => user?.roles.includes(role));
  },
}));
