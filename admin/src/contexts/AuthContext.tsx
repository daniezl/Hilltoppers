import React, { createContext, useContext, useEffect, useState } from 'react';

interface User {
  email: string;
  role: 'editor' | 'admin';
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

import { API_BASE } from '../config';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUser = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`${API_BASE}/user`);
      
      if (!response.ok) {
        if (response.status === 403) {
          const data = await response.json();
          setError(data.error || 'Access denied');
        } else {
          setError('Failed to authenticate');
        }
        setUser(null);
        return;
      }
      
      const data = await response.json();
      setUser(data);
    } catch (err) {
      setError('Network error');
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, error, refresh: fetchUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

