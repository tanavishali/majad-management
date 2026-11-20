import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';

export function ProtectedRoute() {
  const { status } = useAuth();
  const loc = useLocation();
  if (status === 'loading') return <div className="login" data-testid="auth-loading"><p className="sub">Loading…</p></div>;
  if (status === 'anon') return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  return <Outlet />;
}
