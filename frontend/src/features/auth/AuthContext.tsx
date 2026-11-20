import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AuthUser, LoginResponse } from '@order-desk/shared';
import { api, refreshSession } from '../../lib/axios';
import { onForcedLogout, setToken } from '../../lib/token';

type Status = 'loading' | 'authed' | 'anon';
interface Ctx {
  status: Status;
  user: AuthUser | null;
  notice: string;
  login: (username: string, password: string) => Promise<void>;
  logout: (notice?: string) => Promise<void>;
  clearNotice: () => void;
}
const AuthCtx = createContext<Ctx | null>(null);
export const useAuth = () => {
  const c = useContext(AuthCtx);
  if (!c) throw new Error('useAuth outside AuthProvider');
  return c;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [notice, setNotice] = useState('');

  // Restore the session from the httpOnly refresh cookie on page load.
  useEffect(() => {
    let alive = true;
    refreshSession()
      .then((d) => { if (alive) { setUser(d.user); setStatus('authed'); } })
      .catch(() => { if (alive) setStatus('anon'); });
    return () => { alive = false; };
  }, []);

  const localLogout = useCallback((msg = '') => {
    setToken(null);
    qc.clear();
    setUser(null);
    setNotice(msg);
    setStatus('anon');
  }, [qc]);

  useEffect(() => onForcedLogout(() => localLogout('Your session expired. Please log in again.')), [localLogout]);

  const login = useCallback(async (username: string, password: string) => {
    const r = await api.post<LoginResponse>('/auth/login', { username, password });
    setToken(r.data.data.accessToken);
    setUser(r.data.data.user);
    setNotice('');
    setStatus('authed');
  }, []);

  const logout = useCallback(async (msg?: string) => {
    try { await api.post('/auth/logout'); } catch { /* best effort */ }
    localLogout(msg);
  }, [localLogout]);

  const value = useMemo<Ctx>(() => ({ status, user, notice, login, logout, clearNotice: () => setNotice('') }), [status, user, notice, login, logout]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
