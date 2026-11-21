import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { DEFAULT_ADDONS, DEFAULT_FLAVOURS, DEFAULT_LOCATIONS, type OrderDTO, type SlotCheck } from '@order-desk/shared';
import { Dialog } from '../../components/Dialog';
import { PhotoPicker, type PhotoItem } from '../../components/PhotoPicker';
import { useToast } from '../../app/toast';
import { apiError } from '../../lib/errors';
import { imageUrl, thumbUrl } from '../../lib/files';
import { addClockMinutes, cap, fmtClock, fmtDayShortStr, isoToKarachi, karachiToIso, money, todayKarachi } from '../../lib/format';
import { invalidateOrderData } from '../../lib/queryClient';
import { useLists } from '../settings/api';
import { createOrder, updateOrder, uploadFiles, type OrderPayload } from './api';
import { useOrder } from './hooks';

interface Form {
  flavour: string | null; cake: string; addons: string[]; balloonColor: 'white' | 'black' | 'red' | ''; cust: string; phone: string; source: OrderPayload['source']; loc: string;
  date: string; time: string; lbs: string; price: string; advance: string; profit: string; details: string;
}

/** Next 5-minute step after now (Karachi); mornings start at 9 once the day is over. */
function suggestedTime() {
  const { time } = isoToKarachi(new Date(Date.now() + 60_000).toISOString());
  const [h, m] = time.split(':').map(Number);
  let mins = Math.ceil((h * 60 + m) / 5) * 5;
  if (mins >= 1440) mins = 540;
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}
const SOURCES = ['whatsapp', 'instagram', 'facebook'] as const;
const SOURCE_LABEL: Record<string, string> = { whatsapp: '\u{1F4AC} WhatsApp', instagram: '\u{1F4F8} Instagram', facebook: '\u{1F4D8} Facebook' };
const blank = (date = todayKarachi(), time = suggestedTime()): Form => ({
  flavour: null, cake: '', addons: [], balloonColor: '', cust: '', phone: '', source: '', loc: '', date, time, lbs: '2', price: '', advance: '', profit: '', details: '',
});
const fromOrder = (o: OrderDTO): Form => {
  const { date, time } = isoToKarachi(o.scheduledAt);
  return {
    flavour: null, cake: o.cake, addons: o.addons.flatMap(a => a.trim().toLowerCase() === 'balloon bouquet' ? ['Balloon', 'Bouquet'] : [a]),
    balloonColor: o.balloonColor ?? '', cust: o.customer.name, phone: o.customer.phone, source: o.source ?? '', loc: o.location, date, time,
    lbs: String(o.lbs), price: o.price == null ? '' : String(o.price), advance: o.advance ? String(o.advance) : '', profit: o.profit == null ? '' : String(o.profit), details: o.details,
  };
};
const whole = (s: string) => (s.trim() === '' ? null : Math.round(Number(s)));

type Clash = SlotCheck & { at: string };

export default function NewOrderRoute() {
  const { id } = useParams();
  return <OrderForm key={id ?? 'new'} id={id} />;
}

