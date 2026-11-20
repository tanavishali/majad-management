import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import type { LoginResponse } from '@order-desk/shared';
import { emitForcedLogout, getToken, setToken } from './token';

export const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '') || '/api/v1';

export const api = axios.create({ baseURL: API_BASE, withCredentials: true, timeout: 30_000 });
/** No interceptors: used for refresh so it can never recurse. */
const bare = axios.create({ baseURL: API_BASE, withCredentials: true, timeout: 15_000 });

let refreshing: Promise<LoginResponse['data']> | null = null;

/** Single-flight refresh: concurrent callers share one in-flight request. */
export function refreshSession(): Promise<LoginResponse['data']> {
  if (!refreshing) {
    refreshing = bare
      .post<LoginResponse>('/auth/refresh')
      .then((r) => {
        setToken(r.data.data.accessToken);
        return r.data.data;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

api.interceptors.request.use((config) => {
  const t = getToken();
  if (t) config.headers.set('Authorization', `Bearer ${t}`);
  return config;
});

type Retryable = InternalAxiosRequestConfig & { _retry?: boolean };

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const cfg = error.config as Retryable | undefined;
    const url = cfg?.url ?? '';
    const skip = url.includes('/auth/login') || url.includes('/auth/refresh');
    if (error.response?.status === 401 && cfg && !cfg._retry && !skip) {
      cfg._retry = true;
      let token: string;
      try {
        token = (await refreshSession()).accessToken;
      } catch {
        setToken(null);
        emitForcedLogout();
        return Promise.reject(error);
      }
      cfg.headers.set('Authorization', `Bearer ${token}`);
      return api(cfg);
    }
    return Promise.reject(error);
  },
);
