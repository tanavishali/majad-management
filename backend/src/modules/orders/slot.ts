import { SLOT_GAP_MINUTES, type SlotConflict } from '@order-desk/shared';

const GAP_MS = SLOT_GAP_MINUTES * 60_000;

/** Open interval (t-30m, t+30m): an order exactly 30 minutes away is allowed. */
export function slotWindow(t: Date): { from: Date; to: Date } {
  return { from: new Date(t.getTime() - GAP_MS), to: new Date(t.getTime() + GAP_MS) };
}
/** Pure mirror of the DB query, used for tests and docs. */
export function tooClose(a: Date, b: Date): boolean {
  return Math.abs(a.getTime() - b.getTime()) < GAP_MS;
}
export function orderCode(orderNo: number): string { return `#OD-${1000 + orderNo}`; }

/**
 * First time at or after `t` that is at least SLOT_GAP_MINUTES away from every order in `taken`,
 * rounded up to a 5 minute step. Returns null when that would roll past the end of `t`'s day
 * (`dayEnd` is the exclusive end instant). Pure.
 */
export function nextFreeSlot(t: Date, taken: Date[], dayEnd: Date): Date | null {
  let c = t.getTime();
  let moved = true;
  while (moved) {
    moved = false;
    for (const o of taken) {
      if (Math.abs(o.getTime() - c) < GAP_MS) { c = o.getTime() + GAP_MS; moved = true; }
    }
  }
  const step = 5 * 60_000;
  c = Math.ceil(c / step) * step;
  return c < dayEnd.getTime() ? new Date(c) : null;
}

export function toSlotConflict(o: { orderNo: number; cake?: string | null; customer?: { name?: string | null } | null; scheduledAt: Date }): SlotConflict {
  return { orderNo: o.orderNo, code: orderCode(o.orderNo), cake: o.cake ?? 'Cake order', customer: { name: o.customer?.name ?? '' }, scheduledAt: o.scheduledAt.toISOString() };
}
