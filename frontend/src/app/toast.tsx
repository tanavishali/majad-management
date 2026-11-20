import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

type Kind = 'info' | 'error';
interface Ctx { toast: (message: string, kind?: Kind) => void }
const ToastCtx = createContext<Ctx>({ toast: () => {} });
export const useToast = () => useContext(ToastCtx).toast;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<{ text: string; kind: Kind; n: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const toast = useCallback((text: string, kind: Kind = 'info') => {
    clearTimeout(timer.current);
    setMsg({ text, kind, n: Date.now() });
    timer.current = setTimeout(() => setMsg(null), kind === 'error' ? 4500 : 2700);
  }, []);
  const value = useMemo(() => ({ toast }), [toast]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="toast-float" data-toast-root>
        {msg && <div role="status" data-testid="toast" data-kind={msg.kind}>{msg.text}</div>}
      </div>
    </ToastCtx.Provider>
  );
}
