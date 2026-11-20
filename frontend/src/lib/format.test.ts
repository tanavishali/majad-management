import { describe, expect, it } from 'vitest';
import { addDays, fmtTime, isoToKarachi, karachiToIso, mondayOf, monthEnd } from './format';

describe('Asia/Karachi conversion', () => {
  it('converts local input to a UTC ISO instant', () => {
    expect(karachiToIso('2026-03-10', '11:30')).toBe('2026-03-10T06:30:00.000Z');
    expect(karachiToIso('2026-03-10', '00:15')).toBe('2026-03-09T19:15:00.000Z');
  });
  it('round-trips', () => {
    expect(isoToKarachi(karachiToIso('2026-12-31', '23:50'))).toEqual({ date: '2026-12-31', time: '23:50' });
  });
  it('formats 12h time', () => {
    expect(fmtTime('2026-03-10T06:30:00.000Z')).toBe('11:30 AM');
    expect(fmtTime('2026-03-09T19:00:00.000Z')).toBe('12:00 AM');
  });
});

describe('date math', () => {
  it('adds days across months', () => expect(addDays('2026-02-27', 3)).toBe('2026-03-02'));
  it('finds Monday', () => {
    expect(mondayOf('2026-03-15')).toBe('2026-03-09'); // Sunday
    expect(mondayOf('2026-03-09')).toBe('2026-03-09');
  });
  it('month end', () => expect(monthEnd('2026-02-10')).toBe('2026-02-28'));
});
