import { describe, expect, it, vi } from 'vitest';
import { http, HttpResponse, delay } from 'msw';
import { server } from './server';
import { api } from '../lib/axios';
import { getToken, onForcedLogout, setToken } from '../lib/token';
import { API } from './utils';

const tokenResp = (t: string) => HttpResponse.json({ data: { accessToken: t, user: { id: '1', username: 'admin' } } });

describe('axios interceptors', () => {
  it('attaches the bearer token', async () => {
    let auth: string | null = null;
    server.use(http.get(`${API}/ping`, ({ request }) => { auth = request.headers.get('authorization'); return HttpResponse.json({ ok: 1 }); }));
    setToken('abc');
    await api.get('/ping');
    expect(auth).toBe('Bearer abc');
  });

  it('20 parallel 401s trigger exactly ONE refresh and all are retried with the new token', async () => {
    let refreshes = 0;
    const seen: string[] = [];
    server.use(
      http.post(`${API}/auth/refresh`, async () => { refreshes++; await delay(80); return tokenResp('fresh'); }),
      http.get(`${API}/orders`, ({ request }) => {
        const a = request.headers.get('authorization') ?? '';
        seen.push(a);
        return a === 'Bearer fresh' ? HttpResponse.json({ ok: true }) : HttpResponse.json({ error: { code: 'UNAUTHORIZED', message: 'x' } }, { status: 401 });
      }),
    );
    setToken('stale');
    const res = await Promise.all(Array.from({ length: 20 }, () => api.get('/orders')));
    expect(res.every((r) => r.status === 200)).toBe(true);
    expect(refreshes).toBe(1);
    expect(getToken()).toBe('fresh');
    expect(seen.filter((s) => s === 'Bearer fresh')).toHaveLength(20);
  });

  it('a later burst after a completed refresh can refresh again (single-flight resets)', async () => {
    let refreshes = 0;
    let valid = 'one';
    server.use(
      http.post(`${API}/auth/refresh`, () => { refreshes++; valid = `t${refreshes}`; return tokenResp(valid); }),
      http.get(`${API}/x`, ({ request }) => (request.headers.get('authorization') === `Bearer ${valid}` ? HttpResponse.json({}) : new HttpResponse(null, { status: 401 }))),
    );
    setToken('old');
    await Promise.all([api.get('/x'), api.get('/x'), api.get('/x')]);
    expect(refreshes).toBe(1);
    valid = 'rotated-elsewhere';
    // token now stale again
    server.use(http.post(`${API}/auth/refresh`, () => { refreshes++; valid = 'second'; return tokenResp('second'); }));
    await Promise.all([api.get('/x'), api.get('/x')]);
    expect(refreshes).toBe(2);
  });

  it('failed refresh: one refresh call, every request rejects with 401, token cleared, forced logout emitted', async () => {
    let refreshes = 0;
    server.use(
      http.post(`${API}/auth/refresh`, async () => { refreshes++; await delay(50); return HttpResponse.json({ error: { code: 'UNAUTHORIZED', message: 'expired' } }, { status: 401 }); }),
      http.get(`${API}/orders`, () => new HttpResponse(null, { status: 401 })),
    );
    const onLogout = vi.fn();
    const off = onForcedLogout(onLogout);
    setToken('stale');
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => api.get('/orders')));
    off();
    expect(refreshes).toBe(1);
    expect(results.every((r) => r.status === 'rejected')).toBe(true);
    for (const r of results) expect((r as PromiseRejectedResult).reason.response.status).toBe(401);
    expect(getToken()).toBeNull();
    expect(onLogout).toHaveBeenCalled();
  });

  it('a request that still 401s after refresh is not retried forever', async () => {
    let hits = 0;
    server.use(
      http.post(`${API}/auth/refresh`, () => tokenResp('fresh')),
      http.get(`${API}/always401`, () => { hits++; return new HttpResponse(null, { status: 401 }); }),
    );
    await expect(api.get('/always401')).rejects.toMatchObject({ response: { status: 401 } });
    expect(hits).toBe(2);
  });

  it('401 from /auth/login never triggers refresh', async () => {
    let refreshes = 0;
    server.use(
      http.post(`${API}/auth/refresh`, () => { refreshes++; return tokenResp('x'); }),
      http.post(`${API}/auth/login`, () => HttpResponse.json({ error: { code: 'UNAUTHORIZED', message: 'bad' } }, { status: 401 })),
    );
    await expect(api.post('/auth/login', {})).rejects.toMatchObject({ response: { status: 401 } });
    expect(refreshes).toBe(0);
  });

  it('non-401 errors pass through untouched', async () => {
    let refreshes = 0;
    server.use(
      http.post(`${API}/auth/refresh`, () => { refreshes++; return tokenResp('x'); }),
      http.get(`${API}/boom`, () => new HttpResponse(null, { status: 500 })),
    );
    await expect(api.get('/boom')).rejects.toMatchObject({ response: { status: 500 } });
    expect(refreshes).toBe(0);
  });
});
