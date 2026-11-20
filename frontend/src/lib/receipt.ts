import type { OrderDTO } from '@order-desk/shared';
import { STATUS_LABEL, fmtDate, fmtTime, money } from './format';

const SOURCE: Record<string, string> = { whatsapp: 'WhatsApp', instagram: 'Instagram', facebook: 'Facebook' };

/** The lines printed on a receipt. Pure, so it can be tested without a canvas. */
export function receiptRows(o: OrderDTO): Array<[string, string]> {
  const rows: Array<[string, string]> = [
    ['Order', o.code],
    ['Cake', o.cake],
  ];
  if (o.addons.length) rows.push(['Add-ons', o.addons.join(', ')]);
  rows.push(['Weight', `${o.lbs} lb`]);
  if (o.customer.name) rows.push(['Customer', o.customer.name]);
  if (o.customer.phone) rows.push(['Phone', o.customer.phone]);
  if (o.location) rows.push(['Location', o.location]);
  if (o.source) rows.push(['Ordered via', SOURCE[o.source] ?? o.source]);
  rows.push(['Date', fmtDate(o.scheduledAt)], ['Time', fmtTime(o.scheduledAt)]);
  return rows;
}

export const receiptFileName = (o: OrderDTO) => `receipt-${o.code.replace('#', '')}.png`;

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const word of text.split(/\s+/)) {
    const t = cur ? `${cur} ${word}` : word;
    if (cur && ctx.measureText(t).width > maxW) { lines.push(cur); cur = word; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

/**
 * Draws the receipt on a canvas (never stored anywhere: the browser saves it as a PNG
 * on the device). Returns null when canvas drawing is not available.
 */
export function drawReceipt(o: OrderDTO): HTMLCanvasElement | null {
  const probe = document.createElement('canvas').getContext?.('2d');
  if (!probe) return null;

  const W = 640, PAD = 40, S = 2;
  const rows = receiptRows(o);
  const sans = '"Nunito", "Segoe UI", Arial, sans-serif';
  const serif = '"Fraunces", Georgia, serif';

  // measure first so the height fits the content
  probe.font = `700 22px ${sans}`;
  const valueW = W - PAD * 2 - 170;
  const wrapped = rows.map(([k, v]) => [k, wrap(probe, v, valueW)] as const);
  const detailLines = o.details ? (probe.font = `600 20px ${sans}`, wrap(probe, o.details, W - PAD * 2)) : [];
  const rowsH = wrapped.reduce((h, [, ls]) => h + 12 + ls.length * 30, 0);
  const H = 190 + rowsH + 40 + 3 * 44 + 30 + (detailLines.length ? 50 + detailLines.length * 28 : 0) + 120;

  const canvas = document.createElement('canvas');
  canvas.width = W * S; canvas.height = H * S;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(S, S);
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ffeaf1'; ctx.fillRect(0, 0, W, 130);
  ctx.fillStyle = '#e8588c'; ctx.fillRect(0, 130, W, 6);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#c2255c'; ctx.font = `700 40px ${serif}`; ctx.fillText('🎂 Blusher Cakes', W / 2, 66);
  ctx.fillStyle = '#7a4a5c'; ctx.font = `700 20px ${sans}`; ctx.fillText('ORDER RECEIPT', W / 2, 102);

  let y = 190;
  ctx.textAlign = 'left';
  for (const [k, ls] of wrapped) {
    ctx.fillStyle = '#8a6475'; ctx.font = `700 20px ${sans}`; ctx.fillText(k, PAD, y);
    ctx.fillStyle = '#2b1620'; ctx.font = `700 22px ${sans}`;
    ls.forEach((l, i) => { ctx.textAlign = 'right'; ctx.fillText(l, W - PAD, y + i * 30); ctx.textAlign = 'left'; });
    y += ls.length * 30 + 12;
    ctx.strokeStyle = '#f3c9d8'; ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.moveTo(PAD, y - 18); ctx.lineTo(W - PAD, y - 18); ctx.stroke(); ctx.setLineDash([]);
  }

  y += 14;
  const money3: Array<[string, string, boolean]> = [
    ['Total', o.price == null ? 'To be confirmed' : money(o.price), false],
    ['Advance paid', money(o.advance), false],
    ['Balance due', o.price == null ? '-' : money(o.balance), true],
  ];
  for (const [k, v, big] of money3) {
    ctx.fillStyle = big ? '#c2255c' : '#8a6475'; ctx.font = `${big ? 800 : 700} ${big ? 26 : 21}px ${sans}`; ctx.fillText(k, PAD, y);
    ctx.textAlign = 'right'; ctx.fillStyle = big ? '#c2255c' : '#2b1620'; ctx.fillText(v, W - PAD, y); ctx.textAlign = 'left';
    y += 44;
  }
  ctx.fillStyle = '#8a6475'; ctx.font = `700 20px ${sans}`; ctx.fillText('Status', PAD, y - 6);
  ctx.textAlign = 'right'; ctx.fillStyle = '#2b1620'; ctx.fillText(STATUS_LABEL[o.status] ?? o.status, W - PAD, y - 6); ctx.textAlign = 'left';
  y += 24;

  if (detailLines.length) {
    ctx.fillStyle = '#8a6475'; ctx.font = `700 20px ${sans}`; ctx.fillText('Details', PAD, y);
    y += 30;
    ctx.fillStyle = '#2b1620'; ctx.font = `600 20px ${sans}`;
    for (const l of detailLines) { ctx.fillText(l, PAD, y); y += 28; }
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = '#c2255c'; ctx.font = `700 22px ${serif}`; ctx.fillText('Thank you for ordering! 💗', W / 2, H - 62);
  ctx.fillStyle = '#8a6475'; ctx.font = `600 17px ${sans}`; ctx.fillText('Instagram @blushercakes', W / 2, H - 32);
  return canvas;
}

/** Saves the receipt picture to the user's device (e.g. the phone's Downloads/Gallery). Returns false if it could not be made. */
export async function downloadReceipt(o: OrderDTO): Promise<boolean> {
  const canvas = drawReceipt(o);
  if (!canvas) return false;
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
  if (!blob) return false;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = receiptFileName(o);
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}
