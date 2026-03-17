import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [seller, setSeller] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async () => {
    const token = localStorage.getItem('jodl_token');
    if (!token) { setLoading(false); return; }

    try {
      const { data } = await api.get('/auth/me');
      setSeller(data.seller);
    } catch {
      localStorage.removeItem('jodl_token');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUser(); }, [loadUser]);

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('jodl_token', data.token);
    setSeller(data.seller);
    return data.seller;
  };

  const logout = () => {
    localStorage.removeItem('jodl_token');
    setSeller(null);
  };

  return (
    <AuthContext.Provider value={{ seller, loading, login, logout, refresh: loadUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
