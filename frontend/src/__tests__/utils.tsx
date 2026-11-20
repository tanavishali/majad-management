import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ApiList, OrderDTO } from '@order-desk/shared';
import { ToastProvider } from '../app/toast';

export const API = '*/api/v1';

export function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: 0 }, mutations: { retry: false } } });
}

export function LocationProbe() {
  const l = useLocation();
  return <div data-testid="loc">{l.pathname + l.search}</div>;
}

/** Renders `ui` at `path` (default: the route it is mounted on) inside router, query client and toasts. */
export function renderApp(ui: ReactElement, opts: { route?: string; path?: string; client?: QueryClient } = {}) {
  const client = opts.client ?? makeClient();
  const utils = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={[opts.route ?? '/']}>
          <Routes>
            <Route path={opts.path ?? '*'} element={ui} />
            <Route path="*" element={<div data-testid="elsewhere" />} />
          </Routes>
          <LocationProbe />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { ...utils, client };
}

export const order = (n: number, over: Partial<OrderDTO> = {}): OrderDTO => ({
  id: `id${n}`, orderNo: n, code: `#OD-${1000 + n}`, cake: `Cake ${n}`, addons: [],
  customer: { name: `Customer ${n}`, phone: '03001234567' }, location: '', source: '',
  scheduledAt: '2030-03-10T06:30:00.000Z', status: 'pending', lbs: 2,
  price: 1000 * n, advance: 0, profit: 600 * n, balance: 1000 * n, imageCount: 0, details: '', version: 1,
  createdAt: '2030-01-01T00:00:00.000Z', updatedAt: '2030-01-01T00:00:00.000Z', ...over,
});

export const list = (rows: OrderDTO[], extra: Partial<ApiList<OrderDTO>> = {}): ApiList<OrderDTO> => ({
  data: rows,
  meta: { page: 1, limit: 40, total: rows.length, pages: rows.length ? 1 : 0 },
  counts: { all: rows.length, pending: rows.length, ready: 0, delivered: 0, cancelled: 0 },
  ...extra,
});

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
