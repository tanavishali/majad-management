import type { ImageRef } from '@order-desk/shared';
import { API_BASE } from './axios';

/** Build a URL for a stored file key (local storage adapter serves GET /files/:key). */
export function fileUrl(keyOrUrl: string): string {
  if (/^(https?:|blob:|data:)/.test(keyOrUrl)) return keyOrUrl;
  if (keyOrUrl.startsWith('/')) {
    return /^https?:\/\//.test(API_BASE) ? new URL(keyOrUrl, API_BASE).toString() : keyOrUrl;
  }
  return `${API_BASE}/files/${keyOrUrl.split('/').map(encodeURIComponent).join('/')}`;
}
export const imageUrl = (i: ImageRef) => fileUrl(i.url ?? i.key);
export const thumbUrl = (i: ImageRef) => fileUrl(i.thumbUrl ?? i.thumbKey);
