import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { OrderDTO } from '@order-desk/shared';
import { getOrder } from '../features/orders/api';
import { nextStatus, useChangeStatus, useDeleteOrder } from '../features/orders/hooks';
import { useToast } from '../app/toast';
import { apiError } from '../lib/errors';
import { fileUrl, imageUrl, thumbUrl } from '../lib/files';
import { STATUS_LABEL, fmtDayShortStr, fmtTime, karachiDateOf, money } from '../lib/format';
import { Lightbox } from './Lightbox';
import { OrderView } from './OrderView';

/** wa.me wants country code + digits: 03xx... -> 923xx... */
export const whatsappNumber = (phone: string) => phone.replace(/\D/g, '').replace(/^0/, '92');

export function OrderCard({ o }: { o: OrderDTO }) {
  const nav = useNavigate();
  const toast = useToast();
  const status = useChangeStatus();
  const remove = useDeleteOrder();
  const [sure, setSure] = useState(false);
  const [gallery, setGallery] = useState(false);
  const [view, setView] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);

  // full-size pictures are only fetched when the gallery is opened
  const detail = useQuery({ queryKey: ['order', o.id], queryFn: () => getOrder(o.id), enabled: gallery });

  const next = nextStatus(o.status);
  const ph = whatsappNumber(o.customer.phone);
  const day = fmtDayShortStr(karachiDateOf(o.scheduledAt));
  const addonTxt = o.addons.length ? ` + ${o.addons.join(', ')}` : '';
  const msg = `Hi ${o.customer.name}! Your ${o.cake} (${o.lbs} lb)${addonTxt} is booked for ${day} at ${fmtTime(o.scheduledAt)}${o.location ? ` (${o.location})` : ''}.${o.balance ? ` Balance: ${money(o.balance)}.` : ''} Thank you, Blusher Cakes 🎂`;

  function askDelete() {
    if (!sure) {
      setSure(true);
      timer.current = setTimeout(() => setSure(false), 3000);
      return;
    }
    remove.mutate(o.id, { onError: (e) => toast(apiError(e).message, 'error') });
  }

  return (
    <div className="order" data-testid={`order-${o.id}`}>
      <div className="top">
        <div className="left-col">
          <div className="time" data-testid="order-time">{fmtTime(o.scheduledAt)}</div>
          {o.coverThumb && (
            <button type="button" className="left-ref" aria-label={`View ${o.imageCount} picture${o.imageCount > 1 ? 's' : ''}`} title="Tap to view larger picture" data-testid="order-photo" onClick={() => setGallery(true)}>
              <img src={fileUrl(o.coverThumb)} alt="Reference cake" loading="lazy" />
              <span>{o.imageCount > 1 ? `🔍 ${o.imageCount}` : '🔍'}</span>
            </button>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h4>{o.cake}</h4>
          {o.customer.name && <span className="tag">👤 {o.customer.name}</span>}
          <span className="tag">{o.lbs} lb</span>
          {o.source && <span className="tag" data-testid="order-source">{{ whatsapp: 'WhatsApp', instagram: 'Instagram', facebook: 'Facebook' }[o.source]}</span>}
          {o.location && <span className="tag loc">📍 {o.location}</span>}
          {o.price != null && <span className="tag">{money(o.price)}</span>}
          {o.balance > 0 && <span className="tag due" data-testid="order-due">Due {money(o.balance)}</span>}
          {o.profit != null && <span className="tag">Profit {money(o.profit)}</span>}
          <span className={`tag ${o.status}`} data-testid="order-status">{STATUS_LABEL[o.status]}</span>
          {o.addons.length > 0 && <div>{o.addons.map((a) => <span key={a} className="tag addon-tag">✨ {a}</span>)}</div>}
          {o.details && <p className="note">{o.details}</p>}
        </div>
      </div>
      <div className="acts">
        <button type="button" data-testid="order-view" onClick={() => setView(true)}>View</button>
        {o.status !== 'delivered' && (
          <button type="button" data-testid="order-mark" disabled={status.isPending} onClick={() => status.mutate({ id: o.id, status: next }, { onError: (e) => toast(apiError(e).message, 'error') })}>
            Mark {STATUS_LABEL[next]}
          </button>
        )}
        <button type="button" data-testid="order-edit" onClick={() => nav(`/edit/${o.id}`)}>Edit</button>
        {ph && <a href={`https://wa.me/${ph}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
        <button type="button" className="del" data-testid="order-delete" onClick={askDelete}>{sure ? 'Sure?' : 'Delete'}</button>
      </div>
      {view && <OrderView o={o} onClose={() => setView(false)} onEdit={() => nav(`/edit/${o.id}`)} waHref={ph ? `https://wa.me/${ph}?text=${encodeURIComponent(msg)}` : undefined} />}
      {gallery && (
        <Lightbox
          title={o.cake}
          images={(detail.data?.images ?? []).map((i) => ({ src: imageUrl(i), thumb: thumbUrl(i) }))}
          onClose={() => setGallery(false)}
        />
      )}
    </div>
  );
}
