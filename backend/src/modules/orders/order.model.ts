import { Schema, model, type InferSchemaType } from 'mongoose';
import { ORDER_STATUSES } from '@order-desk/shared';

const imageSchema = new Schema({ key: String, thumbKey: String, w: Number, h: Number }, { _id: false });

const orderSchema = new Schema({
  orderNo: { type: Number, required: true },
  cake: { type: String, required: true, trim: true },
  addons: { type: [String], default: [] },
  balloonColor: { type: String, enum: ['white', 'black', 'red'], default: null },
  customer: {
    name: { type: String, default: '', trim: true },
    phone: { type: String, default: '', trim: true },
  },
  location: { type: String, default: '', trim: true },
  source: { type: String, enum: ['', 'whatsapp', 'instagram', 'facebook'], default: '' },
  scheduledAt: { type: Date, required: true },
  status: { type: String, enum: ORDER_STATUSES, default: 'pending' },
  lbs: { type: Number, required: true, min: 0 },
  price: { type: Number, default: null, min: 0 },
  advance: { type: Number, default: 0, min: 0 },
  profit: { type: Number, default: null },
  images: { type: [imageSchema], default: [] },
  imageCount: { type: Number, default: 0 },
  coverThumb: { type: String }, // thumbKey of first image (key only, never a URL)
  details: { type: String, default: '' },
  deliveredAt: Date,
  cancelledAt: Date,
  isDeleted: { type: Boolean, default: false },
  version: { type: Number, default: 1 },
}, { timestamps: true, versionKey: false });

const live = { partialFilterExpression: { isDeleted: false } };
orderSchema.index({ orderNo: 1 }, { ...live, unique: true, name: 'orderNo_unique' });
orderSchema.index({ status: 1, scheduledAt: -1 }, { ...live, name: 'status_scheduledAt' });
orderSchema.index({ scheduledAt: -1 }, { ...live, name: 'scheduledAt' });
orderSchema.index({ location: 1, scheduledAt: -1 }, { ...live, name: 'location_scheduledAt' });
orderSchema.index({ 'customer.phone': 1 }, { ...live, name: 'customer_phone' });

export type OrderDoc = InferSchemaType<typeof orderSchema> & { _id: import('mongoose').Types.ObjectId; createdAt: Date; updatedAt: Date };
export const OrderModel = model('Order', orderSchema);

const counterSchema = new Schema({ _id: String, seq: { type: Number, default: 0 } }, { versionKey: false });
export const CounterModel = model('Counter', counterSchema);

const idemSchema = new Schema({
  userId: { type: String, required: true },
  key: { type: String, required: true },
  orderId: { type: Schema.Types.ObjectId },
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 },
}, { versionKey: false });
idemSchema.index({ userId: 1, key: 1 }, { unique: true, name: 'user_key_unique' });
export const IdempotencyModel = model('IdempotencyKey', idemSchema);