function OrderForm({ id }: { id?: string }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const lists = useLists();
  const existing = useOrder(id);
  const flavours = lists.data?.flavours ?? DEFAULT_FLAVOURS;
  const locations = lists.data?.locations ?? DEFAULT_LOCATIONS;
  const addons = lists.data?.addons ?? DEFAULT_ADDONS;

  const [f, setF] = useState<Form>(() => blank());
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [loaded, setLoaded] = useState(!id);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [clash, setClash] = useState<Clash | null>(null);
  const [added, setAdded] = useState('');
  const hasBalloon = f.addons.some(a => ['balloon', 'balloon bouquet'].includes(a.trim().toLowerCase()));
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    const o = existing.data;
    if (!id || loaded || !o) return;
    setF(fromOrder(o));
    setPhotos((o.images ?? []).map((i) => ({ id: i.key, key: i.key, preview: thumbUrl(i), full: imageUrl(i) })));
    setLoaded(true);
  }, [id, existing.data, loaded]);

  const lbsNum = parseFloat(f.lbs);
  const price = whole(f.price);
  const advance = whole(f.advance) ?? 0;
  const balance = price == null ? null : Math.max(0, price - advance);

  async function submit(opts: { force?: boolean; atIso?: string } = {}) {
    setErr('');
    if (!f.cake.trim()) return setErr('Add the cake name.');
    if (!f.date || !f.time) return setErr('Pick a date and time.');
    if (!(lbsNum > 0)) return setErr('Add the pounds of cake.');
    const at = opts.atIso ?? karachiToIso(f.date, f.time);
    setBusy(true);
    try {
      // upload new pictures once; a retry after a clash reuses the stored keys
      let items = photos;
      const fresh = photos.filter((p) => p.file && !p.key);
      if (fresh.length) {
        const refs = await uploadFiles(fresh.map((p) => p.file!));
        let n = 0;
        items = photos.map((p) => (p.file && !p.key ? { ...p, key: refs[n++].key } : p));
        setPhotos(items);
      }
      const body: OrderPayload = {
        cake: f.cake.trim(), addons: f.addons, balloonColor: hasBalloon && f.balloonColor ? f.balloonColor : null,
        customer: { name: f.cust.trim(), phone: f.phone.trim() }, location: f.loc.trim(), source: f.source,
        scheduledAt: at, lbs: lbsNum, price, advance, profit: whole(f.profit), details: f.details.trim(),
        images: items.map((p) => p.key!), ...(opts.force ? { force: true } : {}),
      };
      if (id) {
        await updateOrder(id, body, existing.data!.version);
        await invalidateOrderData(qc);
        toast('Order updated');
        nav('/orders');
        return;
      }
      const saved = await createOrder(body);
      await invalidateOrderData(qc);
      const { time } = isoToKarachi(saved.scheduledAt);
      const next = blank(f.date, addClockMinutes(time, 30));
      setF(next);
      setPhotos([]);
      setAdded(`✅ Order added at ${fmtClock(time)}`);
      setTimeout(() => setAdded(''), 3500);
    } catch (e) {
      const a = apiError(e);
      if (a.status === 409 && a.code === 'SLOT_CONFLICT') setClash({ ...(a.details as SlotCheck), at });
      else if (a.status === 412) setErr('This order was changed somewhere else. Go back to the list and open it again.');
      else setErr(a.message);
    } finally {
      setBusy(false);
    }
  }

  const useNext = () => {
    if (!clash?.nextFree) return;
    const nx = clash.nextFree;
    const k = isoToKarachi(nx);
    setF((p) => ({ ...p, date: k.date, time: k.time }));
    setClash(null);
    void submit({ atIso: nx });
  };
  const toggleAddon = (a: string) => setF((p) => {
    const addons = p.addons.includes(a) ? p.addons.filter((x) => x !== a) : [...p.addons, a];
    const stillHasBalloon = addons.some(x => ['balloon', 'balloon bouquet'].includes(x.trim().toLowerCase()));
    return { ...p, addons, balloonColor: stillHasBalloon ? p.balloonColor : '' };
  });

  if (id && !loaded) {
    return <div data-testid="order-loading">{existing.isError ? <div className="empty"><div>🧁</div>Could not load this order.</div> : <p className="sub">Loading…</p>}</div>;
  }

  return (
    <>
      <h1 className="pt">{id ? 'Edit order' : 'New order'}</h1>
      <div className="pos">
        <section className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ marginTop: 0 }}>Cake flavour</label>
            <Link to="/settings/flavours" style={{ fontSize: '.8rem', color: 'var(--deep)', fontWeight: 800 }}>+ Edit flavours</Link>
          </div>
          <div className="chips" data-testid="flavours">
            {[...flavours, 'Custom'].map((fl) => (
              <button key={fl} type="button" className={`chip${f.flavour === fl ? ' on' : ''}`}
                onClick={() => setF((p) => ({ ...p, flavour: fl, cake: fl === 'Custom' ? '' : `${fl} cake` }))}>{fl}</button>
            ))}
          </div>
          <label htmlFor="cake">Cake name</label>
          <input id="cake" data-testid="cake" placeholder="e.g. Red velvet birthday cake" autoComplete="off" value={f.cake} onChange={(e) => set('cake', e.target.value)} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label>Add-ons <em>(optional)</em></label>
            <Link to="/settings/addons" style={{ fontSize: '.8rem', color: 'var(--deep)', fontWeight: 800 }}>+ Edit add-ons</Link>
          </div>
          <div className="chips" data-testid="addons">
            {addons.map((a) => (
              <button key={a} type="button" className={`chip addon${f.addons.includes(a) ? ' on' : ''}`} onClick={() => toggleAddon(a)}>{a}</button>
            ))}
          </div>
          {hasBalloon && (
            <div>
              <label htmlFor="balloon-color">Balloon color <em>(optional)</em></label>
              <select id="balloon-color" data-testid="balloon-color" value={f.balloonColor} onChange={(e) => {
                const value = e.target.value;
                set('balloonColor', value === 'white' || value === 'black' || value === 'red' ? value : '');
              }}>
                <option value="">No color selected</option>
                <option value="white">White</option>
                <option value="black">Black</option>
                <option value="red">Red</option>
              </select>
            </div>
          )}

          <div className="two">
            <div><label htmlFor="cust">Customer <em>(opt.)</em></label><input id="cust" data-testid="cust" autoComplete="off" value={f.cust} onChange={(e) => set('cust', e.target.value)} /></div>
            <div><label htmlFor="phone">Phone <em>(opt.)</em></label><input id="phone" data-testid="phone" type="tel" inputMode="tel" placeholder="03xx xxxxxxx" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></div>
          </div>

          <label>Ordered via <em>(opt.)</em></label>
          <div className="chips" data-testid="sources">
            {SOURCES.map((s) => (
              <button key={s} type="button" data-testid={`source-${s}`} className={`chip${f.source === s ? ' on' : ''}`}
                onClick={() => set('source', f.source === s ? '' : s)}>{SOURCE_LABEL[s]}</button>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label htmlFor="loc">Location / Area <em>(opt.)</em></label>
            <Link to="/settings/areas" style={{ fontSize: '.8rem', color: 'var(--deep)', fontWeight: 800 }}>+ Edit areas</Link>
          </div>
          <div className="chips" data-testid="areas">
            {locations.map((l) => (
              <button key={l} type="button" className={`chip${f.loc.trim().toLowerCase() === l.toLowerCase() ? ' on' : ''}`}
                onClick={() => set('loc', f.loc.trim().toLowerCase() === l.toLowerCase() ? '' : l)}>{l}</button>
            ))}
          </div>
          <input id="loc" data-testid="loc" placeholder="e.g. Johar Town, DHA, Bahria Town, Gulberg…" autoComplete="off" value={f.loc} onChange={(e) => set('loc', e.target.value)} />

          <div className="two">
            <div><label htmlFor="date">Date</label><input id="date" data-testid="date" type="date" value={f.date} onChange={(e) => set('date', e.target.value)} /></div>
            <div><label htmlFor="time">Time</label><input id="time" data-testid="time" type="time" step={300} value={f.time} onChange={(e) => set('time', e.target.value)} /></div>
          </div>
          <label htmlFor="lbs">Pounds of cake</label>
          <div className="step">
            <button type="button" aria-label="Half a pound less" data-testid="lbs-minus" onClick={() => set('lbs', String(Math.max(0.5, (parseFloat(f.lbs) || 1) - 0.5)))}>−</button>
            <input id="lbs" data-testid="lbs" type="number" inputMode="decimal" min="0.5" step="0.5" value={f.lbs} onChange={(e) => set('lbs', e.target.value)} />
            <button type="button" aria-label="Half a pound more" data-testid="lbs-plus" onClick={() => set('lbs', String((parseFloat(f.lbs) || 0) + 0.5))}>+</button>
          </div>
          <div className="two">
            <div><label htmlFor="price">Price <em>(opt.)</em></label><input id="price" data-testid="price" type="number" inputMode="numeric" min="0" placeholder="Rs" value={f.price} onChange={(e) => set('price', e.target.value)} /></div>
            <div><label htmlFor="advance">Advance paid <em>(opt.)</em></label><input id="advance" data-testid="advance" type="number" inputMode="numeric" min="0" placeholder="Rs" value={f.advance} onChange={(e) => set('advance', e.target.value)} /></div>
          </div>
          <label htmlFor="profit">Profit <em>(optional)</em></label>
          <input id="profit" data-testid="profit" type="number" inputMode="numeric" placeholder="Rs" value={f.profit} onChange={(e) => set('profit', e.target.value)} />

          <label>Reference pictures <em>(optional · camera or gallery)</em></label>
          <PhotoPicker items={photos} onChange={setPhotos} title={f.cake.trim() || 'Reference pictures'} />

          <label htmlFor="details">Details <em>(optional)</em></label>
          <textarea id="details" data-testid="details" placeholder="Message on cake, design, exact street address…" value={f.details} onChange={(e) => set('details', e.target.value)} />
        </section>

        <aside className="ticket">
          <h3>Order ticket</h3>
          <div>{added && <div className="toast" data-testid="added">{added}</div>}</div>
          {([
            ['Cake', f.cake.trim() || '–'],
            ['Add-ons', f.addons.length ? f.addons.map(a => a.toLowerCase() === 'balloon' && f.balloonColor ? `${a} (${cap(f.balloonColor)})` : a).join(', ') : '–'],
            ['Customer', f.cust.trim() || '–'],
            ['Ordered via', f.source ? SOURCE_LABEL[f.source] : '–'],
            ['Location', f.loc.trim() || '–'],
            ['When', f.date && f.time ? `${fmtDayShortStr(f.date)}, ${fmtClock(f.time)}` : '–'],
            ['Weight', f.lbs ? `${f.lbs} lb` : '–'],
            ['Advance', advance ? money(advance) : '–'],
            ['Profit', f.profit !== '' ? money(whole(f.profit)) : '–'],
          ] as const).map(([k, v]) => <div className="line" key={k}><span>{k}</span><b data-testid={`t-${k.toLowerCase()}`}>{v}</b></div>)}
          <div className="total"><span>Balance</span><b data-testid="t-balance">{balance == null ? '–' : money(balance)}</b></div>
          {photos.length > 0 && (
            <div className="ticket-ref">
              <div style={{ fontSize: '.78rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 4 }}>🖼️ {photos.length} picture{photos.length > 1 ? 's' : ''} attached</div>
              <div className="strip">{photos.map((p) => <img key={p.id} src={p.preview} alt="" />)}</div>
            </div>
          )}
          <div className={`err${err ? ' show' : ''}`} role="alert" data-testid="form-error">{err}</div>
          <button className="btn" type="button" data-testid="save" disabled={busy} onClick={() => void submit()}>
            {busy ? 'Saving…' : id ? 'Save changes' : 'Add order'}
          </button>
          {id && <button className="btn ghost" type="button" data-testid="cancel-edit" onClick={() => nav('/orders')}>Cancel edit</button>}
        </aside>
      </div>

      {clash && <ClashDialog clash={clash} editing={!!id} onClose={() => setClash(null)} onNext={useNext}
        onAnyway={() => { const at = clash.at; setClash(null); void submit({ force: true, atIso: at }); }} />}
    </>
  );
}

function ClashDialog({ clash, editing, onClose, onNext, onAnyway }: { clash: Clash; editing: boolean; onClose: () => void; onNext: () => void; onAnyway: () => void }) {
  const verb = editing ? 'Save' : 'Add';
  const one = clash.conflicts.length === 1 ? clash.conflicts[0] : null;
  const atTime = fmtClock(isoToKarachi(clash.at).time);
  return (
    <Dialog onClose={onClose} label="Time clash" testId="clash-dialog">
      <div style={{ fontSize: '2.4rem' }}>{one ? '⏰' : '⚠️'}</div>
      <h3>{one ? 'Order already in this slot' : `You already have ${clash.conflicts.length} orders in this slot`}</h3>
      {one ? (
        <p>You already have <b>{one.cake}</b>{one.customer.name && <> for <b>{one.customer.name}</b></>} at <b>{fmtClock(isoToKarachi(one.scheduledAt).time)}</b>. Each cake usually needs 30 minutes.</p>
      ) : (
        <>
          <p>These orders are already booked around <b>{atTime}</b>:</p>
          <div className="clash-list">
            {clash.conflicts.map((c) => (
              <div className="clash-item" key={c.orderNo}><span><b>{c.cake}</b>{c.customer.name && ` (${c.customer.name})`}</span><b>{fmtClock(isoToKarachi(c.scheduledAt).time)}</b></div>
            ))}
          </div>
        </>
      )}
      {clash.nextFree ? (
        <>
          <div className="next" data-testid="next-free">Next free slot: {fmtClock(isoToKarachi(clash.nextFree).time)}</div>
          <button className="btn" type="button" data-testid="clash-next" style={{ marginTop: 0 }} onClick={onNext}>{verb} at {fmtClock(isoToKarachi(clash.nextFree).time)}</button>
        </>
      ) : (
        <div className="next bad">No free 30-min slot left on this date.</div>
      )}
      <button className="btn ghost" type="button" data-testid="clash-change" onClick={onClose}>Change time</button>
      <button className="btn warn" type="button" data-testid="clash-anyway" onClick={onAnyway}>{verb} anyway at {atTime}</button>
    </Dialog>
  );
}
