import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useDebounced } from '../lib/useDebounced';

describe('useDebounced', () => {
  it('returns the initial value immediately', () => {
    expect(renderHook(() => useDebounced('a', 300)).result.current).toBe('a');
  });
  it('only updates after the delay and coalesces rapid changes', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ v }) => useDebounced(v, 300), { initialProps: { v: 'a' } });
    rerender({ v: 'ab' });
    act(() => { vi.advanceTimersByTime(200); });
    rerender({ v: 'abc' });
    act(() => { vi.advanceTimersByTime(299); });
    expect(result.current).toBe('a');
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current).toBe('abc');
  });
  it('does not fire after unmount', () => {
    vi.useFakeTimers();
    const { rerender, unmount } = renderHook(({ v }) => useDebounced(v, 300), { initialProps: { v: 1 } });
    rerender({ v: 2 });
    unmount();
    expect(() => act(() => { vi.advanceTimersByTime(500); })).not.toThrow();
  });
  it('default delay is 300ms', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ v }) => useDebounced(v), { initialProps: { v: 'x' } });
    rerender({ v: 'y' });
    act(() => { vi.advanceTimersByTime(299); });
    expect(result.current).toBe('x');
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current).toBe('y');
  });
});
