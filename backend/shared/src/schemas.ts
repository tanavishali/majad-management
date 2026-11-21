import { z } from 'zod';
import {
  ORDER_STATUSES, STATUS_FILTERS, RANGES, SORT_FIELDS, MAX_LIMIT, DEFAULT_LIMIT, NOTIFY_BEFORE_MINUTES, SALES_PERIODS, MAX_REPORT_DAYS, MAX_IMAGES, ORDER_SOURCES, BALLOON_COLORS,
} from './constants';

const rupees = z.number().int().min(0).max(100_000_000);
const phone = z.string().trim().max(20).refine(v => v === '' || v.length >= 5, 'Phone looks too short');

export const customerSchema = z.object({
  name: z.string().trim().max(100).default(''),
  phone: phone.default(''),
}).strict();

/** Create / full-update body. scheduledAt is an ISO instant (UTC). Web converts Asia/Karachi local input -> ISO. */
export const orderInputSchema = z.object({
  cake: z.string().trim().min(1).max(120),
  addons: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  balloonColor: z.enum(BALLOON_COLORS).nullable().default(null),
  customer: customerSchema.default({}),
  location: z.string().trim().max(100).default(''),
  source: z.enum(ORDER_SOURCES).or(z.literal('')).default(''),
  scheduledAt: z.coerce.date(),
  lbs: z.number().positive().max(500),
  price: rupees.nullable().default(null),
  advance: rupees.default(0),
  profit: z.number().int().min(-100_000_000).max(100_000_000).nullable().default(null),
  details: z.string().trim().max(1000).default(''),
  /** keys returned by POST /uploads (reference pictures); server validates they exist */
  images: z.array(z.string().min(1)).max(MAX_IMAGES).default([]),
  /** Save-anyway after SLOT_CONFLICT */
  force: z.boolean().optional(),
}).strict();
export type OrderInput = z.infer<typeof orderInputSchema>;

export const orderUpdateSchema = orderInputSchema.partial().extend({ status: z.enum(ORDER_STATUSES).optional() }).strict();
export type OrderUpdate = z.infer<typeof orderUpdateSchema>;

export const statusChangeSchema = z.object({ status: z.enum(ORDER_STATUSES) }).strict();

export const checkSlotSchema = z.object({
  scheduledAt: z.coerce.date(),
  excludeId: z.string().optional(),
}).strict();

export const orderQuerySchema = z.object({
  status: z.enum(STATUS_FILTERS).default('all'),
  location: z.string().trim().max(100).optional(),
  range: z.enum(RANGES).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  q: z.string().trim().max(100).optional(),
  sort: z.string().regex(new RegExp(`^-?(${SORT_FIELDS.join('|')})$`)).default('scheduledAt'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
}).strict().refine(v => v.range !== 'custom' || (v.from && v.to), { message: 'custom range needs from and to', path: ['from'] });
export type OrderQuery = z.infer<typeof orderQuerySchema>;

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine((s) => {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}, 'Not a real date');
const dayNumber = (s: string) => Math.round(new Date(`${s}T00:00:00Z`).getTime() / 86_400_000);

/**
 * Sales page. period: 1 = today, w = the week (Mon-Sun) containing `from` (default this week),
 * m = a month (`month`, default this month), c = custom range `from`..`to` (inclusive, both required).
 */
export const salesQuerySchema = z.object({
  period: z.enum(SALES_PERIODS).default('1'),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM').optional(),
  from: isoDay.optional(),
  to: isoDay.optional(),
}).strict().superRefine((q, ctx) => {
  if (q.period !== 'c') return;
  if (!q.from || !q.to) { ctx.addIssue({ code: 'custom', message: 'A custom range needs from and to' }); return; }
  const days = dayNumber(q.to) - dayNumber(q.from) + 1;
  if (days < 1) ctx.addIssue({ code: 'custom', path: ['to'], message: 'End date is before the start date' });
  else if (days > MAX_REPORT_DAYS) ctx.addIssue({ code: 'custom', path: ['to'], message: `Pick at most ${MAX_REPORT_DAYS} days` });
});
export type SalesQuery = z.infer<typeof salesQuerySchema>;

/** Quick-pick lists shown on the new-order screen (managed on separate settings pages). */
const listItem = z.string().trim().min(1).max(60);
const uniqueList = z.array(listItem).max(60).transform(a => {
  const seen = new Set<string>();
  return a.filter(x => { const k = x.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
});
export const listsSchema = z.object({ flavours: uniqueList, locations: uniqueList, addons: uniqueList }).strict();
export type ListsInput = z.infer<typeof listsSchema>;

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(50),
  password: z.string().min(1).max(200),
}).strict();
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
}).strict();

/** GET /orders/upcoming - open orders due within the next `minutes` (default 45). */
export const upcomingQuerySchema = z.object({
  minutes: z.coerce.number().int().min(1).max(240).default(NOTIFY_BEFORE_MINUTES),
}).strict();
export type UpcomingQuery = z.infer<typeof upcomingQuerySchema>;
