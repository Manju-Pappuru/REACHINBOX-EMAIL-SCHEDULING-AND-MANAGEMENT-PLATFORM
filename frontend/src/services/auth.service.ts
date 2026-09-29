import api, { API_BASE_URL } from './api';
import { signInWithGoogle, firebaseSignOut } from '../config/firebase';
import type { User } from '../types';

export const authService = {
  async loginWithGoogle(): Promise<User> {
    const firebaseUser = await signInWithGoogle();
    const idToken = await firebaseUser.getIdToken();
    const response = await api.post<User>('/api/auth/firebase', { idToken });
    return response.data;
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
    await firebaseSignOut();
  },
};

export default authService;
