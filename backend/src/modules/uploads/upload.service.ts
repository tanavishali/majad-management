import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import type { ImageRef } from '@order-desk/shared';
import { AppError } from '../../utils/AppError';
import { toImageRef } from '../orders/order.dto';
import { getStorage } from './storage';

export const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/** Validate by decoding, resize to <=1600px webp, make a 400px webp thumbnail, persist both + a metadata sidecar. */
export async function processAndStore(buf: Buffer): Promise<ImageRef> {
  const storage = getStorage();
  let main: { data: Buffer; info: sharp.OutputInfo }; let thumb: Buffer;
  try {
    const src = sharp(buf, { limitInputPixels: 50_000_000, failOn: 'error' }).rotate();
    main = await src.clone().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer({ resolveWithObject: true });
    thumb = await src.clone().resize({ width: 400, height: 400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 70 }).toBuffer();
  } catch {
    throw new AppError(422, 'VALIDATION_ERROR', 'File is not a valid image');
  }
  const id = randomBytes(16).toString('hex');
  const ref = { key: `${id}.webp`, thumbKey: `${id}.t.webp`, w: main.info.width, h: main.info.height };
  await storage.put(ref.key, main.data);
  await storage.put(ref.thumbKey, thumb);
  await storage.put(`${id}.json`, Buffer.from(JSON.stringify(ref)));
  return toImageRef(ref);
}

/** Resolve uploaded keys to refs (validates they exist). Known refs (already on the order) are reused. */
export async function resolveKeys(keys: string[], known: Array<{ key: string; thumbKey: string; w: number; h: number }> = []) {
  const storage = getStorage();
  const out: Array<{ key: string; thumbKey: string; w: number; h: number }> = [];
  const bad: string[] = [];
  for (const key of keys) {
    const k = known.find(x => x.key === key);
    if (k) { out.push({ key: k.key, thumbKey: k.thumbKey, w: k.w, h: k.h }); continue; }
    const m = /^([a-f0-9]{32})\.webp$/.exec(key);
    const raw = m ? await storage.get(`${m[1]}.json`) : null;
    if (!raw) { bad.push(key); continue; }
    const meta = JSON.parse(raw.toString());
    out.push({ key: meta.key, thumbKey: meta.thumbKey, w: meta.w, h: meta.h });
  }
  if (bad.length) throw new AppError(422, 'VALIDATION_ERROR', 'Unknown image key(s)', { images: `unknown keys: ${bad.join(', ')}` });
  return out;
}
