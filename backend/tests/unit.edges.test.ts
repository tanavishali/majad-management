// Extra DB-free unit tests: filter/range/search edges, slot edges, Karachi time edges.
import { describe, expect, it } from 'vitest';
import { buildOrderFilter, buildSort, resolveRange, searchClause } from '../src/modules/orders/filter';
import { orderCode, slotWindow, tooClose, toSlotConflict } from '../src/modules/orders/slot';
import {
  DAY_MS, addDays, fmtDateLong, fmtGenerated, fmtTime12, fromKarachi, hhmm, karachiParts, startOfDay, startOfMonth, startOfWeek, ymd,
} from '../src/utils/time';

const now = new Date('2025-03-12T07:00:00Z'); // Wed 12 Mar 2025 12:00 Karachi
const K = (iso: string) => new Date(iso);

describe('resolveRange edges', () => {
  it('today is exactly [Karachi 00:00, +24h)', () => {
    const r = resolveRange('today', now)!;
    expect(r.from.toISOString()).toBe('2025-03-11T19:00:00.000Z');
    expect(r.to.toISOString()).toBe('2025-03-12T19:00:00.000Z');
  });
  it('the exact Karachi midnight belongs to the new day; 1ms earlier to the old day', () => {
    expect(ymd(resolveRange('today', K('2025-03-11T19:00:00.000Z'))!.from)).toBe('2025-03-12');
    expect(ymd(resolveRange('today', K('2025-03-11T18:59:59.999Z'))!.from)).toBe('2025-03-11');
  });
  it('week: Monday 00:00 starts a new week, Sunday 23:59:59 still belongs to the old one', () => {
    expect(ymd(resolveRange('week', K('2025-03-09T19:00:00Z'))!.from)).toBe('2025-03-10'); // Mon 00:00 Karachi
    expect(ymd(resolveRange('week', K('2025-03-09T18:59:59Z'))!.from)).toBe('2025-03-03'); // Sun 23:59:59 Karachi
    expect(ymd(resolveRange('week', K('2025-03-16T18:59:59Z'))!.to)).toBe('2025-03-17');
  });
  it('nextweek is exactly 7 days after week', () => {
    const w = resolveRange('week', now)!; const n = resolveRange('nextweek', now)!;
    expect(n.from.getTime() - w.from.getTime()).toBe(7 * DAY_MS); expect(n.to.getTime()).toBe(w.to.getTime() + 7 * DAY_MS);
  });
  it('lastmonth across a year boundary and leap February', () => {
    const jan = resolveRange('lastmonth', K('2025-01-15T00:00:00Z'))!;
    expect(ymd(jan.from)).toBe('2024-12-01'); expect(ymd(jan.to)).toBe('2025-01-01');
    const leap = resolveRange('lastmonth', K('2024-03-10T00:00:00Z'))!;
    expect((leap.to.getTime() - leap.from.getTime()) / DAY_MS).toBe(29);
    const feb = resolveRange('month', K('2025-02-10T00:00:00Z'))!;
    expect((feb.to.getTime() - feb.from.getTime()) / DAY_MS).toBe(28);
  });
  it('month boundary at Karachi midnight: 1 Mar 00:00 Karachi is March, 29 Feb 23:59 is February', () => {
    expect(ymd(resolveRange('month', K('2025-02-28T19:00:00Z'))!.from)).toBe('2025-03-01');
    expect(ymd(resolveRange('month', K('2025-02-28T18:59:59Z'))!.from)).toBe('2025-02-01');
  });
  it('custom: same day gives a 24h window; partial inputs and unknown presets give null', () => {
    const r = resolveRange('custom', now, K('2025-03-05T10:00:00+05:00'), K('2025-03-05T22:00:00+05:00'))!;
    expect(r.to.getTime() - r.from.getTime()).toBe(DAY_MS);
    expect(resolveRange('custom', now, K('2025-03-05T10:00:00Z'))).toBeNull();
    expect(resolveRange('custom', now, undefined, K('2025-03-05T10:00:00Z'))).toBeNull();
    expect(resolveRange('nonsense', now)).toBeNull();
  });
});

