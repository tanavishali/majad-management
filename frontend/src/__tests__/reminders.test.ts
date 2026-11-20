import { describe, expect, it } from 'vitest';
import type { OrderDTO } from '@order-desk/shared';
import { dueLabel, minutesAway, pickFresh, reminderKey } from '../features/notifications/reminders';

const NOW = Date.parse('2030-03-10T10:00:00.000Z');
const at = (min: number) => new Date(NOW + min * 60_000).toISOString();
const order = (id: string, min: number): OrderDTO => ({ id, scheduledAt: at(min) } as OrderDTO);

describe('minutesAway / dueLabel', () => {
  it('rounds up to whole minutes and never goes negative', () => {
    expect(minutesAway(at(30), NOW)).toBe(30);
    expect(minutesAway(new Date(NOW + 29 * 60_000 + 1).toISOString(), NOW)).toBe(30);
    expect(minutesAway(at(0), NOW)).toBe(0);
    expect(minutesAway(at(-5), NOW)).toBe(0);
  });
  it('labels', () => {
    expect(dueLabel(0)).toBe('now');
    expect(dueLabel(1)).toBe('in 1 min');
    expect(dueLabel(45)).toBe('in 45 min');
  });
});

describe('pickFresh (announce each order once)', () => {
  it('returns every order the first time, none the second time', () => {
    const orders = [order('a', 10), order('b', 40)];
    const first = pickFresh(orders, {}, NOW);
    expect(first.fresh.map((o) => o.id)).toEqual(['a', 'b']);
    const second = pickFresh(orders, first.next, NOW + 30_000);
    expect(second.fresh).toEqual([]);
  });
  it('announces only the new order when one more enters the window', () => {
    const first = pickFresh([order('a', 10)], {}, NOW);
    const next = pickFresh([order('a', 10), order('c', 44)], first.next, NOW + 30_000);
    expect(next.fresh.map((o) => o.id)).toEqual(['c']);
  });
  it('a rescheduled order is announced again (key includes the time)', () => {
    const first = pickFresh([order('a', 10)], {}, NOW);
    const moved = { id: 'a', scheduledAt: at(25) } as OrderDTO;
    expect(reminderKey(moved)).not.toBe(reminderKey(order('a', 10)));
    expect(pickFresh([moved], first.next, NOW).fresh.map((o) => o.id)).toEqual(['a']);
  });
  it('prunes entries older than 2 days but keeps recent ones', () => {
    const old = { 'x@1': NOW - 3 * 24 * 3600_000, 'y@2': NOW - 3600_000 };
    expect(Object.keys(pickFresh([], old, NOW).next)).toEqual(['y@2']);
  });
  it('does not mutate the stored map', () => {
    const seen = { 'z@1': NOW };
    pickFresh([order('a', 5)], seen, NOW);
    expect(Object.keys(seen)).toEqual(['z@1']);
  });
});
