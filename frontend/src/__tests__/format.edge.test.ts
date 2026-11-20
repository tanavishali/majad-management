import { describe, expect, it } from 'vitest';
import {
  addDays, addMonths, daysBetween, dayStartIso, fmtTime, fmtWhen, isoToKarachi, karachiDateOf, karachiToIso, mondayOf,
  money, moneyS, monthEnd, monthStart, STATUS_LABEL, cap, fmtClock, addClockMinutes, fmtDate,
} from '../lib/format';

describe('Karachi <-> ISO around midnight and boundaries', () => {
  it('00:00 Karachi is 19:00Z the previous UTC day', () => {
    expect(karachiToIso('2026-03-01', '00:00')).toBe('2026-02-28T19:00:00.000Z');
    expect(dayStartIso('2026-01-01')).toBe('2025-12-31T19:00:00.000Z');
  });
  it('23:59 Karachi is 18:59Z the same UTC day', () => {
    expect(karachiToIso('2026-03-01', '23:59')).toBe('2026-03-01T18:59:00.000Z');
  });
  it('ISO instants straddling Karachi midnight land on different local days', () => {
    expect(isoToKarachi('2026-02-28T18:59:59.999Z')).toEqual({ date: '2026-02-28', time: '23:59' });
    expect(isoToKarachi('2026-02-28T19:00:00.000Z')).toEqual({ date: '2026-03-01', time: '00:00' });
  });
  it('never renders hour 24 at midnight (h23 cycle)', () => {
    expect(isoToKarachi('2026-02-28T19:00:00.000Z').time).toBe('00:00');
  });
  it('round-trips every 15 min over a day, incl. month and year ends', () => {
    for (const d of ['2026-02-28', '2024-02-29', '2026-12-31', '2027-01-01']) {
      for (let m = 0; m < 24 * 60; m += 15) {
        const t = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
        expect(isoToKarachi(karachiToIso(d, t))).toEqual({ date: d, time: t });
      }
    }
  });
  it('karachiDateOf uses local, not UTC, date', () => {
    expect(karachiDateOf('2026-12-31T19:30:00.000Z')).toBe('2027-01-01');
  });
  it('12h formatting', () => {
    expect(fmtTime(karachiToIso('2026-03-10', '12:00'))).toBe('12:00 PM');
    expect(fmtTime(karachiToIso('2026-03-10', '12:59'))).toBe('12:59 PM');
    expect(fmtTime(karachiToIso('2026-03-10', '00:05'))).toBe('12:05 AM');
    expect(fmtTime(karachiToIso('2026-03-10', '13:00'))).toBe('1:00 PM');
    expect(fmtTime(karachiToIso('2026-03-10', '23:59'))).toBe('11:59 PM');
  });
  it('fmtDate / fmtWhen show the Karachi date', () => {
    expect(fmtDate('2026-02-28T19:00:00.000Z')).toContain('1 Mar 2026');
    expect(fmtWhen('2026-02-28T19:00:00.000Z')).toMatch(/1 Mar 2026 at 12:00 AM$/);
  });
});

describe('week / month maths', () => {
  it('addDays crosses month, year and leap day', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-03-10', 0)).toBe('2026-03-10');
  });
  it('mondayOf for each weekday (2026-03-09 is a Monday)', () => {
    const exp = ['2026-03-09', '2026-03-09', '2026-03-09', '2026-03-09', '2026-03-09', '2026-03-09', '2026-03-09'];
    for (let i = 0; i < 7; i++) expect(mondayOf(addDays('2026-03-09', i))).toBe(exp[i]);
    expect(mondayOf('2026-03-16')).toBe('2026-03-16');
  });
  it('mondayOf crosses month/year start', () => {
    expect(mondayOf('2027-01-01')).toBe('2026-12-28'); // Friday
    expect(mondayOf('2026-03-01')).toBe('2026-02-23'); // Sunday
  });
  it('monthEnd handles 28/29/30/31 day months', () => {
    expect(monthEnd('2026-02-01')).toBe('2026-02-28');
    expect(monthEnd('2024-02-15')).toBe('2024-02-29');
    expect(monthEnd('2100-02-15')).toBe('2100-02-28'); // not a leap year
    expect(monthEnd('2026-04-30')).toBe('2026-04-30');
    expect(monthEnd('2026-12-05')).toBe('2026-12-31');
    expect(monthStart('2026-12-05')).toBe('2026-12-01');
  });
  it('addMonths from a month end does not skip a month', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-01');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-01');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-01');
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-01');
    expect(addMonths('2026-01-15', 13)).toBe('2027-02-01');
  });
  it('daysBetween', () => {
    expect(daysBetween('2026-02-28', '2026-03-01')).toBe(1);
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2);
    expect(daysBetween('2026-03-05', '2026-03-05')).toBe(0);
    expect(daysBetween('2026-03-05', '2026-03-01')).toBe(-4);
  });
});

describe('money / labels', () => {
  it('formats rupees with thousands separators', () => {
    expect(money(0)).toBe('Rs 0');
    expect(money(1234567)).toBe('Rs 1,234,567');
    expect(money(null)).toBe('Rs 0');
    expect(money(undefined)).toBe('Rs 0');
    expect(money(NaN)).toBe('Rs 0');
  });
  it('signed money', () => {
    expect(moneyS(-500)).toBe('-Rs 500');
    expect(moneyS(1500)).toBe('Rs 1,500');
    expect(moneyS(0)).toBe('Rs 0');
  });
  it('labels and clock helpers', () => {
    expect(STATUS_LABEL.ready).toBe('Ready');
    expect(cap('pending')).toBe('Pending');
    expect(fmtClock('00:05')).toBe('12:05 AM');
    expect(fmtClock('13:30')).toBe('1:30 PM');
    expect(addClockMinutes('10:45', 30)).toBe('11:15');
    expect(addClockMinutes('23:50', 30)).toBe('23:55'); // stays on the same day
  });
});
