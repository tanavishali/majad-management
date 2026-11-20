import { describe, expect, it } from 'vitest';
import { screen, waitFor, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse, delay } from 'msw';
import { server } from './server';
import { AuthProvider } from '../features/auth/AuthContext';
import LoginPage from '../features/auth/LoginPage';
import { ProtectedRoute } from '../app/ProtectedRoute';
import { getToken } from '../lib/token';
import { API, makeClient } from './utils';

const session = (t = 'tok') => HttpResponse.json({ data: { accessToken: t, user: { id: '1', username: 'admin' } } });
const noSession = () => HttpResponse.json({ error: { code: 'UNAUTHORIZED', message: 'no cookie', requestId: 'r' } }, { status: 401 });

function From() { const l = useLocation(); return <div data-testid="from">{JSON.stringify(l.state)}</div>; }
function app(route = '/') {
  return render(
    <QueryClientProvider client={makeClient()}>
      <MemoryRouter initialEntries={[route]}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<><LoginPage /><From /></>} />
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<div>SECRET HOME</div>} />
              <Route path="/dashboard" element={<div>SECRET DASH</div>} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ProtectedRoute', () => {
  it('shows a loading skeleton while the session restores, then the page when the cookie is valid', async () => {
    server.use(http.post(`${API}/auth/refresh`, async () => { await delay(80); return session('restored'); }));
    app('/');
    expect(screen.getByTestId('auth-loading')).toBeInTheDocument();
    expect(screen.queryByText('SECRET HOME')).toBeNull();
    expect(await screen.findByText('SECRET HOME')).toBeInTheDocument();
    expect(getToken()).toBe('restored');
  });
  it('redirects anonymous users to /login and remembers where they were going', async () => {
    server.use(http.post(`${API}/auth/refresh`, noSession));
    app('/dashboard?per=week');
    expect(await screen.findByTestId('login-form')).toBeInTheDocument();
    expect(screen.queryByText('SECRET DASH')).toBeNull();
    expect(screen.getByTestId('from')).toHaveTextContent('"from":"/dashboard?per=week"');
  });
  it('after login, returns to the originally requested page', async () => {
    server.use(
      http.post(`${API}/auth/refresh`, noSession),
      http.post(`${API}/auth/login`, () => session('t')),
    );
    app('/dashboard');
    await userEvent.type(await screen.findByTestId('login-username'), 'admin');
    await userEvent.type(screen.getByTestId('login-password'), 'pw');
    await userEvent.click(screen.getByTestId('login-submit'));
    expect(await screen.findByText('SECRET DASH')).toBeInTheDocument();
  });
});

describe('LoginPage', () => {
  async function tryLogin(resp: () => Response) {
    server.use(http.post(`${API}/auth/refresh`, noSession), http.post(`${API}/auth/login`, resp));
    app('/login');
    await userEvent.type(await screen.findByTestId('login-username'), 'admin');
    await userEvent.type(screen.getByTestId('login-password'), 'wrong');
    await userEvent.click(screen.getByTestId('login-submit'));
    return screen.getByTestId('login-error');
  }
  const err = (status: number, code: string, details?: unknown, headers?: Record<string, string>) =>
    () => HttpResponse.json({ error: { code, message: 'Server says no', details, requestId: 'r' } }, { status, headers });

  it('lockout (423 ACCOUNT_LOCKED) shows the wait time in minutes when >= 120s', async () => {
    const el = await tryLogin(err(423, 'ACCOUNT_LOCKED', { retryAfterSeconds: 600 }));
    await waitFor(() => expect(el).toHaveTextContent('Wait 10 minutes'));
    expect(el).toHaveClass('show');
  });
  it('lockout shows seconds when < 120s', async () => {
    const el = await tryLogin(err(423, 'ACCOUNT_LOCKED', { retryAfterSeconds: 45 }));
    await waitFor(() => expect(el).toHaveTextContent('Wait 45 seconds'));
  });
  it('rate limit (429) uses the Retry-After header', async () => {
    const el = await tryLogin(err(429, 'RATE_LIMITED', undefined, { 'Retry-After': '30' }));
    await waitFor(() => expect(el).toHaveTextContent('Wait 30 seconds'));
  });
  it('lockout without a wait time falls back to the server message', async () => {
    const el = await tryLogin(err(423, 'ACCOUNT_LOCKED'));
    await waitFor(() => expect(el).toHaveTextContent('Server says no'));
  });
  it('wrong password shows the generic credentials message (no refresh attempted)', async () => {
    const el = await tryLogin(err(401, 'UNAUTHORIZED'));
    await waitFor(() => expect(el).toHaveTextContent('Username or password is incorrect.'));
  });
  it('500 shows a generic error', async () => {
    const el = await tryLogin(err(500, 'INTERNAL'));
    await waitFor(() => expect(el).toHaveTextContent('Something went wrong. Please try again.'));
  });
  it('network failure shows the connection message', async () => {
    const el = await tryLogin(() => HttpResponse.error());
    await waitFor(() => expect(el).toHaveTextContent(/Cannot reach the server/));
  });
  it('empty submit asks for credentials without calling the API', async () => {
    let logins = 0;
    server.use(http.post(`${API}/auth/refresh`, noSession), http.post(`${API}/auth/login`, () => { logins++; return session(); }));
    app('/login');
    await userEvent.click(await screen.findByTestId('login-submit'));
    await waitFor(() => expect(screen.getByTestId('login-error')).toHaveTextContent('Enter your username and password.'));
    expect(logins).toBe(0);
  });
  it('show-password toggles the field type', async () => {
    server.use(http.post(`${API}/auth/refresh`, noSession));
    app('/login');
    const pw = await screen.findByTestId('login-password');
    expect(pw).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByTestId('login-show'));
    expect(pw).toHaveAttribute('type', 'text');
  });
  it('success stores the token in memory only', async () => {
    server.use(http.post(`${API}/auth/refresh`, noSession), http.post(`${API}/auth/login`, () => session('mem')));
    app('/login');
    await userEvent.type(await screen.findByTestId('login-username'), 'admin');
    await userEvent.type(screen.getByTestId('login-password'), 'pw');
    await userEvent.click(screen.getByTestId('login-submit'));
    await screen.findByText('SECRET HOME');
    expect(getToken()).toBe('mem');
    expect(JSON.stringify({ ...localStorage })).not.toContain('mem');
  });
});
