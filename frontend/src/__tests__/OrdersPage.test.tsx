import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from './server';
import { API, list, order, renderApp } from './utils';
import OrdersPage, { pageList } from '../features/orders/OrdersPage';
import { receiptHtml, receiptRows } from '../lib/receipt';

const printReceipt = vi.fn((_o: unknown) => true);
vi.mock('../lib/receipt', async (orig) => ({ ...(await orig<typeof import('../lib/receipt')>()), printReceipt: (o: unknown) => printReceipt(o as never) }));

const SETTINGS = http.get(`${API}/settings`, () => HttpResponse.json({ data: { flavours: [], locations: ['DHA'], addons: [] } }));

describe('pageList', () => {
  it('shows every page when there are few, and collapses long ranges', () => {
    expect(pageList(1, 1)).toEqual([1]);
    expect(pageList(2, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageList(1, 20)).toEqual([1, 2, '…', 20]);
    expect(pageList(10, 20)).toEqual([1, '…', 9, 10, 11, '…', 20]);
    expect(pageList(20, 20)).toEqual([1, '…', 19, 20]);
  });
});

describe('receipt', () => {
  it('lists order details and creates a compact branded thermal receipt', () => {
    const o = order(1, { addons: ['Candles'], location: 'DHA', source: 'whatsapp' });
    const rows = Object.fromEntries(receiptRows(o));
    expect(rows).toMatchObject({ Order: '#OD-1001', Cake: 'Cake 1', 'Add-ons': 'Candles', Location: 'DHA', 'Ordered via': 'WhatsApp', Weight: '2 lb' });
    const html = receiptHtml(o);
    expect(html).toContain('@page{size:80mm auto');
    expect(html).toContain('Blusher Cakes');
    expect(html).toContain('Developed by Tech Riyawat');
    expect(html).toContain('tanawishalrai5271@gmail.com');
    expect(html).not.toContain('03067251356');
    expect(Object.keys(Object.fromEntries(receiptRows(order(2))))).not.toContain('Add-ons');
  });
});

describe('Orders page', () => {
  it('has numbered pages, a range, and a page size that is sent to the server', async () => {
    const seen: URLSearchParams[] = [];
    server.use(SETTINGS, http.get(`${API}/orders`, ({ request }) => {
      const u = new URL(request.url); seen.push(u.searchParams);
      const page = Number(u.searchParams.get('page') ?? 1);
      return HttpResponse.json(list([order(page)], { meta: { page, limit: Number(u.searchParams.get('limit')), total: 45, pages: 3 } }));
    }));
    renderApp(<OrdersPage mode="all" />);
    expect(await screen.findByTestId('range')).toHaveTextContent('Showing 1–20 of 45');
    expect(seen[0].get('limit')).toBe('20');
    await userEvent.click(within(screen.getByTestId('pager')).getByRole('button', { name: '2' }));
    await waitFor(() => expect(seen.at(-1)!.get('page')).toBe('2'));
    expect(await screen.findByText('Cake 2')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Previous page' }));
    await waitFor(() => expect(seen.at(-1)!.get('page')).toBe('1'));
    await userEvent.selectOptions(screen.getByTestId('page-size'), '10');
    await waitFor(() => expect(seen.at(-1)!.get('limit')).toBe('10'));
    expect(seen.at(-1)!.get('page')).toBe('1');
  });

  it('has no pager when there are no orders', async () => {
    server.use(SETTINGS, http.get(`${API}/orders`, () => HttpResponse.json(list([]))));
    renderApp(<OrdersPage mode="all" />);
    expect(await screen.findByTestId('empty')).toBeInTheDocument();
    expect(screen.queryByTestId('pager')).not.toBeInTheDocument();
  });

  it('allows status changes for delivered orders', async () => {
    const delivered = order(4, { id: 'delivered-4', status: 'delivered' });
    server.use(SETTINGS, http.get(`${API}/orders`, () => HttpResponse.json(list([delivered]))));
    renderApp(<OrdersPage mode="all" />);
    const card = await screen.findByTestId('order-delivered-4');
    expect(within(card).getByTestId('order-status')).toHaveTextContent('Delivered');
    expect(within(card).getByTestId('order-mark')).toHaveTextContent('Mark Pending');
  });

  it('View opens every detail, and the receipt button opens print', async () => {
    const o = order(5, { id: 'o5', addons: ['Toppers'], location: 'Gulberg', source: 'instagram', advance: 1000, balance: 4000, price: 5000, details: 'Name: Aiza', imageCount: 1 });
    server.use(SETTINGS,
      http.get(`${API}/orders`, () => HttpResponse.json(list([o]))),
      http.get(`${API}/orders/o5`, () => HttpResponse.json({ data: { ...o, images: [{ key: 'a.webp', thumbKey: 'a.t.webp', w: 1, h: 1, url: '/api/v1/files/a.webp', thumbUrl: '/api/v1/files/a.t.webp' }] } })),
    );
    renderApp(<OrdersPage mode="all" />);
    await userEvent.click(await screen.findByTestId('order-view'));
    const v = await screen.findByTestId('order-view-dialog');
    expect(v).toHaveTextContent('#OD-1005');
    expect(v).toHaveTextContent('Instagram');
    expect(v).toHaveTextContent('Gulberg');
    expect(v).toHaveTextContent('Name: Aiza');
    expect(within(v).getByTestId('view-balance')).toHaveTextContent('Rs 4,000');
    expect(await within(v).findByAltText('Reference cake')).toBeInTheDocument();
    await userEvent.click(within(v).getByTestId('view-receipt'));
    await waitFor(() => expect(printReceipt).toHaveBeenCalledTimes(1));
    await userEvent.click(within(v).getByTestId('view-close'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
