import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { NotificationBell } from '../features/notifications/NotificationBell';
import { API, order, renderApp } from './utils';
import { server } from './server';

describe('NotificationBell', () => {
  it('shows the next five upcoming orders in the bell panel', async () => {
    server.use(http.get(`${API}/orders/next-upcoming`, () => HttpResponse.json({
      data: Array.from({ length: 5 }, (_, i) => order(i + 1, {
        scheduledAt: new Date(Date.now() + (60 + i * 30) * 60_000).toISOString(),
      })),
      meta: { minutes: 0, now: new Date().toISOString(), total: 5 },
    })));

    renderApp(<NotificationBell />);
    expect(await screen.findByTestId('notif-badge')).toHaveTextContent('5');
    await screen.findByRole('button', { name: /5 upcoming orders/i });
    await (await screen.findByRole('button', { name: /5 upcoming orders/i })).click();
    expect(await screen.findByRole('heading', { name: 'Next 5 upcoming orders' })).toBeInTheDocument();
    for (let i = 1; i <= 5; i++) expect(screen.getByTestId(`notif-item-id${i}`)).toBeInTheDocument();
  });
});
