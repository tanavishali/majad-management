import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { SalesSummary } from '@order-desk/shared';
import { server } from './server';
import { API, renderApp } from './utils';
import SalesPage from '../features/stats/SalesPage';
import { rangeLabel, reportTitle, reportTotals, salesReportFileName } from '../lib/salesReport';

const download = vi.fn(async (_s: unknown) => true);
vi.mock('../lib/salesReport', async (orig) => ({ ...(await orig<typeof import('../lib/salesReport')>()), downloadSalesReport: (s: unknown) => download(s) }));

const summary = (over: Partial<SalesSummary> = {}): SalesSummary => ({
  period: 'm', from: '2026-11-01', to: '2026-11-30', month: '2026-11', daily: [{ date: '2026-11-03', orders: 2, sales: 9000, profit: 2500 }], orders: 2, sales: 9000, profit: 2500, lbs: 5,
  avgPerOrder: 4500, avgPerLb: 1800, advance: 3000, balance: 6000,
  last7: Array.from({ length: 7 }, (_, i) => ({ date: `2026-11-${10 + i}`, label: 'Mon', total: i * 100 })), best: [{ name: 'Cake order', count: 2 }], ...over,
});

function mockSales() {
  const seen: URLSearchParams[] = [];
  server.use(http.get(`${API}/stats/sales`, ({ request }) => {
    const p = new URL(request.url).searchParams; seen.push(p);
    return HttpResponse.json({ data: summary({ period: p.get('period') as SalesSummary['period'], month: p.get('month') ?? '', from: p.get('from') ?? '2026-11-01', to: p.get('to') ?? '2026-11-30' }) });
  }));
  return seen;
}

describe('report helpers', () => {
  it('lists the totals, titles the report and names the file', () => {
    expect(Object.fromEntries(reportTotals(summary()))).toMatchObject({ Orders: '2', Sales: 'Rs 9,000', Profit: 'Rs 2,500', 'Cake sold': '5 lb', 'Balance to collect': 'Rs 6,000' });
    expect(rangeLabel('2026-11-16', '2026-11-22')).toBe('16 Nov – 22 Nov 2026');
    expect(rangeLabel('2026-11-05', '2026-11-05')).toBe('5 Nov 2026');
    expect(rangeLabel('2026-12-28', '2027-01-03')).toBe('28 Dec 2026 – 3 Jan 2027');
    expect(reportTitle(summary())).toBe('MONTHLY SALES REPORT · NOVEMBER 2026');
    expect(reportTitle(summary({ period: 'w', from: '2026-11-16', to: '2026-11-22' }))).toBe('WEEKLY SALES REPORT · 16 NOV – 22 NOV 2026');
    expect(reportTitle(summary({ period: 'c', from: '2026-11-02', to: '2026-11-09' }))).toBe('SALES REPORT · 2 NOV – 9 NOV 2026');
    expect(salesReportFileName(summary())).toBe('sales-report-2026-11.png');
    expect(salesReportFileName(summary({ period: 'w', from: '2026-11-16', to: '2026-11-22' }))).toBe('sales-report-week-2026-11-16_to_2026-11-22.png');
    expect(salesReportFileName(summary({ period: 'c', from: '2026-11-02', to: '2026-11-09' }))).toBe('sales-report-2026-11-02_to_2026-11-09.png');
  });
});

describe('Sales page', () => {
  it('offers Today, Weekly, Monthly and Custom (no 7 days / all time)', async () => {
    mockSales();
    renderApp(<SalesPage />);
    for (const k of ['1', 'w', 'm', 'c']) expect(screen.getByTestId(`period-${k}`)).toBeInTheDocument();
    expect(screen.queryByTestId('period-7')).not.toBeInTheDocument();
    expect(screen.queryByTestId('period-all')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('k-sales')).toHaveTextContent('Rs 9,000'));
  });

  it('monthly: steps through months (not past the current one) and downloads that month\'s report', async () => {
    const seen = mockSales();
    renderApp(<SalesPage />);
    await waitFor(() => expect(screen.getByTestId('report')).toBeEnabled());
    const thisMonth = screen.getByTestId('month-label').textContent;
    expect(screen.getByTestId('month-next')).toBeDisabled();
    await userEvent.click(screen.getByTestId('month-prev'));
    expect(screen.getByTestId('month-label').textContent).not.toBe(thisMonth);
    await waitFor(() => expect(seen.at(-1)!.get('month')).toMatch(/^\d{4}-\d{2}$/));
    expect(seen.at(-1)!.get('period')).toBe('m');
    expect(screen.getByTestId('month-next')).toBeEnabled();
    await waitFor(() => expect(screen.getByTestId('report')).toBeEnabled());
    await userEvent.click(screen.getByTestId('report'));
    await waitFor(() => expect(download).toHaveBeenCalledWith(expect.objectContaining({ period: 'm' })));
    await userEvent.click(screen.getByTestId('month-next'));
    expect(screen.getByTestId('month-label').textContent).toBe(thisMonth);
  });

  it('weekly: shows Monday–Sunday, steps back a week, asks the server for that week', async () => {
    const seen = mockSales();
    renderApp(<SalesPage />);
    await userEvent.click(screen.getByTestId('period-w'));
    const label = screen.getByTestId('week-label').textContent!;
    expect(label).toMatch(/\d+ \w{3} – \d+ \w{3} \d{4}/);
    expect(screen.getByTestId('week-next')).toBeDisabled();
    await userEvent.click(screen.getByTestId('week-prev'));
    expect(screen.getByTestId('week-label').textContent).not.toBe(label);
    await waitFor(() => expect(seen.some((p) => p.get('period') === 'w' && /^\d{4}-\d{2}-\d{2}$/.test(p.get('from') ?? ''))).toBe(true));
    await waitFor(() => expect(screen.getByTestId('report')).toBeEnabled());
    await userEvent.click(screen.getByTestId('report'));
    await waitFor(() => expect(download).toHaveBeenCalledWith(expect.objectContaining({ period: 'w' })));
  });

  it('custom: sends the chosen dates, and holds back an end date before the start', async () => {
    const seen = mockSales();
    renderApp(<SalesPage />);
    await userEvent.click(screen.getByTestId('period-c'));
    fireEvent.change(screen.getByTestId('custom-from'), { target: { value: '2026-11-02' } });
    fireEvent.change(screen.getByTestId('custom-to'), { target: { value: '2026-11-09' } });
    await waitFor(() => expect(seen.some((p) => p.get('period') === 'c' && p.get('from') === '2026-11-02' && p.get('to') === '2026-11-09')).toBe(true));
    await waitFor(() => expect(screen.getByTestId('report')).toBeEnabled());
    await userEvent.click(screen.getByTestId('report'));
    await waitFor(() => expect(download).toHaveBeenCalledWith(expect.objectContaining({ period: 'c', from: '2026-11-02', to: '2026-11-09' })));

    const before = seen.length;
    fireEvent.change(screen.getByTestId('custom-from'), { target: { value: '2026-11-15' } }); // after the end date
    expect(await screen.findByTestId('custom-error')).toBeInTheDocument();
    expect(screen.getByTestId('report')).toBeDisabled();
    expect(seen.length).toBe(before);
  });

  it('Today hides the range controls', async () => {
    mockSales();
    renderApp(<SalesPage />);
    await userEvent.click(screen.getByTestId('period-1'));
    for (const id of ['monthbar', 'weekbar', 'custombar']) expect(screen.queryByTestId(id)).not.toBeInTheDocument();
    expect(screen.queryByTestId('report')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('k-orders')).toHaveTextContent('2'));
  });
});
