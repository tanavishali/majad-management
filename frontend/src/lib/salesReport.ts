import type { SalesSummary } from '@order-desk/shared';
import { fmtDayShortStr, fmtMonthYearStr, fmtShortDStr, money } from './format';

/** "16 Nov – 22 Nov 2026" */
export const rangeLabel = (from: string, to: string) =>
  from === to ? `${fmtShortDStr(from)} ${to.slice(0, 4)}` : `${fmtShortDStr(from)}${from.slice(0, 4) === to.slice(0, 4) ? '' : ` ${from.slice(0, 4)}`} – ${fmtShortDStr(to)} ${to.slice(0, 4)}`;

export const reportTitle = (s: SalesSummary) =>
  s.period === 'm' ? `MONTHLY SALES REPORT · ${fmtMonthYearStr(`${s.month}-01`).toUpperCase()}`
  : s.period === 'w' ? `WEEKLY SALES REPORT · ${rangeLabel(s.from, s.to).toUpperCase()}`
  : `SALES REPORT · ${rangeLabel(s.from, s.to).toUpperCase()}`;

export const salesReportFileName = (s: SalesSummary) =>
  s.period === 'm' ? `sales-report-${s.month}.png` : `sales-report-${s.period === 'w' ? 'week-' : ''}${s.from}${s.to === s.from ? '' : `_to_${s.to}`}.png`;

/** Label/value lines for the totals block of the monthly report. Pure, so it can be tested without a canvas. */
export function reportTotals(s: SalesSummary): Array<[string, string]> {
  return [
    ['Orders', String(s.orders)],
    ['Sales', money(s.sales)],
    ['Profit', money(s.profit)],
    ['Cake sold', `${s.lbs} lb`],
    ['Average per order', money(s.avgPerOrder)],
    ['Average per pound', money(s.avgPerLb)],
    ['Advance received', money(s.advance)],
    ['Balance to collect', money(s.balance)],
  ];
}

/** Draws the month's sales report on a canvas (made on the device, never stored). Null if canvas is unavailable. */
export function drawSalesReport(s: SalesSummary): HTMLCanvasElement | null {
  if (!document.createElement('canvas').getContext?.('2d')) return null;
  const W = 640, PAD = 40, S = 2;
  const sans = '"Nunito", "Segoe UI", Arial, sans-serif';
  const serif = '"Fraunces", Georgia, serif';
  const totals = reportTotals(s);
  const H = 190 + totals.length * 40 + 30 + (s.best.length ? 60 + s.best.length * 36 : 0) + (s.daily.length ? 70 + s.daily.length * 34 : 0) + 110;

  const canvas = document.createElement('canvas');
  canvas.width = W * S; canvas.height = H * S;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(S, S);

  const row = (y: number, left: string, right: string, opts: { bold?: boolean; color?: string; size?: number } = {}) => {
    ctx.font = `${opts.bold ? 800 : 700} ${opts.size ?? 21}px ${sans}`;
    ctx.fillStyle = opts.color ?? '#2b1620';
    ctx.textAlign = 'left'; ctx.fillText(left, PAD, y);
    ctx.textAlign = 'right'; ctx.fillText(right, W - PAD, y);
    ctx.textAlign = 'left';
  };
  const rule = (y: number) => { ctx.strokeStyle = '#f3c9d8'; ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke(); ctx.setLineDash([]); };
  const heading = (y: number, text: string) => { ctx.fillStyle = '#c2255c'; ctx.font = `700 26px ${serif}`; ctx.textAlign = 'left'; ctx.fillText(text, PAD, y); };

  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ffeaf1'; ctx.fillRect(0, 0, W, 130);
  ctx.fillStyle = '#e8588c'; ctx.fillRect(0, 130, W, 6);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#c2255c'; ctx.font = `700 38px ${serif}`; ctx.fillText('🎂 Blusher Cakes', W / 2, 62);
  ctx.fillStyle = '#7a4a5c'; ctx.font = `700 20px ${sans}`; ctx.fillText(reportTitle(s), W / 2, 102);

  let y = 190;
  totals.forEach(([k, v], i) => {
    row(y, k, v, { bold: i < 3, color: i < 3 ? '#c2255c' : undefined });
    y += 40; rule(y - 26);
  });

  if (s.best.length) {
    y += 40; heading(y, 'Best sellers'); y += 14;
    for (const b of s.best) { y += 36; row(y, b.name, `${b.count} order${b.count === 1 ? '' : 's'}`, { size: 20 }); }
  }
  if (s.daily.length) {
    y += 56; heading(y, 'Day by day'); y += 14;
    for (const d of s.daily) { y += 34; row(y, `${fmtDayShortStr(d.date)}  ·  ${d.orders} order${d.orders === 1 ? '' : 's'}`, money(d.sales), { size: 19 }); }
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = '#8a6475'; ctx.font = `600 17px ${sans}`; ctx.fillText('Cancelled orders are not counted · Instagram @blushercakes', W / 2, H - 36);
  return canvas;
}

/** Saves the report picture to the device. Returns false when it could not be made. */
export async function downloadSalesReport(s: SalesSummary): Promise<boolean> {
  const canvas = drawSalesReport(s);
  if (!canvas) return false;
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
  if (!blob) return false;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = salesReportFileName(s);
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}
