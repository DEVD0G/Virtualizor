import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { api, getAccessToken, setTokens } from '../api/client';
import { User } from '../api/types';

export type LoginResult =
  | { type: 'ok' }
  | { type: 'totp'; pendingToken: string };

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  loginTotp: (pendingToken: string, code: string) => Promise<void>;
  logout: () => void;
  can: (permission: string) => boolean;
}

const Ctx = createContext<AuthCtx>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getAccessToken()) { setLoading(false); return; }
    api<User>('/auth/me')
      .then(setUser)
      .catch(() => setTokens(null, null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string): Promise<LoginResult> => {
    const data = await api<
      | { requiresTotp: true; pendingToken: string }
      | { accessToken: string; refreshToken: string; user: User }
    >('/auth/login', { method: 'POST', body: { email, password } });

    if ('requiresTotp' in data && data.requiresTotp) {
      return { type: 'totp', pendingToken: data.pendingToken };
    }
    const full = data as { accessToken: string; refreshToken: string; user: User };
    setTokens(full.accessToken, full.refreshToken);
    setUser(full.user);
    return { type: 'ok' };
  };

  const loginTotp = async (pendingToken: string, code: string) => {
    const data = await api<{ accessToken: string; refreshToken: string; user: User }>(
      '/auth/login/totp',
      { method: 'POST', body: { pendingToken, code } },
    );
    setTokens(data.accessToken, data.refreshToken);
    setUser(data.user);
  };

  const logout = () => {
    setTokens(null, null);
    setUser(null);
  };

  const can = (permission: string) => user?.permissions.includes(permission) ?? false;

  return <Ctx.Provider value={{ user, loading, login, loginTotp, logout, can }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
