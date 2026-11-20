import type { ImageRef } from '@order-desk/shared';
import { API_BASE } from './axios';

/** Build a URL for a stored file key (local storage adapter serves GET /files/:key). */
export function fileUrl(keyOrUrl: string): string {
  if (/^(https?:|blob:|data:|\/)/.test(keyOrUrl)) return keyOrUrl;
  return `${API_BASE}/files/${keyOrUrl.split('/').map(encodeURIComponent).join('/')}`;
}
export const imageUrl = (i: ImageRef) => i.url ?? fileUrl(i.key);
export const thumbUrl = (i: ImageRef) => i.thumbUrl ?? fileUrl(i.thumbKey);
