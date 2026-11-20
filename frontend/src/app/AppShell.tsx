import { Suspense, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../features/auth/AuthContext';
import { useIdleLogout } from '../features/auth/useIdleLogout';
import { ChangePasswordDialog } from '../features/auth/ChangePasswordDialog';
import { listOrders } from '../features/orders/api';
import { NotificationBell } from '../features/notifications/NotificationBell';
import { ErrorBoundary } from './ErrorBoundary';

const NAV: Array<{ to: string; label: string; end?: boolean; testId: string; badge?: boolean }> = [
  { to: '/', label: '🏠 Dashboard', end: true, testId: 'nav-dashboard' },
  { to: '/new', label: '➕ New order', testId: 'nav-new' },
  { to: '/today', label: '📅 Today’s orders', testId: 'nav-today', badge: true },
  { to: '/orders', label: '📋 All orders', testId: 'nav-orders' },
  { to: '/sales', label: '💰 Sales', testId: 'nav-sales' },
  { to: '/settings', label: '⚙️ Flavours & Areas', testId: 'nav-settings' },
];

export function AppShell() {
  const { user, logout } = useAuth();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState(false);
  useIdleLogout(true, () => void logout('You were logged out after 10 minutes of inactivity.'));
  useEffect(() => { setOpen(false); window.scrollTo(0, 0); }, [loc.pathname]);

  // sidebar badge: today's cakes that are not delivered yet
  const today = useQuery({ queryKey: ['orders', 'badge'], queryFn: () => listOrders({ range: 'today', page: 1, limit: 1 }) });
  const openToday = today.data?.counts ? today.data.counts.pending + today.data.counts.ready : 0;

  return (
    <>
      <aside className={`side${open ? ' open' : ''}`} id="side" aria-label="Main menu">
        <div className="brand"><i>🎂</i>Blusher Cakes</div>
        <nav className="nav" aria-label="Pages">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} data-testid={n.testId}
              className={({ isActive }) => (isActive || (n.to === '/new' && loc.pathname.startsWith('/edit')) ? 'on' : '')}>
              {n.label}{n.badge && <span className="n" data-testid="badge">{openToday}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sfoot">
          Instagram<br /><a href="https://www.instagram.com/blushercakes" target="_blank" rel="noopener noreferrer">@blushercakes</a>
          <div className="who">
            <span data-testid="hello">Signed in as {user?.username}</span>
            <button type="button" className="link" data-testid="change-password" onClick={() => setPw(true)}>Change password</button>
            <button type="button" className="link" data-testid="logout" onClick={() => void logout()}>Log out</button>
          </div>
        </div>
      </aside>
      <div className={`scrim${open ? ' show' : ''}`} onClick={() => setOpen(false)} />
      <div className="mbar">
        <button type="button" className="ib" id="menu" aria-label="Open menu" aria-expanded={open} data-testid="menu" onClick={() => setOpen(true)}>☰</button>
        <b>Blusher Cakes</b>
        <NotificationBell />
        <Link className="ib add" to="/new" data-testid="order-new">+ Order</Link>
      </div>
      <main>
        <div id="view">
          <ErrorBoundary resetKey={loc.pathname}>
            <Suspense fallback={<p className="sub">Loading…</p>}><Outlet /></Suspense>
          </ErrorBoundary>
        </div>
      </main>
      {pw && <ChangePasswordDialog onClose={() => setPw(false)} />}
    </>
  );
}
