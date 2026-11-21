import {
  type OrderInput, type OrderUpdate, type OrderQuery, type OrderStatus, type SlotCheck,
} from '@order-desk/shared';
import { AppError } from '../../utils/AppError';
import { makeMeta } from '../../utils/response';
import { addDays, startOfDay } from '../../utils/time';
import { resolveKeys } from '../uploads/upload.service';
import { toDTO } from './order.dto';
import { buildOrderFilter, buildSort } from './filter';
import { orderRepository as repo } from './order.repository';
import { nextFreeSlot, toSlotConflict } from './slot';

/** Strip spaces, dashes, brackets so prefix search on customer.phone works ("0300 123-4567" -> "03001234567"). */
export const normalizePhone = (p: string) => p.replace(/[\s\-()]/g, '');

type ImgRef = { key: string; thumbKey: string; w: number; h: number };
const imageFields = (imgs: ImgRef[]) => ({ images: imgs, imageCount: imgs.length, coverThumb: imgs[0]?.thumbKey ?? null });

function statusFields(to: OrderStatus, now: Date) {
  const set: Record<string, unknown> = { status: to };
  const unset: Record<string, ''> = {};
  if (to === 'delivered') { set.deliveredAt = now; unset.cancelledAt = ''; }
  else if (to === 'cancelled') { set.cancelledAt = now; unset.deliveredAt = ''; }
  else { unset.deliveredAt = ''; unset.cancelledAt = ''; }
  return { set, unset };
}

