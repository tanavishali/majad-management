import type { Request, RequestHandler, Response } from 'express';
import type { OrderQuery, UpcomingQuery } from '@order-desk/shared';
import { AppError } from '../../utils/AppError';
import { sendOne } from '../../utils/response';
import { orderService } from './order.service';

/** If-Match: 3 | "3" | W/"3" -> 3 ; absent -> undefined ; garbage -> 400 */
export function parseIfMatch(req: Request): number | undefined {
  const h = req.header('if-match');
  if (h === undefined || h === '*') return undefined;
  const n = Number(h.replace(/^W\//, '').replace(/"/g, '').trim());
  if (!Number.isInteger(n) || n < 0) throw AppError.badRequest('If-Match must be the order version number');
  return n;
}
const wrap = (fn: (req: Request, res: Response) => Promise<void>): RequestHandler => (req, res, next) => { fn(req, res).catch(next); };

export const orderController = {
  list: wrap(async (_req, res) => {
    const r = await orderService.list(res.locals.query as OrderQuery);
    res.json(r);
  }),
  upcoming: wrap(async (_req, res) => {
    res.json(await orderService.upcoming((res.locals.query as UpcomingQuery).minutes));
  }),
  nextUpcoming: wrap(async (_req, res) => {
    res.json(await orderService.nextUpcoming());
  }),
  get: wrap(async (req, res) => sendOne(res, await orderService.get(String(req.params.id)))),
  create: wrap(async (req, res) => {
    const key = req.header('idempotency-key')?.trim();
    if (key && key.length > 128) throw AppError.badRequest('Idempotency-Key too long');
    const { order, replayed } = await orderService.create(req.body, req.user!.id, key || undefined);
    if (replayed) res.setHeader('Idempotent-Replayed', 'true');
    sendOne(res, order, 201);
  }),
  update: wrap(async (req, res) => sendOne(res, await orderService.update(String(req.params.id), req.body, parseIfMatch(req)))),
  setStatus: wrap(async (req, res) => sendOne(res, await orderService.setStatus(String(req.params.id), req.body.status, parseIfMatch(req)))),
  remove: wrap(async (req, res) => { await orderService.remove(String(req.params.id)); res.status(204).end(); }),
  checkSlot: wrap(async (req, res) => {
    sendOne(res, await orderService.checkSlot(req.body.scheduledAt, req.body.excludeId));
  }),
};
