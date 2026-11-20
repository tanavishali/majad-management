import { TZ } from '@order-desk/shared';

/* Asia/Karachi has no DST and is fixed at UTC+05:00. All date strings are 'YYYY-MM-DD', times 'HH:mm'. */
const OFFSET = '+05:00';

const pad = (n: number) => String(n).padStart(2, '0');

/** Local Karachi date + time inputs -> ISO instant (UTC) for the API. */
export function karachiToIso(date: string, time: string): string {
  return new Date(`${date}T${time}:00${OFFSET}`).toISOString();
}

/** ISO instant -> Karachi local {date, time} for form inputs. */
export function isoToKarachi(iso: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return { date: `${g('year')}-${g('month')}-${g('day')}`, time: `${g('hour')}:${g('minute')}` };
}

export const karachiDateOf = (iso: string) => isoToKarachi(iso).date;
export const todayKarachi = () => karachiDateOf(new Date().toISOString());

const toUtc = (d: string) => {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day));
};
const fromUtc = (dt: Date) => `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;

export function addDays(d: string, n: number): string {
  const dt = toUtc(d);
  dt.setUTCDate(dt.getUTCDate() + n);
  return fromUtc(dt);
}
export const mondayOf = (d: string) => addDays(d, -((toUtc(d).getUTCDay() + 6) % 7));
export const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
export const monthEnd = (d: string) => {
  const dt = toUtc(monthStart(d));
  dt.setUTCMonth(dt.getUTCMonth() + 1, 0);
  return fromUtc(dt);
};
export const addMonths = (d: string, n: number) => {
  const dt = toUtc(monthStart(d));
  dt.setUTCMonth(dt.getUTCMonth() + n, 1);
  return fromUtc(dt);
};
export const daysBetween = (a: string, b: string) => Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / 86_400_000);

/** Start (00:00 Karachi) of a local date as ISO. */
export const dayStartIso = (d: string) => karachiToIso(d, '00:00');

const dateFmt = (opts: Intl.DateTimeFormatOptions) => (d: string) =>
  toUtc(d).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' });
export const fmtDateStr = dateFmt({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
export const fmtDayShortStr = dateFmt({ weekday: 'short', day: 'numeric', month: 'short' });
export const fmtShortDStr = dateFmt({ day: 'numeric', month: 'short' });
export const fmtMonthYearStr = dateFmt({ month: 'long', year: 'numeric' });
export const weekdayShortStr = dateFmt({ weekday: 'short' });

export const fmtDate = (iso: string) => fmtDateStr(karachiDateOf(iso));
export const fmtDayShort = (iso: string) => fmtDayShortStr(karachiDateOf(iso));
export function fmtTime(iso: string): string {
  const { time } = isoToKarachi(iso);
  const h = Number(time.slice(0, 2));
  return `${h % 12 || 12}:${time.slice(3)} ${h >= 12 ? 'PM' : 'AM'}`;
}
export const fmtWhen = (iso: string) => `${fmtDate(iso)} at ${fmtTime(iso)}`;

export const money = (n: number | undefined | null) => `Rs ${Number(n || 0).toLocaleString('en-US')}`;
export const moneyS = (n: number) => (n < 0 ? `-${money(-n)}` : money(n));

export const STATUS_LABEL: Record<string, string> = { pending: 'Pending', ready: 'Ready', delivered: 'Delivered', cancelled: 'Cancelled' };
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "03:45" -> "3:45 AM" */
export function fmtClock(hhmm: string): string {
  const [h, m] = hhmm.split(':');
  const n = Number(h);
  return `${n % 12 || 12}:${m} ${n >= 12 ? 'PM' : 'AM'}`;
}
/** Add minutes to a "HH:mm" clock (capped at 23:55 so it stays on the same day). */
export function addClockMinutes(hhmm: string, add: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = Math.min(23 * 60 + 55, h * 60 + m + add);
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}