export const orderService = {
  async list(q: OrderQuery) {
    const now = new Date();
    const filter = buildOrderFilter(q, now);
    const countsFilter = buildOrderFilter(q, now, { excludeStatus: true });
    const [rows, total, counts] = await Promise.all([
      repo.list(filter, buildSort(q.sort), (q.page - 1) * q.limit, q.limit),
      repo.count(filter),
      repo.statusCounts(countsFilter),
    ]);
    return { data: rows.map(r => toDTO(r, now, false)), meta: makeMeta(q.page, q.limit, total), counts };
  },

  async get(id: string) {
    const o = await repo.findById(id);
    if (!o) throw AppError.notFound('Order');
    return toDTO(o, new Date(), true);
  },

  /** Reminder feed: open orders due within the next `minutes`. */
  async upcoming(minutes: number) {
    const now = new Date();
    const rows = await repo.upcoming(now, new Date(now.getTime() + minutes * 60_000));
    return { data: rows.map(r => toDTO(r, now, false)), meta: { minutes, now: now.toISOString(), total: rows.length } };
  },

  /** Next five open orders, regardless of how far in the future they are. */
  async nextUpcoming() {
    const now = new Date();
    const rows = await repo.upNext(now, 5);
    return { data: rows.map(r => toDTO(r, now, false)), meta: { minutes: 0, now: now.toISOString(), total: rows.length } };
  },

  /** Clashing orders (closer than the slot gap) plus the next free slot on that day. */
  async checkSlot(scheduledAt: Date, excludeId?: string): Promise<SlotCheck> {
    const rows = await repo.findSlotConflicts(scheduledAt, excludeId);
    if (!rows.length) return { conflicts: [], nextFree: null };
    const dayStart = startOfDay(scheduledAt); const dayEnd = addDays(dayStart, 1);
    const taken = await repo.scheduledBetween(dayStart, dayEnd, excludeId);
    const next = nextFreeSlot(scheduledAt, taken, dayEnd);
    return { conflicts: rows.map(r => toSlotConflict(r as any)), nextFree: next ? next.toISOString() : null };
  },

  async assertNoConflict(scheduledAt: Date, excludeId?: string) {
    const c = await this.checkSlot(scheduledAt, excludeId);
    if (c.conflicts.length) {
      throw AppError.conflict('SLOT_CONFLICT', `Another order is within 30 minutes (${c.conflicts.map(x => x.code).join(', ')})`, c);
    }
  },

  async create(input: OrderInput, userId: string, idempotencyKey?: string): Promise<{ order: ReturnType<typeof toDTO>; replayed: boolean }> {
    if (idempotencyKey) {
      try { await repo.reserveKey(userId, idempotencyKey); }
      catch (e: any) {
        if (e?.code !== 11000) throw e;
        const k = await repo.findKey(userId, idempotencyKey);
        if (k?.orderId) return { order: await this.get(String(k.orderId)), replayed: true };
        throw AppError.conflict('DUPLICATE', 'A request with this Idempotency-Key is still in progress');
      }
    }
    try {
      if (!input.force) await this.assertNoConflict(input.scheduledAt);
      const imgs = await resolveKeys(input.images);
      const orderNo = await repo.nextOrderNo();
      const created = await repo.create({
        orderNo,
        cake: input.cake,
        addons: input.addons,
        balloonColor: input.balloonColor,
        customer: { name: input.customer.name, phone: normalizePhone(input.customer.phone) },
        location: input.location,
        source: input.source,
        scheduledAt: input.scheduledAt,
        status: 'pending',
        lbs: input.lbs, price: input.price, advance: input.advance, profit: input.profit,
        details: input.details,
        ...imageFields(imgs),
      });
      if (idempotencyKey) await repo.completeKey(userId, idempotencyKey, created._id);
      return { order: toDTO(created, new Date(), true), replayed: false };
    } catch (e) {
      if (idempotencyKey) await repo.releaseKey(userId, idempotencyKey).catch(() => undefined);
      throw e;
    }
  },

  async update(id: string, input: OrderUpdate, ifMatch?: number) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const cur = await repo.findById(id);
      if (!cur) throw AppError.notFound('Order');
      if (ifMatch !== undefined && ifMatch !== cur.version) throw versionConflict(cur.version);
      const now = new Date();
      const set: Record<string, unknown> = {};
      const unset: Record<string, ''> = {};
      if (input.cake !== undefined) set.cake = input.cake;
      if (input.addons !== undefined) set.addons = input.addons;
      if (input.balloonColor !== undefined) set.balloonColor = input.balloonColor;
      if (input.customer) set.customer = { name: input.customer.name, phone: normalizePhone(input.customer.phone) };
      if (input.location !== undefined) set.location = input.location;
      if (input.source !== undefined) set.source = input.source;
      if (input.lbs !== undefined) set.lbs = input.lbs;
      if (input.price !== undefined) set.price = input.price;
      if (input.advance !== undefined) set.advance = input.advance;
      if (input.profit !== undefined) set.profit = input.profit;
      if (input.details !== undefined) set.details = input.details;
      const newStatus = input.status ?? cur.status;
      if (input.scheduledAt && input.scheduledAt.getTime() !== cur.scheduledAt.getTime()) {
        if (!input.force && newStatus !== 'cancelled') await this.assertNoConflict(input.scheduledAt, id);
        set.scheduledAt = input.scheduledAt;
      }
      if (input.images) Object.assign(set, imageFields(await resolveKeys(input.images, cur.images as ImgRef[])));
      if (input.status && input.status !== cur.status) { const s = statusFields(input.status, now); Object.assign(set, s.set); Object.assign(unset, s.unset); }

      const updated = await repo.updateIfVersion(id, buildUpdate(set, unset), cur.version);
      if (updated) return toDTO(updated, now, true);
      if (ifMatch !== undefined) throw versionConflict();
      // no If-Match: someone else won the race, re-read and retry
    }
    throw versionConflict();
  },

  async setStatus(id: string, status: OrderStatus, ifMatch?: number) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const cur = await repo.findById(id);
      if (!cur) throw AppError.notFound('Order');
      if (ifMatch !== undefined && ifMatch !== cur.version) throw versionConflict(cur.version);
      if (cur.status === status) return toDTO(cur, new Date(), true);
      const now = new Date();
      const { set, unset } = statusFields(status, now);
      const updated = await repo.updateIfVersion(id, buildUpdate(set, unset), cur.version);
      if (updated) return toDTO(updated, now, true);
      if (ifMatch !== undefined) throw versionConflict();
    }
    throw versionConflict();
  },

  async remove(id: string) {
    const o = await repo.updateIfVersion(id, { $set: { isDeleted: true }, $inc: { version: 1 } });
    if (!o) throw AppError.notFound('Order');
  },
};

function buildUpdate(set: Record<string, unknown>, unset: Record<string, ''>) {
  const u: Record<string, unknown> = { $set: set, $inc: { version: 1 } };
  if (Object.keys(unset).length) u.$unset = unset;
  return u;
}
function versionConflict(current?: number) {
  return new AppError(412, 'VERSION_CONFLICT', 'Order was modified by someone else; reload and retry', current === undefined ? undefined : { currentVersion: current });
}
