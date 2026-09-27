import api, { API_BASE_URL } from './api';
import type { User } from '../types';

export const authService = {
  getGoogleAuthUrl(): string {
    return `${API_BASE_URL}/api/auth/google`;
  },

  async getCurrentUser(): Promise<User | null> {
    try {
      const response = await api.get<User>('/api/auth/me');
      return response.data;
    } catch {
      return null;
    }
  },

  async devLogin(email: string = 'demo@reachinbox.ai', name: string = 'Demo User'): Promise<User> {
    const response = await api.post<User>('/api/auth/dev-login', { email, name });
    return response.data;
  },

  async logout(): Promise<void> {
    await api.post('/api/auth/logout');
  },
};

export default authService;
