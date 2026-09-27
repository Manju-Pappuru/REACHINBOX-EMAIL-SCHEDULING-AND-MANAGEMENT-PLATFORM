import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import authService from '../services/auth.service';
import type { User } from '../types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  loginWithGoogle: () => void;
  devLogin: (email?: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const refreshUser = useCallback(async () => {
    try {
      const currentUser = await authService.getCurrentUser();
      setUser(currentUser);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const loginWithGoogle = useCallback(() => {
    window.location.href = authService.getGoogleAuthUrl();
  }, []);

  const devLogin = useCallback(async (email?: string, name?: string) => {
    setLoading(true);
    try {
      const loggedInUser = await authService.devLogin(email, name);
      setUser(loggedInUser);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        loginWithGoogle,
        devLogin,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
