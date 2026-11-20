import type { OrderDTO } from '@order-desk/shared';
import { fmtTime, money } from '../../lib/format';

const KEY = 'orderDesk.notified';
const KEEP_MS = 2 * 24 * 3600_000; // purani entries 2 din baad saaf

/** Whole minutes until the order (rounded up, never below 0). */
export const minutesAway = (iso: string, nowMs: number) => Math.max(0, Math.ceil((Date.parse(iso) - nowMs) / 60_000));
export const dueLabel = (m: number) => (m <= 0 ? 'now' : m === 1 ? 'in 1 min' : `in ${m} min`);
/** id + time: if an order is rescheduled it is a new reminder. */
export const reminderKey = (o: Pick<OrderDTO, 'id' | 'scheduledAt'>) => `${o.id}@${o.scheduledAt}`;

/** Pure: which orders have not been announced yet, plus the pruned "seen" map to store. */
export function pickFresh(orders: OrderDTO[], seen: Record<string, number>, nowMs: number) {
  const next: Record<string, number> = {};
  for (const [k, t] of Object.entries(seen)) if (nowMs - t < KEEP_MS) next[k] = t;
  const fresh: OrderDTO[] = [];
  for (const o of orders) {
    const k = reminderKey(o);
    if (next[k] === undefined) { fresh.push(o); next[k] = nowMs; }
  }
  return { fresh, next };
}

export function loadSeen(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') as Record<string, number>; } catch { return {}; }
}
export function saveSeen(m: Record<string, number>) {
  try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* storage full or blocked */ }
}

export const desktopSupported = () => typeof window !== 'undefined' && 'Notification' in window;
export const desktopPermission = (): NotificationPermission | 'unsupported' => (desktopSupported() ? Notification.permission : 'unsupported');

/** Browser (OS-level) notification; silently does nothing unless permission was granted. */
export function showDesktopNotification(o: OrderDTO, nowMs: number, onClick: () => void) {
  if (!desktopSupported() || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(`${o.code} is due ${dueLabel(minutesAway(o.scheduledAt, nowMs))}`, {
      body: [o.cake, o.customer.name, fmtTime(o.scheduledAt), o.price != null ? money(o.price) : ''].filter(Boolean).join(' - '),
      tag: o.id, // same order never stacks twice
    });
    n.onclick = () => { window.focus(); onClick(); n.close(); };
  } catch { /* some browsers only allow notifications via service worker */ }
}
