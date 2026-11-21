import type { OrderDTO } from '@order-desk/shared';
import { STATUS_LABEL, fmtDate, fmtTime, money } from './format';

const SOURCE: Record<string, string> = { whatsapp: 'WhatsApp', instagram: 'Instagram', facebook: 'Facebook' };
const CONTACT = 'tanawishalrai5271@gmail.com';

/** Details included on the thermal receipt. */
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

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[c]!);

/** Build a compact 80mm thermal-printer receipt document. */
export function receiptHtml(o: OrderDTO): string {
  const rows = receiptRows(o).map(([label, value]) =>
    `<div class="row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`,
  ).join('');
  const total = o.price == null ? 'To be confirmed' : money(o.price);
  const balance = o.price == null ? '-' : money(o.balance);
  const details = o.details ? `<section><span>Details</span><p>${escapeHtml(o.details)}</p></section>` : '';

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Receipt ${escapeHtml(o.code)}</title>
<style>
@page{size:80mm auto;margin:3mm}
*{box-sizing:border-box}
body{width:74mm;margin:0 auto;color:#000;font:12px/1.35 Arial,sans-serif}
h1{text-align:center;font-size:20px;margin:0 0 2px}
.subtitle{text-align:center;font-size:11px;margin-bottom:8px}
.rule{border:0;border-top:1px dashed #000;margin:6px 0}
.row{display:flex;justify-content:space-between;gap:4mm;margin:3px 0}
.row span{flex:0 0 27mm}
.row strong{text-align:right;overflow-wrap:anywhere}
.money{font-size:13px;font-weight:bold}
section{margin-top:7px}section p{margin:3px 0;overflow-wrap:anywhere}
footer{text-align:center;margin-top:12px;font-size:10px}
footer strong{display:block;font-size:11px;margin-bottom:2px}
@media print{body{width:74mm}}
</style></head><body>
<h1>Blusher Cakes</h1><div class="subtitle">ORDER RECEIPT</div>
<hr class="rule">${rows}<hr class="rule">
<div class="row"><span>Total</span><strong>${escapeHtml(total)}</strong></div>
<div class="row"><span>Advance paid</span><strong>${escapeHtml(money(o.advance))}</strong></div>
<div class="row money"><span>Balance due</span><strong>${escapeHtml(balance)}</strong></div>
<div class="row"><span>Status</span><strong>${escapeHtml(STATUS_LABEL[o.status] ?? o.status)}</strong></div>
${details}<hr class="rule">
<footer><strong>Thank you for ordering!</strong>Developed by Tech Riyawat<br>${CONTACT}</footer>
</body></html>`;
}

/** Opens a print-ready thermal receipt. Returns false if the browser blocks the print window. */
export function printReceipt(o: OrderDTO): boolean {
  const printWindow = window.open('', '_blank', 'width=420,height=720');
  if (!printWindow) return false;
  printWindow.document.open();
  printWindow.document.write(receiptHtml(o));
  printWindow.document.close();
  setTimeout(() => {
    printWindow.focus();
    printWindow.print();
  }, 250);
  return true;
}
