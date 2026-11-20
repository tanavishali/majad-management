import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { OrderDTO } from '@order-desk/shared';
import { getOrder } from '../features/orders/api';
import { useToast } from '../app/toast';
import { imageUrl, thumbUrl } from '../lib/files';
import { STATUS_LABEL, money } from '../lib/format';
import { downloadReceipt, receiptRows } from '../lib/receipt';
import { Dialog } from './Dialog';
import { Lightbox } from './Lightbox';

/** Read-only "view order" sheet: every detail, all pictures, and the receipt download. */
export function OrderView({ o, onClose, onEdit, waHref }: { o: OrderDTO; onClose: () => void; onEdit: () => void; waHref?: string }) {
  const toast = useToast();
  const [zoom, setZoom] = useState(false);
  const detail = useQuery({ queryKey: ['order', o.id], queryFn: () => getOrder(o.id) });
  const images = detail.data?.images ?? [];

  async function receipt() {
    const ok = await downloadReceipt(detail.data ?? o).catch(() => false);
    toast(ok ? 'Receipt downloaded' : 'Could not create the receipt on this device', ok ? undefined : 'error');
  }

  return (
    <Dialog onClose={onClose} wide label={`Order ${o.code}`} testId="order-view-dialog">
      <h3 className="ok">{o.code} · {o.cake}</h3>
      <span className={`tag ${o.status}`} data-testid="view-status">{STATUS_LABEL[o.status]}</span>

      <dl className="vrows">
        {receiptRows(o).filter(([k]) => k !== 'Order' && k !== 'Cake').map(([k, v]) => (
          <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
        ))}
        <div><dt>Total</dt><dd>{o.price == null ? 'To be confirmed' : money(o.price)}</dd></div>
        <div><dt>Advance</dt><dd>{money(o.advance)}</dd></div>
        <div className="due"><dt>Balance</dt><dd data-testid="view-balance">{o.price == null ? '–' : money(o.balance)}</dd></div>
        {o.profit != null && <div><dt>Profit</dt><dd>{money(o.profit)}</dd></div>}
      </dl>
      {o.details && <p className="note" style={{ textAlign: 'left' }}>{o.details}</p>}

      {o.imageCount > 0 && (
        <div className="vphotos" data-testid="view-photos">
          {detail.isLoading ? <small>Loading pictures…</small> : images.map((i) => (
            <button key={i.key} type="button" aria-label="View picture larger" onClick={() => setZoom(true)}><img src={thumbUrl(i)} alt="Reference cake" loading="lazy" /></button>
          ))}
        </div>
      )}

      <div className="acts" style={{ justifyContent: 'center' }}>
        <button type="button" data-testid="view-receipt" onClick={() => void receipt()}>🧾 Receipt</button>
        {waHref && <a href={waHref} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
        <button type="button" data-testid="view-edit" onClick={onEdit}>Edit</button>
        <button type="button" data-testid="view-close" onClick={onClose}>Close</button>
      </div>
      {zoom && <Lightbox title={o.cake} images={images.map((i) => ({ src: imageUrl(i), thumb: thumbUrl(i) }))} onClose={() => setZoom(false)} />}
    </Dialog>
  );
}
