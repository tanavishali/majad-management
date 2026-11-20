import { useEffect, type ReactNode } from 'react';

/** Centered card over a dimmed backdrop. Closes on Escape and on a click outside the card. */
export function Dialog({ onClose, children, wide, label, testId }: { onClose: () => void; children: ReactNode; wide?: boolean; label: string; testId?: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={label} data-testid={testId} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`dlg${wide ? ' wide' : ''}`}>{children}</div>
    </div>
  );
}
