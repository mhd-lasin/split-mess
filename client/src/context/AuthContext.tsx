import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, User } from '../lib/api.ts';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (userId: string, pin: string) => Promise<void>;
  register: (data: { name: string; pin: string; phone?: string; role?: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateUser: (updatedUser: User) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    try {
      const res = await api.auth.session();
      setUser(res.user ?? null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const updateUser = (updatedUser: User) => {
    setUser(updatedUser);
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const login = async (userId: string, pin: string) => {
    const res = await api.auth.login(userId, pin);
    setUser(res.user);
  };

  const register = async (data: { name: string; pin: string; phone?: string; role?: string }) => {
    const res = await api.auth.register(data);
    setUser(res.user);
  };

  const logout = async () => {
    try {
      await api.auth.logout();
    } finally {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
