import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema } from '@order-desk/shared';
import type { z } from 'zod';
import { useAuth } from './AuthContext';
import { apiError } from '../../lib/errors';

type Values = z.infer<typeof loginSchema>;

function waitText(sec: number) {
  return sec >= 120 ? `${Math.ceil(sec / 60)} minutes` : `${sec} seconds`;
}

export default function LoginPage() {
  const { status, login, notice, clearNotice } = useAuth();
  const loc = useLocation();
  const [err, setErr] = useState('');
  const [show, setShow] = useState(false);
  const [forgot, setForgot] = useState(false);
  const { register, handleSubmit, formState: { isSubmitting } } = useForm<Values>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '' },
  });

  if (status === 'authed') return <Navigate to={(loc.state as { from?: string } | null)?.from ?? '/'} replace />;

  const onValid = async (v: Values) => {
    setErr('');
    clearNotice();
    try {
      await login(v.username, v.password);
    } catch (e) {
      const a = apiError(e);
      if (a.network) setErr(a.message);
      else if (a.code === 'ACCOUNT_LOCKED' || a.code === 'RATE_LIMITED' || a.status === 423 || a.status === 429) {
        setErr(a.retryAfter ? `Too many wrong tries. Wait ${waitText(a.retryAfter)} and try again.` : a.message || 'Too many wrong tries. Please wait and try again.');
      } else if (a.code === 'UNAUTHORIZED' || a.status === 401) setErr('Username or password is incorrect.');
      else setErr('Something went wrong. Please try again.');
    }
  };
  const shown = err || notice;

  return (
    <div className="login">
      <form noValidate autoComplete="on" data-testid="login-form" onSubmit={handleSubmit(onValid, () => { setErr('Enter your username and password.'); })}>
        <h1>🎂 Blusher Cakes</h1>
        <p className="sub">Admin login</p>
        <label htmlFor="aUser">Username</label>
        <input id="aUser" data-testid="login-username" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} {...register('username')} />
        <label htmlFor="aPass">Password</label>
        <input id="aPass" data-testid="login-password" type={show ? 'text' : 'password'} autoComplete="current-password" {...register('password')} />
        <label className="checkrow" style={{ margin: '12px 0' }}>
          <input type="checkbox" data-testid="login-show" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show password
        </label>
        <div role="alert" data-testid="login-error" className={`err${shown ? ' show' : ''}`}>{shown}</div>
        <button type="submit" data-testid="login-submit" className="btn" disabled={isSubmitting}>{isSubmitting ? 'Logging in…' : 'Log in'}</button>
        <p style={{ textAlign: 'center', marginTop: 16 }}>
          <button type="button" className="link" data-testid="login-forgot" onClick={() => setForgot((f) => !f)}>Forgot password?</button>
        </p>
        {forgot && <p data-testid="login-forgot-note" className="sub" style={{ textAlign: 'center' }}>Passwords cannot be recovered here. Ask the system administrator to reset the admin password on the server.</p>}
      </form>
    </div>
  );
}
