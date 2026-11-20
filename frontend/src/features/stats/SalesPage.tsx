import { useState } from 'react';
import { useToast } from '../../app/toast';
import { addDays, addMonths, fmtMonthYearStr, mondayOf, money, todayKarachi } from '../../lib/format';
import { downloadSalesReport, rangeLabel } from '../../lib/salesReport';
import { useSales, type Period } from './api';

const PERIODS: Array<[Period, string]> = [['1', 'Today'], ['w', 'Weekly'], ['m', 'Monthly'], ['c', 'Custom']];
const shiftMonth = (month: string, n: number) => addMonths(`${month}-01`, n).slice(0, 7);

export default function SalesPage() {
  const toast = useToast();
  const today = todayKarachi();
  const thisMonth = today.slice(0, 7);
  const thisWeek = mondayOf(today);
  const [period, setPeriod] = useState<Period>('m');
  const [month, setMonth] = useState(thisMonth);
  const [week, setWeek] = useState(thisWeek);           // Monday of the shown week
  const [from, setFrom] = useState(`${thisMonth}-01`);  // custom range
  const [to, setTo] = useState(today);

  const customOk = !!from && !!to && from <= to;
  const q = useSales({ period, month, from: period === 'w' ? week : from, to }, period !== 'c' || customOk);
  const s = q.data;
  const fresh = !!s && s.period === period;
  const max = Math.max(1, ...(s?.last7.map((d) => d.total) ?? [0]));
  const box = (label: string, v: string, id: string) => <div className="stat"><span>{label}</span><b data-testid={id}>{s ? v : '—'}</b></div>;

  async function report() {
    if (!s) return;
    const ok = await downloadSalesReport(s).catch(() => false);
    toast(ok ? 'Report downloaded' : 'Could not create the report on this device', ok ? undefined : 'error');
  }
  const reportBtn = (
    <button type="button" className="btn sm" data-testid="report" disabled={!fresh} onClick={() => void report()}>🧾 Download report</button>
  );

  return (
    <>
      <h1 className="pt">Sales</h1>
      <div className="chips" data-testid="periods">
        {PERIODS.map(([k, label]) => <button key={k} type="button" data-testid={`period-${k}`} className={`chip${period === k ? ' on' : ''}`} onClick={() => setPeriod(k)}>{label}</button>)}
      </div>

      {period === 'w' && (
        <div className="monthbar" data-testid="weekbar">
          <button type="button" className="pg" aria-label="Previous week" data-testid="week-prev" onClick={() => setWeek(addDays(week, -7))}>←</button>
          <b data-testid="week-label">{rangeLabel(week, addDays(week, 6))}</b>
          <button type="button" className="pg" aria-label="Next week" data-testid="week-next" disabled={week >= thisWeek} onClick={() => setWeek(addDays(week, 7))}>→</button>
          {reportBtn}
        </div>
      )}
      {period === 'm' && (
        <div className="monthbar" data-testid="monthbar">
          <button type="button" className="pg" aria-label="Previous month" data-testid="month-prev" onClick={() => setMonth(shiftMonth(month, -1))}>←</button>
          <b data-testid="month-label">{fmtMonthYearStr(`${month}-01`)}</b>
          <button type="button" className="pg" aria-label="Next month" data-testid="month-next" disabled={month >= thisMonth} onClick={() => setMonth(shiftMonth(month, 1))}>→</button>
          {reportBtn}
        </div>
      )}
      {period === 'c' && (
        <div className="monthbar" data-testid="custombar">
          <label className="dfield">From<input type="date" data-testid="custom-from" value={from} max={to || today} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="dfield">To<input type="date" data-testid="custom-to" value={to} min={from || undefined} max={today} onChange={(e) => setTo(e.target.value)} /></label>
          {reportBtn}
          {!customOk && <p className="err show" role="alert" data-testid="custom-error" style={{ flexBasis: '100%', margin: 0 }}>Pick a start date and an end date that is the same or later.</p>}
        </div>
      )}

      {q.isError ? (
        <div className="empty" role="alert"><div>⚠️</div>Could not load sales. <button type="button" className="link" onClick={() => void q.refetch()}>Try again</button></div>
      ) : (
        <>
          <div className="stats">
            {box('Orders', String(s?.orders), 'k-orders')}
            {box('Sales', money(s?.sales), 'k-sales')}
            {box('Profit', money(s?.profit), 'k-profit')}
            {box('Cake sold', `${s?.lbs} lb`, 'k-lbs')}
          </div>
          <div className="stats" style={{ marginTop: 10 }}>
            {box('Avg per order', money(s?.avgPerOrder), 'k-avg-order')}
            {box('Avg per pound', money(s?.avgPerLb), 'k-avg-lb')}
            {box('Advance received', money(s?.advance), 'k-advance')}
            {box('Balance to collect', money(s?.balance), 'k-balance')}
          </div>
          <h2>Last 7 days</h2>
          <div className="card">
            <div className="bars" data-testid="bars">
              {(s?.last7 ?? []).map((d) => (
                <div className="bar" key={d.date} title={`${d.label}: ${money(d.total)}`}><i style={{ height: `${Math.round((d.total / max) * 100)}%` }} />{d.label}</div>
              ))}
            </div>
          </div>
          <h2>Best sellers</h2>
          <div className="card" data-testid="best">
            {s && s.best.length === 0 && 'No orders in this period.'}
            {s?.best.map((b) => <div className="rank" key={b.name}><span>{b.name}</span><span>{b.count}</span></div>)}
          </div>
        </>
      )}
    </>
  );
}
