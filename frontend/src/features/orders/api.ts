import type { ApiList, ApiOne, ImageRef, OrderDTO, OrderStatus, SlotCheck } from '@order-desk/shared';
import { api } from '../../lib/axios';

export type RangeFilter = 'today';
export type StatusFilter = 'all' | 'pending' | 'ready' | 'delivered' | 'cancelled';

export interface OrderListParams {
  status?: StatusFilter;
  location?: string; // 'location name' | '__none__'
  range?: RangeFilter;
  q?: string;
  sort?: string;
  page: number;
  limit: number;
}

export interface OrderPayload {
  cake: string;
  addons: string[];
  balloonColor: 'white' | 'black' | 'red' | null;
  customer: { name: string; phone: string };
  location: string;
  source: '' | 'whatsapp' | 'instagram' | 'facebook';
  scheduledAt: string; // ISO UTC
  lbs: number;
  price: number | null;
  advance: number;
  profit: number | null;
  details: string;
  images: string[]; // upload keys; the first one is the cover
  force?: boolean;
}

const clean = (p: OrderListParams) => Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== '' && v !== 'all'));

export const listOrders = (params: OrderListParams) => api.get<ApiList<OrderDTO>>('/orders', { params: clean(params) }).then((r) => r.data);
export const getOrder = (id: string) => api.get<ApiOne<OrderDTO>>(`/orders/${id}`).then((r) => r.data.data);
export const createOrder = (body: OrderPayload) =>
  api.post<ApiOne<OrderDTO>>('/orders', body, { headers: { 'Idempotency-Key': crypto.randomUUID() } }).then((r) => r.data.data);
export const updateOrder = (id: string, body: OrderPayload, version: number) =>
  api.patch<ApiOne<OrderDTO>>(`/orders/${id}`, body, { headers: { 'If-Match': String(version) } }).then((r) => r.data.data);
export const changeStatus = (id: string, status: OrderStatus) =>
  api.patch<ApiOne<OrderDTO>>(`/orders/${id}/status`, { status }).then((r) => r.data.data);
export const deleteOrder = (id: string) => api.delete(`/orders/${id}`).then(() => undefined);
export const checkSlot = (scheduledAt: string, excludeId?: string) =>
  api.post<ApiOne<SlotCheck>>('/orders/check-slot', { scheduledAt, excludeId }).then((r) => r.data.data);
export const uploadFiles = (files: File[]) => {
  const fd = new FormData();
  files.forEach((f) => fd.append('files', f));
  return api.post<ApiOne<ImageRef[]>>('/uploads', fd).then((r) => r.data.data);
};
