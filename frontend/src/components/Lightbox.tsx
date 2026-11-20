import { useState } from 'react';
import { Dialog } from './Dialog';

export interface LightboxImage { src: string; thumb?: string }

/** Full-size reference pictures with previous/next and a thumbnail strip. */
export function Lightbox({ title, images, start = 0, onClose }: { title: string; images: LightboxImage[]; start?: number; onClose: () => void }) {
  const [i, setI] = useState(Math.min(start, Math.max(0, images.length - 1)));
  const cur = images[i];
  const many = images.length > 1;
  return (
    <Dialog onClose={onClose} label={title} wide testId="lightbox">
      <div style={{ fontSize: '1.8rem' }}>🖼️</div>
      <h3 className="ok" style={{ marginBottom: 4 }}>{title}</h3>
      {cur ? <img className="full-img" src={cur.src} alt={`${title} picture ${i + 1}`} data-testid="lightbox-img" /> : <p className="sub">No pictures yet.</p>}
      {many && (
        <>
          <div className="gal-nav">
            <button type="button" className="btn ghost sm" data-testid="lightbox-prev" onClick={() => setI((i + images.length - 1) % images.length)}>← Prev</button>
            <b data-testid="lightbox-count">{i + 1} / {images.length}</b>
            <button type="button" className="btn ghost sm" data-testid="lightbox-next" onClick={() => setI((i + 1) % images.length)}>Next →</button>
          </div>
          <div className="gal-strip">
            {images.map((im, n) => (
              <button key={n} type="button" className={n === i ? 'on' : ''} aria-label={`Show picture ${n + 1}`} onClick={() => setI(n)}>
                <img src={im.thumb ?? im.src} alt="" />
              </button>
            ))}
          </div>
        </>
      )}
      <button className="btn ghost" type="button" data-testid="lightbox-close" onClick={onClose}>Close</button>
    </Dialog>
  );
}
