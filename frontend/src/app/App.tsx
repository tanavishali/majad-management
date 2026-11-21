import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { AppShell } from './AppShell';
import { ErrorBoundary } from './ErrorBoundary';

const LoginPage = lazy(() => import('../features/auth/LoginPage'));
const DashboardPage = lazy(() => import('../features/stats/DashboardPage'));
const NewOrderPage = lazy(() => import('../features/orders/NewOrderPage'));
const OrdersPage = lazy(() => import('../features/orders/OrdersPage'));
const SalesPage = lazy(() => import('../features/stats/SalesPage'));
const SettingsPage = lazy(() => import('../features/settings/SettingsPage'));

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<ErrorBoundary><Suspense fallback={null}><LoginPage /></Suspense></ErrorBoundary>} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="new" element={<NewOrderPage />} />
            <Route path="edit/:id" element={<NewOrderPage />} />
            <Route path="today" element={<OrdersPage mode="today" />} />
            <Route path="orders" element={<OrdersPage mode="all" />} />
            <Route path="sales" element={<SalesPage />} />
            <Route path="settings" element={<Navigate to="/settings/flavours" replace />} />
            <Route path="settings/flavours" element={<SettingsPage listKey="flavours" />} />
            <Route path="settings/areas" element={<SettingsPage listKey="locations" />} />
            <Route path="settings/addons" element={<SettingsPage listKey="addons" />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
