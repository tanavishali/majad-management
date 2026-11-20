import { TZ, type Overview, type SalesQuery, type SalesSummary } from '@order-desk/shared';
import { addDays, fromKarachi, startOfDay, startOfMonth, startOfWeek, ymd } from '../../utils/time';
import { balanceOf, toDTO } from '../orders/order.dto';
import { OrderModel } from '../orders/order.model';
import { orderRepository } from '../orders/order.repository';

const sum = <T>(rows: T[], f: (r: T) => number) => rows.reduce((s, r) => s + f(r), 0);
const FIELDS = 'scheduledAt status cake lbs price advance profit';
type Row = { scheduledAt: Date; status: string; cake?: string; lbs?: number; price?: number | null; advance?: number | null; profit?: number | null };

/** Non-cancelled orders in [from, to) (or all of them). */
async function load(from?: Date, to?: Date): Promise<Row[]> {
  const q: Record<string, unknown> = { isDeleted: false, status: { $ne: 'cancelled' } };
  if (from && to) q.scheduledAt = { $gte: from, $lt: to };
  return OrderModel.find(q).select(FIELDS).lean() as unknown as Promise<Row[]>;
}

export const statsService = {
  /** Dashboard cards + the next four open orders. */
  async overview(now = new Date()): Promise<Overview> {
    const sod = startOfDay(now);
    const all = await load();
    const today = all.filter(o => o.scheduledAt >= sod && o.scheduledAt < addDays(sod, 1));
    const upcoming = all.filter(o => o.scheduledAt >= sod && o.status !== 'delivered');
    const next = await orderRepository.upNext(sod, 4);
    return {
      todayCount: today.length,
      upcoming: upcoming.length,
      balance: sum(all, balanceOf),
      totalSales: sum(all, o => o.price ?? 0),
      totalProfit: sum(all, o => o.profit ?? 0),
      upNext: next.map(o => toDTO(o, now, false)),
    };
  },

  /** Sales page: totals for a period, the last-7-days bars (always) and best sellers. */
  async sales({ period, month, from, to }: SalesQuery, now = new Date()): Promise<SalesSummary> {
    const sod = startOfDay(now);
    const base = month ? new Date(`${month}-15T12:00:00Z`) : now;
    const day = (s: string) => { const [y, m, d] = s.split('-').map(Number); return fromKarachi(y, m, d); };
    const win = period === 'm' ? [startOfMonth(base), startOfMonth(base, 1)]
      : period === 'w' ? [startOfWeek(from ? day(from) : now), addDays(startOfWeek(from ? day(from) : now), 7)]
      : period === 'c' ? [day(from!), addDays(day(to!), 1)]
      : [sod, addDays(sod, 1)];
    const rows = await load(win[0], win[1]);
    const orders = rows.length;
    const sales = sum(rows, o => o.price ?? 0);
    const lbs = sum(rows, o => o.lbs ?? 0);

    const weekFrom = addDays(sod, -6);
    const week = await load(weekFrom, addDays(sod, 1));
    const perDay = new Map<string, number>();
    for (const o of week) { const k = ymd(o.scheduledAt); perDay.set(k, (perDay.get(k) ?? 0) + (o.price ?? 0)); }
    const last7 = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(weekFrom, i);
      return { date: ymd(d), label: d.toLocaleDateString('en-US', { weekday: 'short', timeZone: TZ }), total: perDay.get(ymd(d)) ?? 0 };
    });

    const counts = new Map<string, { name: string; count: number }>();
    for (const o of rows) {
      const name = (o.cake ?? 'Cake order').trim();
      const k = name.toLowerCase();
      const c = counts.get(k) ?? { name, count: 0 };
      c.count++;
      if (name < c.name) c.name = name; // several spellings of one cake: show one, deterministically
      counts.set(k, c);
    }
    const best = [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 5);

    const byDay = new Map<string, { date: string; orders: number; sales: number; profit: number }>();
    if (period !== '1') {
      for (const o of rows) {
        const k = ymd(o.scheduledAt);
        const d = byDay.get(k) ?? { date: k, orders: 0, sales: 0, profit: 0 };
        d.orders++; d.sales += o.price ?? 0; d.profit += o.profit ?? 0;
        byDay.set(k, d);
      }
    }
    const daily = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));

    return {
      period, from: ymd(win[0]), to: ymd(addDays(win[1], -1)), month: period === 'm' ? ymd(win[0]).slice(0, 7) : '', daily, orders, sales, profit: sum(rows, o => o.profit ?? 0), lbs,
      avgPerOrder: orders ? Math.round(sales / orders) : 0,
      avgPerLb: lbs ? Math.round(sales / lbs) : 0,
      advance: sum(rows, o => o.advance ?? 0),
      balance: sum(rows, balanceOf),
      last7, best,
    };
  },
};
