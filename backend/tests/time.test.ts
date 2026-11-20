import { describe, expect, it } from 'vitest';
import { addDays, fromKarachi, hhmm, karachiParts, startOfDay, startOfMonth, startOfWeek, ymd } from '../src/utils/time';

describe('Asia/Karachi time helpers', () => {
  it('maps a UTC instant to Karachi wall-clock (UTC+5)', () => {
    const d = new Date('2025-03-10T20:30:00Z'); // 01:30 on the 11th in Karachi
    expect(ymd(d)).toBe('2025-03-11');
    expect(hhmm(d)).toBe('01:30');
  });
  it('startOfDay returns Karachi midnight as UTC instant', () => {
    expect(startOfDay(new Date('2025-03-10T20:30:00Z')).toISOString()).toBe('2025-03-10T19:00:00.000Z');
  });
  it('week starts Monday', () => {
    // Sunday 2025-03-09 in Karachi -> week began Monday 03-03
    expect(ymd(startOfWeek(new Date('2025-03-09T10:00:00Z')))).toBe('2025-03-03');
    expect(ymd(startOfWeek(new Date('2025-03-10T10:00:00Z')))).toBe('2025-03-10');
  });
  it('startOfMonth handles offsets across years', () => {
    expect(ymd(startOfMonth(new Date('2025-01-15T00:00:00Z'), -1))).toBe('2024-12-01');
    expect(ymd(startOfMonth(new Date('2025-12-15T00:00:00Z'), 1))).toBe('2026-01-01');
  });
  it('fromKarachi round trips', () => {
    const d = fromKarachi(2025, 5, 7, 14, 5);
    expect(karachiParts(d)).toMatchObject({ y: 2025, m: 5, d: 7, h: 14, min: 5 });
    expect(addDays(d, 1).getTime() - d.getTime()).toBe(86_400_000);
  });
});
