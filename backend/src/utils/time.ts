/**
 * Asia/Karachi helpers. Pakistan has been on a fixed UTC+05:00 since 2009 (no DST),
 * so day arithmetic with a constant offset is exact. All functions are pure.
 */
import { TZ } from '@order-desk/shared';

export const KARACHI_OFFSET_MS = 5 * 60 * 60 * 1000;
export const DAY_MS = 86_400_000;

export interface KarachiParts { y: number; m: number; d: number; h: number; min: number; dow: number }

export function karachiParts(date: Date): KarachiParts {
  const s = new Date(date.getTime() + KARACHI_OFFSET_MS);
  return { y: s.getUTCFullYear(), m: s.getUTCMonth() + 1, d: s.getUTCDate(), h: s.getUTCHours(), min: s.getUTCMinutes(), dow: s.getUTCDay() };
}
/** Instant for a Karachi wall-clock time. Month is 1-12, day may overflow (Date.UTC normalises). */
export function fromKarachi(y: number, m: number, d: number, h = 0, min = 0): Date {
  return new Date(Date.UTC(y, m - 1, d, h, min) - KARACHI_OFFSET_MS);
}
export function startOfDay(date: Date): Date {
  const p = karachiParts(date);
  return fromKarachi(p.y, p.m, p.d);
}
export function addDays(date: Date, n: number): Date { return new Date(date.getTime() + n * DAY_MS); }
/** Monday 00:00 Karachi of the week containing date */
export function startOfWeek(date: Date): Date {
  const sod = startOfDay(date);
  const dow = karachiParts(date).dow; // 0 = Sunday
  return addDays(sod, -((dow + 6) % 7));
}
export function startOfMonth(date: Date, offsetMonths = 0): Date {
  const p = karachiParts(date);
  return fromKarachi(p.y, p.m + offsetMonths, 1);
}
export function ymd(date: Date): string {
  const p = karachiParts(date);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}
export function hhmm(date: Date): string {
  const p = karachiParts(date);
  return `${String(p.h).padStart(2, '0')}:${String(p.min).padStart(2, '0')}`;
}
export function fmtDateLong(date: Date): string {
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ });
}
export function fmtDayShort(date: Date): string {
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ });
}
export function fmtShort(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: TZ });
}
export function fmtTime12(date: Date): string {
  const p = karachiParts(date);
  return `${p.h % 12 || 12}:${String(p.min).padStart(2, '0')} ${p.h >= 12 ? 'PM' : 'AM'}`;
}
export function fmtGenerated(date: Date): string {
  return date.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: TZ });
}
