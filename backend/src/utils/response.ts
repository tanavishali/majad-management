import type { Response } from 'express';
import type { ApiMeta } from '@order-desk/shared';

export function sendOne<T>(res: Response, data: T, status = 200) {
  res.status(status).json({ data });
}
export function sendList<T>(res: Response, data: T[], meta: ApiMeta, extra: Record<string, unknown> = {}) {
  res.json({ data, meta, ...extra });
}
export function makeMeta(page: number, limit: number, total: number): ApiMeta {
  return { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) };
}
