import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { api, getAccessToken, setTokens } from '../api/client';
import { User } from '../api/types';

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  can: (permission: string) => boolean;
}

const Ctx = createContext<AuthCtx>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getAccessToken()) {
      setLoading(false);
      return;
    }
    api<User>('/auth/me')
      .then(setUser)
      .catch(() => setTokens(null, null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const data = await api<{ accessToken: string; refreshToken: string; user: User }>(
      '/auth/login',
      { method: 'POST', body: { email, password } },
    );
    setTokens(data.accessToken, data.refreshToken);
    setUser(data.user);
  };

  const logout = () => {
    setTokens(null, null);
    setUser(null);
  };

  const can = (permission: string) => user?.permissions.includes(permission) ?? false;

  return <Ctx.Provider value={{ user, loading, login, logout, can }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
