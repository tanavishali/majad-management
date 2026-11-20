import type { FilterQuery } from 'mongoose';
import { CounterModel, IdempotencyModel, OrderModel } from './order.model';
import { slotWindow } from './slot';

const OPEN = ['pending', 'ready'];

export const orderRepository = {
  async nextOrderNo(): Promise<number> {
    const c = await CounterModel.findOneAndUpdate({ _id: 'orderNo' }, { $inc: { seq: 1 } }, { upsert: true, new: true }).lean();
    return c!.seq;
  },
  async create(data: Record<string, unknown>) {
    const doc = await OrderModel.create(data);
    return doc.toObject();
  },
  findById(id: string) {
    return OrderModel.findOne({ _id: id, isDeleted: false }).lean();
  },
  /** List rows: lean + no images array */
  list(filter: FilterQuery<unknown>, sort: Record<string, 1 | -1>, skip: number, limit: number) {
    return OrderModel.find(filter).select('-images').sort(sort).skip(skip).limit(limit).lean();
  },
  count(filter: FilterQuery<unknown>) { return OrderModel.countDocuments(filter); },
  /** One aggregation for the status chips; `filter` must exclude the status clause. */
  async statusCounts(filter: FilterQuery<unknown>) {
    const rows = await OrderModel.aggregate<{ _id: string; n: number }>([
      { $match: filter },
      { $group: { _id: '$status', n: { $sum: 1 } } },
    ]);
    const c = { all: 0, pending: 0, ready: 0, delivered: 0, cancelled: 0 };
    for (const r of rows) {
      c.all += r.n;
      if (r._id in c) c[r._id as 'pending' | 'ready' | 'delivered' | 'cancelled'] += r.n;
    }
    return c;
  },
  /** Open (pending/ready) orders due in [from, to]. */
  upcoming(from: Date, to: Date, limit = 50) {
    return OrderModel.find({ isDeleted: false, status: { $in: OPEN }, scheduledAt: { $gte: from, $lte: to } })
      .select('-images').sort({ scheduledAt: 1 }).limit(limit).lean();
  },
  /** Open orders from `from` on (dashboard "Up next"). */
  upNext(from: Date, limit: number) {
    return OrderModel.find({ isDeleted: false, status: { $in: OPEN }, scheduledAt: { $gte: from } })
      .select('-images').sort({ scheduledAt: 1, _id: 1 }).limit(limit).lean();
  },
  /** Every non-cancelled order closer than the slot gap to `t`. */
  findSlotConflicts(t: Date, excludeId?: string) {
    const w = slotWindow(t);
    const q: FilterQuery<unknown> = { isDeleted: false, status: { $ne: 'cancelled' }, scheduledAt: { $gt: w.from, $lt: w.to } };
    if (excludeId) q._id = { $ne: excludeId };
    return OrderModel.find(q).select('orderNo cake customer scheduledAt').sort({ scheduledAt: 1 }).lean();
  },
  /** scheduledAt of every non-cancelled order in [from, to). */
  async scheduledBetween(from: Date, to: Date, excludeId?: string): Promise<Date[]> {
    const q: FilterQuery<unknown> = { isDeleted: false, status: { $ne: 'cancelled' }, scheduledAt: { $gte: from, $lt: to } };
    if (excludeId) q._id = { $ne: excludeId };
    const rows = await OrderModel.find(q).select('scheduledAt').lean();
    return rows.map(r => r.scheduledAt);
  },
  /** Atomic update; matches `version` when given. Returns null if no match. */
  updateIfVersion(id: string, update: Record<string, unknown>, version?: number) {
    const q: FilterQuery<unknown> = { _id: id, isDeleted: false };
    if (version !== undefined) q.version = version;
    return OrderModel.findOneAndUpdate(q, update, { new: true }).lean();
  },
  // idempotency
  reserveKey(userId: string, key: string) { return IdempotencyModel.create({ userId, key }); },
  findKey(userId: string, key: string) { return IdempotencyModel.findOne({ userId, key }).lean(); },
  completeKey(userId: string, key: string, orderId: unknown) { return IdempotencyModel.updateOne({ userId, key }, { orderId }); },
  releaseKey(userId: string, key: string) { return IdempotencyModel.deleteOne({ userId, key }); },
};
