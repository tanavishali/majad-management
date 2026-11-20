import { Link } from 'react-router-dom';
import { OrderCard } from '../../components/OrderCard';
import { isoToKarachi, money } from '../../lib/format';
import { useOverview } from './api';

export default function DashboardPage() {
  const q = useOverview();
  const d = q.data;
  const h = Number(isoToKarachi(new Date().toISOString()).time.slice(0, 2));
  return (
    <>
      <h1 className="pt">{h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'}, Blusher Cakes 🎂</h1>
      <p className="sub">Welcome back, @blushercakes. Here is your bakery at a glance.</p>
      {q.isError ? (
        <div className="empty" role="alert"><div>⚠️</div>Could not load the dashboard. <button type="button" className="link" onClick={() => void q.refetch()}>Try again</button></div>
      ) : (
        <>
          <div className="stats" data-testid="stats">
            <div className="stat"><span>Today’s cakes</span><b data-testid="s-today">{d ? d.todayCount : '–'}</b></div>
            <div className="stat"><span>Upcoming</span><b data-testid="s-upcoming">{d ? d.upcoming : '–'}</b></div>
            <div className="stat"><span>Balance to collect</span><b data-testid="s-balance">{d ? money(d.balance) : '–'}</b></div>
            <div className="stat"><span>Total sales</span><b data-testid="s-sales">{d ? money(d.totalSales) : '–'}</b></div>
          </div>
          <div className="stat" style={{ marginTop: 10 }}><span>Total profit</span><b data-testid="s-profit">{d ? money(d.totalProfit) : '–'}</b></div>
          <h2>Up next</h2>
          <div className="grid" data-testid="up-next">
            {d && d.upNext.length === 0
              ? <div className="empty"><div>🧁</div>Nothing booked. Add your next cake.</div>
              : d?.upNext.map((o) => <OrderCard key={o.id} o={o} />)}
          </div>
        </>
      )}
      <Link className="btn" to="/new" style={{ maxWidth: 260 }}>+ New order</Link>
    </>
  );
}
