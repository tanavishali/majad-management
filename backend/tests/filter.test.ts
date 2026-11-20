import { describe, expect, it } from 'vitest';
import { buildOrderFilter, buildSort, resolveRange, searchClause } from '../src/modules/orders/filter';
import { ymd } from '../src/utils/time';

// Wednesday 2025-03-12 12:00 Karachi
const now = new Date('2025-03-12T07:00:00Z');
const and = (f: { $and: unknown[] }) => f.$and;

describe('resolveRange (Asia/Karachi, half-open)', () => {
  it('today / tomorrow', () => {
    const t = resolveRange('today', now)!;
    expect(ymd(t.from)).toBe('2025-03-12'); expect(t.to.getTime() - t.from.getTime()).toBe(86_400_000);
    expect(ymd(resolveRange('tomorrow', now)!.from)).toBe('2025-03-13');
  });
  it('week is Monday..next Monday, nextweek follows', () => {
    const w = resolveRange('week', now)!;
    expect(ymd(w.from)).toBe('2025-03-10'); expect(ymd(w.to)).toBe('2025-03-17');
    expect(ymd(resolveRange('nextweek', now)!.from)).toBe('2025-03-17');
  });
  it('month and lastmonth', () => {
    const m = resolveRange('month', now)!; expect(ymd(m.from)).toBe('2025-03-01'); expect(ymd(m.to)).toBe('2025-04-01');
    const l = resolveRange('lastmonth', now)!; expect(ymd(l.from)).toBe('2025-02-01'); expect(ymd(l.to)).toBe('2025-03-01');
  });
  it('custom is inclusive of the end day and swaps reversed input', () => {
    const r = resolveRange('custom', now, new Date('2025-03-20T00:00:00+05:00'), new Date('2025-03-18T10:00:00+05:00'))!;
    expect(ymd(r.from)).toBe('2025-03-18'); expect(ymd(r.to)).toBe('2025-03-21');
  });
  it('custom without dates and unknown preset -> null', () => {
    expect(resolveRange('custom', now)).toBeNull();
    expect(resolveRange(undefined, now)).toBeNull();
  });
  it('late-evening UTC is still the next Karachi day', () => {
    const late = new Date('2025-03-12T20:00:00Z'); // 01:00 on 13th Karachi
    expect(ymd(resolveRange('today', late)!.from)).toBe('2025-03-13');
  });
});

describe('searchClause', () => {
  it('order codes and small digit strings -> exact orderNo', () => {
    expect(searchClause('#OD-1001')).toEqual({ orderNo: 1 });
    expect(searchClause('od1012')).toEqual({ orderNo: 12 });
    expect(searchClause('1005')).toEqual({ orderNo: 5 });
    expect(searchClause('7')).toEqual({ orderNo: 7 });
  });
  it('phone-like -> anchored prefix regex, escaped', () => {
    expect(searchClause('0300')).toEqual({ 'customer.phone': { $regex: '^0300' } });
    expect(searchClause('0300 123-45')).toEqual({ 'customer.phone': { $regex: '^030012345' } });
    expect(searchClause('+92300')).toEqual({ 'customer.phone': { $regex: '^\\+92300' } });
  });
  it('text otherwise is an escaped, case-insensitive contains-search; empty -> null', () => {
    const c = searchClause('Red velvet') as { $or: Array<Record<string, unknown>> };
    expect(c.$or[0]).toEqual({ cake: { $regex: 'Red velvet', $options: 'i' } });
    expect(c.$or.map(x => Object.keys(x)[0])).toEqual(['cake', 'customer.name', 'location', 'addons', 'details', 'notes']);
    expect(searchClause('   ')).toBeNull();
    expect(JSON.stringify(searchClause('.*'))).toContain('\\\\.\\\\*');
  });
});

describe('buildOrderFilter', () => {
  it('always excludes deleted', () => {
    expect(and(buildOrderFilter({}, now))).toEqual([{ isDeleted: false }]);
  });
  it('status clauses', () => {
    expect(and(buildOrderFilter({ status: 'pending' }, now))).toContainEqual({ status: 'pending' });
    expect(and(buildOrderFilter({ status: 'ready' }, now))).toContainEqual({ status: 'ready' });
    expect(and(buildOrderFilter({ status: 'delivered' }, now))).toContainEqual({ status: 'delivered' });
    expect(and(buildOrderFilter({ status: 'all' }, now))).toHaveLength(1);
  });
  it('excludeStatus drops only the status clause (chips counts)', () => {
    const f = buildOrderFilter({ status: 'ready', location: 'DHA', range: 'today' }, now, { excludeStatus: true });
    expect(and(f)).toHaveLength(3);
    expect(JSON.stringify(f)).not.toContain('ready');
  });
  it('combines location, range and search', () => {
    const a = and(buildOrderFilter({ location: 'DHA', range: 'week', q: '0300' }, now));
    expect(a).toContainEqual({ location: { $regex: '^DHA$', $options: 'i' } });
    expect(a).toContainEqual({ scheduledAt: { $gte: resolveRange('week', now)!.from, $lt: resolveRange('week', now)!.to } });
    expect(a).toContainEqual({ 'customer.phone': { $regex: '^0300' } });
  });
  it('is pure: same input, same output', () => {
    const q = { status: 'pending', range: 'today', q: 'ali' } as const;
    expect(buildOrderFilter(q, now)).toEqual(buildOrderFilter(q, now));
  });
});

describe('buildSort', () => {
  it('adds _id tie-break in the same direction', () => {
    expect(buildSort('-scheduledAt')).toEqual({ scheduledAt: -1, _id: -1 });
    expect(buildSort('price')).toEqual({ price: 1, _id: 1 });
  });
});
