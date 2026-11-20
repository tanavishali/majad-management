import { useRef, useState } from 'react';
import { MAX_IMAGES } from '@order-desk/shared';
import { compressImage } from '../lib/images';
import { useToast } from '../app/toast';
import { Lightbox } from './Lightbox';

/** `key` is set once the file is stored on the server (or when it came from the saved order). */
export interface PhotoItem { id: string; preview: string; full?: string; key?: string; file?: File }

/** Reference pictures for an order: take a photo with the camera or pick from the gallery (several at once). */
export function PhotoPicker({ items, onChange, title }: { items: PhotoItem[]; onChange: (next: PhotoItem[]) => void; title: string }) {
  const cam = useRef<HTMLInputElement>(null);
  const gal = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const [view, setView] = useState<number | null>(null);
  const full = items.length >= MAX_IMAGES;

  async function pick(files: File[]) {
    const room = MAX_IMAGES - items.length;
    if (files.length > room) toast(`You can add up to ${MAX_IMAGES} pictures per order.`, 'error');
    const added: PhotoItem[] = [];
    for (const f of files.slice(0, Math.max(room, 0))) {
      try {
        const file = await compressImage(f);
        added.push({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file) });
      } catch (e) { toast((e as Error).message, 'error'); }
    }
    if (added.length) onChange([...items, ...added]);
  }
  function remove(i: number) {
    const it = items[i];
    if (it.file) URL.revokeObjectURL(it.preview);
    onChange(items.filter((_, j) => j !== i));
  }
  const onFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = Array.from(e.target.files ?? []);
    e.target.value = '';
    void pick(f);
  };

  return (
    <div>
      <input ref={cam} type="file" accept="image/*" capture="environment" hidden data-testid="photo-camera-input" onChange={onFiles} />
      <input ref={gal} type="file" accept="image/*" multiple hidden data-testid="photo-gallery-input" onChange={onFiles} />
      <div className="photo-btns">
        <button type="button" className="photo-btn" data-testid="photo-camera" disabled={full} onClick={() => cam.current?.click()}>📷 Camera</button>
        <button type="button" className="photo-btn" data-testid="photo-gallery" disabled={full} onClick={() => gal.current?.click()}>🖼️ Gallery</button>
      </div>
      <p className="photo-hint" data-testid="photo-hint">
        {items.length ? `${items.length} of ${MAX_IMAGES} pictures · the first one is shown on the order` : `Up to ${MAX_IMAGES} pictures`}
      </p>
      <div className="photos" data-testid="photo-list">
        {items.map((it, i) => (
          <div className="ph" key={it.id} data-testid={`photo-item-${i}`}>
            <img src={it.preview} alt={`Reference ${i + 1}`} onClick={() => setView(i)} />
            {i === 0 && items.length > 1 && <span className="first">Cover</span>}
            <button type="button" className="rm" aria-label={`Remove picture ${i + 1}`} data-testid={`photo-remove-${i}`} onClick={() => remove(i)}>✕</button>
          </div>
        ))}
      </div>
      {view !== null && <Lightbox title={title} images={items.map((p) => ({ src: p.full ?? p.preview, thumb: p.preview }))} start={view} onClose={() => setView(null)} />}
    </div>
  );
}
