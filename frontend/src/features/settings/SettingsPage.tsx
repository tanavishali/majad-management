import { useState } from 'react';
import { DEFAULT_ADDONS, DEFAULT_FLAVOURS, DEFAULT_LOCATIONS, type Lists } from '@order-desk/shared';
import { useToast } from '../../app/toast';
import { apiError } from '../../lib/errors';
import { useLists, useSaveLists, type ListKey } from './api';

const SECTIONS: Array<{ id: ListKey; title: string; desc: string; placeholder: string }> = [
  { id: 'flavours', title: '🎂 Cake Flavours', desc: 'Add or rename cake flavours shown on the order screen.', placeholder: 'e.g. Lotus Biscoff, Nutella…' },
  { id: 'locations', title: '📍 Delivery Areas / Locations', desc: 'Add common towns or areas for quick selection & filtering.', placeholder: 'e.g. Johar Town, DHA, Gulberg…' },
  { id: 'addons', title: '✨ Add-ons', desc: 'Manage extra items you offer with cakes.', placeholder: 'e.g. Balloon bouquet, Sparkler candle…' },
];

export default function SettingsPage() {
  const lists = useLists();
  const save = useSaveLists();
  const toast = useToast();
  const cur: Lists = lists.data ?? { flavours: DEFAULT_FLAVOURS, locations: DEFAULT_LOCATIONS, addons: DEFAULT_ADDONS };

  const commit = (id: ListKey, items: string[]) =>
    save.mutate({ ...cur, [id]: items }, { onError: (e) => toast(apiError(e).message, 'error') });

  return (
    <>
      <h1 className="pt">Flavours, Areas & Add-ons</h1>
      <p className="sub">Customize your quick-select buttons for new orders.</p>
      {lists.isLoading && <p className="sub">Loading…</p>}
      {SECTIONS.map((s) => <Section key={s.id} {...s} items={cur[s.id]} disabled={lists.isLoading} onChange={(items) => commit(s.id, items)} />)}
    </>
  );
}

function Section({ id, title, desc, placeholder, items, disabled, onChange }: { id: ListKey; title: string; desc: string; placeholder: string; items: string[]; disabled: boolean; onChange: (items: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<number | null>(null);
  const [text, setText] = useState('');

  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (!items.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...items, v]);
    setDraft('');
  };
  const rename = (i: number) => {
    const v = text.trim();
    if (v && v !== items[i]) onChange(items.map((x, j) => (j === i ? v : x)));
    setEditing(null);
  };

  return (
    <div className="card" data-testid={`section-${id}`}>
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      <p className="sub">{desc}</p>
      <div>
        {items.length === 0 && <p style={{ color: 'var(--muted)' }}>No items yet.</p>}
        {items.map((item, i) => (
          <div className="manage-item" key={`${item}-${i}`}>
            {editing === i ? (
              <>
                <input autoFocus aria-label={`Rename ${item}`} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') rename(i); if (e.key === 'Escape') setEditing(null); }} />
                <div className="manage-acts">
                  <button type="button" onClick={() => rename(i)}>Save</button>
                  <button type="button" onClick={() => setEditing(null)}>Cancel</button>
                </div>
              </>
            ) : (
              <>
                <b>{item}</b>
                <div className="manage-acts">
                  <button type="button" data-testid="item-edit" disabled={disabled} onClick={() => { setEditing(i); setText(item); }}>Edit</button>
                  <button type="button" className="del" data-testid="item-remove" disabled={disabled} onClick={() => onChange(items.filter((_, j) => j !== i))}>Remove</button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="add-row">
        <input aria-label={`Add to ${title}`} data-testid={`add-${id}`} placeholder={placeholder} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
        <button type="button" className="btn sm" data-testid={`add-btn-${id}`} disabled={disabled} onClick={add}>Add</button>
      </div>
    </div>
  );
}
