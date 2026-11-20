import { NO_LOCATION, type OrderQuery } from '@order-desk/shared';
import { addDays, startOfDay, startOfMonth, startOfWeek } from '../../utils/time';

export type Range = { from: Date; to: Date };

/**
 * Resolve a range preset to a half-open [from, to) window in Asia/Karachi. Pure.
 * custom: from/to are interpreted as Karachi calendar days, both inclusive (swapped if reversed).
 */
export function resolveRange(range: string | undefined, now: Date, from?: Date, to?: Date): Range | null {
  const today = startOfDay(now);
  switch (range) {
    case 'today': return { from: today, to: addDays(today, 1) };
    case 'tomorrow': return { from: addDays(today, 1), to: addDays(today, 2) };
    case 'week': { const w = startOfWeek(now); return { from: w, to: addDays(w, 7) }; }
    case 'nextweek': { const w = addDays(startOfWeek(now), 7); return { from: w, to: addDays(w, 7) }; }
    case 'month': return { from: startOfMonth(now), to: startOfMonth(now, 1) };
    case 'lastmonth': return { from: startOfMonth(now, -1), to: startOfMonth(now) };
    case 'custom': {
      if (!from || !to) return null;
      let a = startOfDay(from); let b = startOfDay(to);
      if (a > b) [a, b] = [b, a];
      return { from: a, to: addDays(b, 1) };
    }
    default: return null;
  }
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Search rules:
 *  - "#OD-1001" / "OD1001" or pure digits not starting with 0 and up to 6 long -> exact orderNo
 *    (digits > 1000 are read as the display code, so 1001 -> orderNo 1; digits <= 1000 as the orderNo itself)
 *  - phone-like (digits/+/space/-/()), starts with 0 or + or has 7+ digits -> anchored prefix regex on customer.phone
 *    (phones are stored normalised without spaces/dashes)
 *  - anything else -> case-insensitive "contains" over cake, customer name, location, add-ons and details
 *    (the query is regex-escaped and capped at 100 chars by the schema)
 */
export function searchClause(raw: string): Record<string, unknown> | null {
  const q = raw.trim();
  if (!q) return null;
  const code = /^#?\s*OD[-\s]?(\d{1,7})$/i.exec(q);
  if (code) return { orderNo: Math.max(0, Number(code[1]) - 1000) };
  const compact = q.replace(/[\s\-()]/g, '');
  if (/^\d{1,6}$/.test(q) && !q.startsWith('0')) {
    const n = Number(q);
    return { orderNo: n > 1000 ? n - 1000 : n };
  }
  if (/^\+?\d+$/.test(compact) && (compact.startsWith('0') || compact.startsWith('+') || compact.length >= 7)) {
    return { 'customer.phone': { $regex: `^${escapeRegex(compact)}` } };
  }
  const re = { $regex: escapeRegex(q), $options: 'i' };
  return { $or: [{ cake: re }, { 'customer.name': re }, { location: re }, { addons: re }, { details: re }, { notes: re }] };
}

export interface FilterOpts { excludeStatus?: boolean }

/** Pure: builds the Mongo filter for the orders list / counts. */
export function buildOrderFilter(q: Partial<OrderQuery>, now: Date, opts: FilterOpts = {}): { $and: Record<string, unknown>[] } {
  const and: Record<string, unknown>[] = [{ isDeleted: false }];
  if (q.location === NO_LOCATION) and.push({ $or: [{ location: '' }, { location: { $exists: false } }] });
  else if (q.location) and.push({ location: { $regex: `^${escapeRegex(q.location)}$`, $options: 'i' } });
  if (!opts.excludeStatus && q.status && q.status !== 'all') and.push({ status: q.status });
  const r = resolveRange(q.range, now, q.from, q.to);
  if (r) and.push({ scheduledAt: { $gte: r.from, $lt: r.to } });
  if (q.q) { const s = searchClause(q.q); if (s) and.push(s); }
  return { $and: and };
}

/** '-scheduledAt' -> { scheduledAt: -1, _id: -1 } (tie-break keeps pages stable) */
export function buildSort(sort: string): Record<string, 1 | -1> {
  const dir = sort.startsWith('-') ? -1 : 1;
  const field = sort.replace(/^-/, '');
  return { [field]: dir, _id: dir } as Record<string, 1 | -1>;
}