describe('searchClause edges', () => {
  it('order code variants and trimming', () => {
    expect(searchClause(' #OD-1001 ')).toEqual({ orderNo: 1 });
    expect(searchClause('OD 5')).toEqual({ orderNo: 0 });
    expect(searchClause('#od-1000')).toEqual({ orderNo: 0 });
    expect(searchClause('OD-2000')).toEqual({ orderNo: 1000 });
  });
  it('digits: <=1000 is the orderNo, >1000 is the display code, leading zero is a phone', () => {
    expect(searchClause('1000')).toEqual({ orderNo: 1000 });
    expect(searchClause('1001')).toEqual({ orderNo: 1 });
    expect(searchClause('999999')).toEqual({ orderNo: 998999 });
    expect(searchClause('0')).toEqual({ 'customer.phone': { $regex: '^0' } });
    expect(searchClause('000123')).toEqual({ 'customer.phone': { $regex: '^000123' } });
  });
  it('7+ digit strings are phones (prefix), not order numbers', () => {
    expect(searchClause('1234567')).toEqual({ 'customer.phone': { $regex: '^1234567' } });
    expect(searchClause('(0300) 123')).toEqual({ 'customer.phone': { $regex: '^0300123' } });
    expect(searchClause('+92(3)')).toEqual({ 'customer.phone': { $regex: '^\\+923' } });
  });
  it('short dashed digits and bare symbols fall through to a contains-search', () => {
    for (const q of ['12-34', '+', 'OD', 'a.b']) {
      const c = searchClause(q) as { $or: Array<Record<string, { $regex: string; $options: string }>> };
      expect(c.$or).toHaveLength(6);
      expect(c.$or[0]!.cake).toEqual({ $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' });
    }
  });
  it('phone prefix regexes are always anchored and digit-only, whatever the input', () => {
    for (const q of ['.*', '(', '[a-z]+', '\\', '^', '$', '0*', '0.+', '+9+2', 'ali|bob', '0300) (']) {
      const c = searchClause(q);
      if (!c) continue;
      const rx = (c as Record<string, { $regex?: string }>)['customer.phone']?.$regex;
      if (rx !== undefined) {
        expect(rx.startsWith('^'), q).toBe(true);
        expect(new RegExp(rx)).toBeInstanceOf(RegExp); // always a valid regex (metacharacters escaped)
        expect(rx.slice(1).replace(/\\\+/g, '')).toMatch(/^\d*$/); // body is digits only
      }
    }
  });
});

describe('buildOrderFilter combinations', () => {
  it('exact $and layout for a combined query', () => {
    const t = resolveRange('today', now)!;
    const f = buildOrderFilter({ location: 'DHA', status: 'ready', range: 'today', q: '0300' }, now);
    expect(f.$and).toEqual([
      { isDeleted: false }, { location: { $regex: '^DHA$', $options: 'i' } }, { status: 'ready' },
      { scheduledAt: { $gte: t.from, $lt: t.to } }, { 'customer.phone': { $regex: '^0300' } },
    ]);
  });
  it('location: escaped exact match, and "no location" matches empty or missing', () => {
    expect(buildOrderFilter({ location: 'Johar (Town)' }, now).$and[1]).toEqual({ location: { $regex: '^Johar \\(Town\\)$', $options: 'i' } });
    expect(buildOrderFilter({ location: '__none__' }, now).$and[1]).toEqual({ $or: [{ location: '' }, { location: { $exists: false } }] });
  });
  it('cancelled and undefined status; custom without dates adds no range; blank q adds nothing', () => {
    expect(buildOrderFilter({ status: 'cancelled' }, now).$and).toContainEqual({ status: 'cancelled' });
    expect(buildOrderFilter({}, now).$and).toHaveLength(1);
    expect(buildOrderFilter({ range: 'custom' }, now).$and).toHaveLength(1);
    expect(buildOrderFilter({ q: '   ' }, now).$and).toHaveLength(1);
  });
  it('deleted rows are excluded in every variant, including excludeStatus', () => {
    for (const q of [{}, { status: 'all' }, { status: 'delivered' }, { q: 'x' }, { range: 'week' }] as const) {
      expect(buildOrderFilter(q, now).$and[0]).toEqual({ isDeleted: false });
      expect(buildOrderFilter(q, now, { excludeStatus: true }).$and[0]).toEqual({ isDeleted: false });
    }
  });
  it('buildSort covers every whitelisted field both ways', () => {
    for (const f of ['scheduledAt', 'orderNo', 'price', 'profit', 'createdAt']) {
      expect(buildSort(f)).toEqual({ [f]: 1, _id: 1 }); expect(buildSort(`-${f}`)).toEqual({ [f]: -1, _id: -1 });
    }
  });
});

describe('slot edges', () => {
  const t = K('2025-03-10T10:00:00Z');
  it('is symmetric and millisecond-exact around 30 minutes', () => {
    const e = 30 * 60_000;
    expect(tooClose(t, new Date(t.getTime() + e - 1))).toBe(true);
    expect(tooClose(t, new Date(t.getTime() + e))).toBe(false);
    expect(tooClose(t, new Date(t.getTime() - e + 1))).toBe(true);
    expect(tooClose(t, new Date(t.getTime() - e))).toBe(false);
    expect(tooClose(new Date(t.getTime() + 20 * 60_000), t)).toBe(tooClose(t, new Date(t.getTime() + 20 * 60_000)));
  });
  it('window bounds are exclusive-compatible with $gt/$lt', () => {
    const w = slotWindow(t);
    expect(w.to.getTime() - w.from.getTime()).toBe(60 * 60_000);
    expect(tooClose(t, w.from)).toBe(false); expect(tooClose(t, w.to)).toBe(false);
  });
  it('order code for 0, 999 and 1000+; conflict payload uses ISO', () => {
    expect(orderCode(0)).toBe('#OD-1000'); expect(orderCode(999)).toBe('#OD-1999'); expect(orderCode(10_000)).toBe('#OD-11000');
    expect(toSlotConflict({ orderNo: 12, customer: { name: 'A' }, scheduledAt: t }).scheduledAt).toBe('2025-03-10T10:00:00.000Z');
  });
});

describe('Karachi time edges (fixed UTC+5, no DST)', () => {
  it('every day of 2025 and the leap day of 2024 is exactly 24h long, starting at 19:00Z', () => {
    let d = startOfDay(K('2024-12-31T19:00:00Z'));
    for (let i = 0; i < 366 + 1; i++) {
      expect(d.getUTCHours()).toBe(19); expect(d.getUTCMinutes()).toBe(0);
      const n = startOfDay(addDays(d, 1));
      expect(n.getTime() - d.getTime()).toBe(DAY_MS);
      d = n;
    }
    const leap = startOfDay(K('2024-02-28T12:00:00Z'));
    expect(ymd(addDays(leap, 1))).toBe('2024-02-29'); expect(ymd(addDays(leap, 2))).toBe('2024-03-01');
  });
  it('year rollover and Karachi-local weekday', () => {
    expect(ymd(K('2025-12-31T19:00:00Z'))).toBe('2026-01-01');
    expect(ymd(K('2025-12-31T18:59:59Z'))).toBe('2025-12-31');
    expect(karachiParts(now)).toMatchObject({ y: 2025, m: 3, d: 12, h: 12, min: 0, dow: 3 });
    expect(karachiParts(K('2025-03-09T19:00:00Z')).dow).toBe(1); // Monday 00:00 Karachi
  });
  it('fromKarachi normalises day and month overflow', () => {
    expect(ymd(fromKarachi(2025, 1, 32))).toBe('2025-02-01');
    expect(ymd(fromKarachi(2025, 13, 1))).toBe('2026-01-01');
    expect(ymd(fromKarachi(2025, 3, 0))).toBe('2025-02-28');
    expect(fromKarachi(2025, 3, 12, 12, 0).toISOString()).toBe('2025-03-12T07:00:00.000Z');
  });
  it('startOfWeek for each weekday lands on Monday', () => {
    for (let i = 0; i < 7; i++) {
      const d = addDays(K('2025-03-09T19:00:00Z'), i); // Mon 10 .. Sun 16
      expect(ymd(startOfWeek(addDays(d, 0.5)))).toBe('2025-03-10');
    }
    expect(ymd(startOfWeek(K('2025-03-16T19:00:00Z')))).toBe('2025-03-17');
  });
  it('startOfMonth offsets in both directions', () => {
    expect(ymd(startOfMonth(now, -14))).toBe('2024-01-01');
    expect(ymd(startOfMonth(now, 10))).toBe('2026-01-01');
  });
  it('12-hour clock: midnight, noon, afternoon, last minute', () => {
    expect(fmtTime12(fromKarachi(2025, 3, 1, 0, 0))).toBe('12:00 AM');
    expect(fmtTime12(fromKarachi(2025, 3, 1, 0, 5))).toBe('12:05 AM');
    expect(fmtTime12(fromKarachi(2025, 3, 1, 12, 0))).toBe('12:00 PM');
    expect(fmtTime12(fromKarachi(2025, 3, 1, 13, 5))).toBe('1:05 PM');
    expect(fmtTime12(fromKarachi(2025, 3, 1, 23, 59))).toBe('11:59 PM');
    expect(hhmm(fromKarachi(2025, 3, 1, 9, 7))).toBe('09:07');
  });
  it('formatters render in Asia/Karachi, not the host zone', () => {
    const d = K('2025-03-11T20:30:00Z'); // 12 Mar 01:30 Karachi
    expect(fmtDateLong(d)).toMatch(/12/); expect(fmtDateLong(d)).toMatch(/Mar/); expect(fmtDateLong(d)).toMatch(/2025/);
    expect(fmtGenerated(d)).toMatch(/12 Mar 2025/);
  });
});
