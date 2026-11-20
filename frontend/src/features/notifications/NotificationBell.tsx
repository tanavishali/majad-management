import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { NOTIFY_BEFORE_MINUTES } from '@order-desk/shared';
import { useToast } from '../../app/toast';
import { fmtTime, money } from '../../lib/format';
import { desktopPermission, dueLabel, loadSeen, minutesAway, pickFresh, saveSeen, showDesktopNotification } from './reminders';
import { useUpcoming } from './useUpcoming';

/** Header bell: badge + list of orders due within 45 minutes; fires a desktop notification and a toast once per order. */
export function NotificationBell() {
  const { data } = useUpcoming();
  const nav = useNavigate();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [perm, setPerm] = useState(desktopPermission());
  const [now, setNow] = useState(() => Date.now());
  const box = useRef<HTMLDivElement>(null);
  const orders = data?.data ?? [];
  const count = orders.length;
  const openOrder = useCallback((id: string) => nav(`/edit/${id}`), [nav]);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);

  // Announce each newly due order exactly once (remembered in localStorage, so a reload does not repeat it).
  useEffect(() => {
    if (!data) return;
    const t = Date.now();
    const { fresh, next } = pickFresh(data.data, loadSeen(), t);
    saveSeen(next);
    if (!fresh.length) return;
    fresh.forEach((o) => showDesktopNotification(o, t, () => openOrder(o.id)));
    toast(fresh.length === 1
      ? `${fresh[0].code} - ${fresh[0].cake} is due ${dueLabel(minutesAway(fresh[0].scheduledAt, t))}`
      : `${fresh.length} orders are due within ${NOTIFY_BEFORE_MINUTES} minutes`);
  }, [data, openOrder, toast]);

  // Tab title shows the count, e.g. "(2) Blusher Cakes · POS"
  useEffect(() => {
    const base = 'Blusher Cakes · POS';
    document.title = count ? `(${count}) ${base}` : base;
    return () => { document.title = base; };
  }, [count]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const enable = useCallback(() => { void Notification.requestPermission().then((p) => setPerm(p)); }, []);

  return (
    <div className="bellbox" ref={box}>
      <button
        type="button" className="ib bell" data-testid="notif-bell" aria-expanded={open}
        aria-label={count ? `Notifications: ${count} order${count > 1 ? 's' : ''} due soon` : 'Notifications'}
        title={`Orders due in the next ${NOTIFY_BEFORE_MINUTES} minutes`}
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden="true">🔔</span>
        {count > 0 && <span className="dot" data-testid="notif-badge">{count}</span>}
      </button>
      {open && (
        <div role="dialog" aria-label="Upcoming orders" data-testid="notif-panel" className="bellpanel">
          <h2>Due in the next {NOTIFY_BEFORE_MINUTES} minutes</h2>
          {count === 0 ? (
            <p className="small" data-testid="notif-empty">No upcoming orders right now. You will be alerted {NOTIFY_BEFORE_MINUTES} minutes before each order.</p>
          ) : (
            <ul>
              {orders.map((o) => (
                <li key={o.id}>
                  <button type="button" data-testid={`notif-item-${o.id}`} onClick={() => { setOpen(false); openOrder(o.id); }}>
                    <span style={{ minWidth: 0 }}>
                      <span className="nm">{o.code} - {o.cake}</span>
                      <span className="mt">{[o.customer.name, fmtTime(o.scheduledAt), o.price != null ? money(o.price) : ''].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className="when">{dueLabel(minutesAway(o.scheduledAt, now))}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {perm === 'default' && <button type="button" className="btn sm" style={{ marginTop: 12, width: '100%' }} data-testid="notif-enable" onClick={enable}>Turn on desktop alerts</button>}
          {perm === 'granted' && <p className="small" data-testid="notif-perm">Desktop alerts are on.</p>}
          {perm === 'denied' && <p className="small" data-testid="notif-perm">Desktop alerts are blocked in this browser. Allow them from the lock icon in the address bar. In-app alerts still work.</p>}
        </div>
      )}
    </div>
  );
}
