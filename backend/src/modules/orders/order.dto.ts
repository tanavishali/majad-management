import type { OrderDTO, ImageRef } from '@order-desk/shared';
import { orderCode } from './slot';

export const FILES_BASE = '/api/v1/files';
const url = (key: string) => `${FILES_BASE}/${key}`;

export function toImageRef(i: { key?: string | null; thumbKey?: string | null; w?: number | null; h?: number | null }): ImageRef {
  return { key: i.key!, thumbKey: i.thumbKey!, w: i.w ?? 0, h: i.h ?? 0, url: url(i.key!), thumbUrl: url(i.thumbKey!) };
}

/** Still to collect. Delivered/cancelled orders and orders without a price owe nothing. */
export const balanceOf = (o: { status?: string | null; price?: number | null; advance?: number | null }) =>
  o.status === 'delivered' || o.status === 'cancelled' || o.price == null ? 0 : Math.max(0, o.price - (o.advance ?? 0));

/**
 * `o` is a lean order document. coverThumb is returned as a ready-to-use URL.
 * Tolerates documents saved by the older order schema (no cake/lbs, `notes`, `customer.address`).
 */
export function toDTO(o: any, _now: Date, withImages: boolean): OrderDTO {
  const dto: OrderDTO = {
    id: String(o._id),
    orderNo: o.orderNo,
    code: orderCode(o.orderNo),
    cake: o.cake ?? 'Cake order',
    addons: o.addons ?? [],
    balloonColor: o.balloonColor ?? null,
    customer: { name: o.customer?.name ?? '', phone: o.customer?.phone ?? '' },
    location: o.location ?? '',
    source: (o.source ?? '') as OrderDTO['source'],
    scheduledAt: new Date(o.scheduledAt).toISOString(),
    status: o.status,
    lbs: o.lbs ?? 1,
    price: o.price ?? null,
    advance: o.advance ?? 0,
    profit: o.profit ?? null,
    balance: balanceOf(o),
    imageCount: o.imageCount ?? 0,
    details: o.details ?? o.notes ?? '',
    version: o.version,
    createdAt: new Date(o.createdAt).toISOString(),
    updatedAt: new Date(o.updatedAt).toISOString(),
  };
  if (o.coverThumb) dto.coverThumb = url(o.coverThumb);
  if (o.deliveredAt) dto.deliveredAt = new Date(o.deliveredAt).toISOString();
  if (o.cancelledAt) dto.cancelledAt = new Date(o.cancelledAt).toISOString();
  if (withImages) dto.images = (o.images ?? []).map(toImageRef);
  return dto;
}
