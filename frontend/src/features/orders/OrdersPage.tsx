import { useEffect, useMemo, useState } from 'react';
import { NO_LOCATION, type OrderDTO } from '@order-desk/shared';
import { OrderCard } from '../../components/OrderCard';
import { fmtDayShortStr, karachiDateOf, todayKarachi } from '../../lib/format';
import { useDebounced } from '../../lib/useDebounced';
import { useLists } from '../settings/api';
import type { StatusFilter } from './api';
import { useOrders } from './hooks';

const PAGE_SIZES = [10, 20, 40, 100];

/** 1 … 4 5 [6] 7 8 … 20 */
export function pageList(page: number, pages: number): Array<number | '…'> {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const out: Array<number | '…'> = [1];
  const from = Math.max(2, page - 1), to = Math.min(pages - 1, page + 1);
  if (from > 2) out.push('…');
  for (let p = from; p <= to; p++) out.push(p);
  if (to < pages - 1) out.push('…');
  out.push(pages);
  return out;
}
const CHIPS: Array<[StatusFilter, string]> = [['all', 'All'], ['pending', 'Pending'], ['ready', 'Ready'], ['delivered', 'Delivered']];

/** "Today's orders" (mode today) and "All orders" share this screen. */
export default function OrdersPage({ mode }: { mode: 'today' | 'all' }) {
  const [q, setQ] = useState('');
  const [loc, setLoc] = useState('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const dq = useDebounced(q, 300);
  const lists = useLists();
  useEffect(() => setPage(1), [dq, loc, status, mode, size]);

  const orders = useOrders({
    status, location: loc === 'all' ? undefined : loc, range: mode === 'today' ? 'today' : undefined, q: dq || undefined, sort: 'scheduledAt', page, limit: size,
  });
  const rows = orders.data?.data ?? [];
  const counts = orders.data?.counts;
  const pages = orders.data?.meta.pages ?? 1;
  const total = orders.data?.meta.total ?? 0;
  const first = total ? (page - 1) * size + 1 : 0;
  const last = Math.min(total, page * size);

  const locOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const l of [...(lists.data?.locations ?? []), ...rows.map((o) => o.location).filter(Boolean)]) {
      if (!seen.has(l.toLowerCase())) { seen.add(l.toLowerCase()); out.push(l); }
    }
    return out;
  }, [lists.data, rows]);

  const groups = useMemo(() => {
    const m = new Map<string, OrderDTO[]>();
    for (const o of rows) { const d = karachiDateOf(o.scheduledAt); m.set(d, [...(m.get(d) ?? []), o]); }
    return [...m.entries()];
  }, [rows]);
  const today = todayKarachi();

  return (
    <>
      <h1 className="pt">{mode === 'today' ? 'Today’s orders' : 'All orders'}</h1>
      <div className="tools">
        <div className="filter-row">
          <input type="search" data-testid="search" aria-label="Search orders" placeholder="Search cake, customer, phone, area or add-ons" value={q} onChange={(e) => setQ(e.target.value)} />
          <select aria-label="Filter by location" data-testid="loc-filter" value={loc} onChange={(e) => setLoc(e.target.value)}>
            <option value="all">📍 All locations</option>
            <option value={NO_LOCATION}>No location set</option>
            {locOptions.map((l) => <option key={l} value={l}>📍 {l}</option>)}
          </select>
        </div>
        <div className="chips" data-testid="status-chips">
          {CHIPS.map(([k, label]) => (
            <button key={k} type="button" data-testid={`chip-${k}`} className={`chip${status === k ? ' on' : ''}`} onClick={() => setStatus(k)}>
              {label}{counts && <small>{counts[k]}</small>}
            </button>
          ))}
          {!!counts?.cancelled && (
            <button type="button" data-testid="chip-cancelled" className={`chip${status === 'cancelled' ? ' on' : ''}`} onClick={() => setStatus('cancelled')}>Cancelled<small>{counts.cancelled}</small></button>
          )}
        </div>
      </div>

      <div data-testid="order-list">
        {orders.isError ? (
          <div className="empty" role="alert"><div>⚠️</div>Could not load orders. <button type="button" className="link" onClick={() => void orders.refetch()}>Try again</button></div>
        ) : orders.isLoading ? (
          <p className="sub">Loading…</p>
        ) : groups.length === 0 ? (
          <div className="empty" data-testid="empty"><div>🧁</div>{mode === 'today' ? 'No cakes matching filter today.' : 'No orders found.'}</div>
        ) : (
          groups.map(([day, list]) => (
            <div key={day}>
              <div className="day" data-testid="day-heading">{day === today ? 'Today, ' : ''}{fmtDayShortStr(day)}</div>
              <div className="grid">{list.map((o) => <OrderCard key={o.id} o={o} />)}</div>
            </div>
          ))
        )}
      </div>

      {total > 0 && (
        <div className="pager" data-testid="pager">
          <span className="range" data-testid="range">Showing {first}–{last} of {total}</span>
          <div className="pages" role="navigation" aria-label="Pages">
            <button type="button" className="pg" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page">←</button>
            {pageList(page, pages).map((p, i) => p === '…'
              ? <span key={`e${i}`} className="gap">…</span>
              : <button key={p} type="button" className={`pg${p === page ? ' on' : ''}`} aria-current={p === page ? 'page' : undefined} onClick={() => setPage(p)}>{p}</button>)}
            <button type="button" className="pg" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Next page">→</button>
          </div>
          <label className="psize">Per page
            <select data-testid="page-size" value={size} onChange={(e) => setSize(Number(e.target.value))}>
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
      )}
    </>
  );
}
