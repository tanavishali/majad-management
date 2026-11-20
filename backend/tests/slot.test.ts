import { describe, expect, it } from 'vitest';
import { nextFreeSlot, orderCode, slotWindow, tooClose, toSlotConflict } from '../src/modules/orders/slot';

const t = new Date('2025-03-10T10:00:00Z');
const plus = (min: number) => new Date(t.getTime() + min * 60_000);

describe('slot', () => {
  it('window is +-30 minutes', () => {
    const w = slotWindow(t);
    expect(w.from).toEqual(plus(-30));
    expect(w.to).toEqual(plus(30));
  });
  it('29 minutes conflicts, exactly 30 does not', () => {
    expect(tooClose(t, plus(29))).toBe(true);
    expect(tooClose(t, plus(-29))).toBe(true);
    expect(tooClose(t, plus(30))).toBe(false);
    expect(tooClose(t, plus(0))).toBe(true);
  });
  it('order code is 1000 + orderNo', () => {
    expect(orderCode(1)).toBe('#OD-1001');
    expect(orderCode(42)).toBe('#OD-1042');
  });
  it('builds SlotConflict payload', () => {
    expect(toSlotConflict({ orderNo: 3, cake: 'Red velvet cake', customer: { name: 'Ali' }, scheduledAt: t })).toEqual({
      orderNo: 3, code: '#OD-1003', cake: 'Red velvet cake', customer: { name: 'Ali' }, scheduledAt: t.toISOString(),
    });
  });
});

describe('nextFreeSlot', () => {
  const dayEnd = plus(600);
  it('jumps past one clashing order', () => {
    expect(nextFreeSlot(t, [plus(10)], dayEnd)).toEqual(plus(40));
  });
  it('chains over back-to-back orders', () => {
    expect(nextFreeSlot(t, [t, plus(30), plus(60)], dayEnd)).toEqual(plus(90));
  });
  it('rounds up to a 5 minute step', () => {
    expect(nextFreeSlot(t, [plus(3)], dayEnd)).toEqual(plus(35));
  });
  it('is null when the day runs out', () => {
    expect(nextFreeSlot(plus(580), [plus(590)], dayEnd)).toBeNull();
    expect(nextFreeSlot(t, [plus(590)], dayEnd)).toEqual(t); // not a clash, so the asked time is free
  });
});
