/** Access token lives in memory only (never localStorage). */
let token: string | null = null;
const listeners = new Set<() => void>();

export const getToken = () => token;
export const setToken = (t: string | null) => {
  token = t;
};
export const onForcedLogout = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
export const emitForcedLogout = () => listeners.forEach((f) => f());
