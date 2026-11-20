import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { server } from './server';
import { setToken } from '../lib/token';

// jsdom has no <dialog> modal support.
if (typeof HTMLDialogElement !== 'undefined') {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.show = function show(this: HTMLDialogElement) { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
}
window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
if (!window.matchMedia) {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  setToken(null);
  localStorage.clear();
  vi.useRealTimers();
});
afterAll(() => server.close());
