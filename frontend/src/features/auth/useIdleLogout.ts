import { useEffect } from 'react';

export const IDLE_MS = 10 * 60 * 1000;

export function useIdleLogout(active: boolean, onIdle: () => void) {
  useEffect(() => {
    if (!active) return;
    let t = setTimeout(onIdle, IDLE_MS);
    const reset = () => { clearTimeout(t); t = setTimeout(onIdle, IDLE_MS); };
    const evs = ['click', 'keydown', 'touchstart', 'mousemove', 'scroll'] as const;
    evs.forEach((e) => document.addEventListener(e, reset, { passive: true }));
    return () => { clearTimeout(t); evs.forEach((e) => document.removeEventListener(e, reset)); };
  }, [active, onIdle]);
}
