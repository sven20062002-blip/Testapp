import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { X } from 'lucide-react';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg' | 'full';
  /** keeps content height fixed (good for searchable lists) */
  tall?: boolean;
}

/** Bottom sheet on phones, centered dialog on larger screens. */
export function Sheet({ open, onClose, title, children, footer, size = 'md', tall }: SheetProps) {
  const panel = useRef<HTMLDivElement>(null);
  // Keep the latest onClose in a ref: parents often pass a new inline function on every
  // render (e.g. while a timer ticks). The open/close effect must only depend on `open`,
  // otherwise it re-runs on each render and steals focus from inputs inside the sheet.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseRef.current();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const prevFocus = document.activeElement as HTMLElement | null;
    // focus the dialog once when it opens – unless something inside already took focus (autoFocus)
    const t = setTimeout(() => {
      if (panel.current && !panel.current.contains(document.activeElement)) panel.current.focus({ preventScroll: true });
    }, 30);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      prevFocus?.focus?.({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 animate-fade-in bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className={clsx(
          'relative flex w-full flex-col overflow-hidden rounded-t-[28px] bg-surface shadow-2xl outline-none animate-slide-up sm:rounded-3xl sm:animate-pop',
          size === 'md' && 'sm:max-w-md',
          size === 'lg' && 'sm:max-w-xl',
          size === 'full' && 'sm:max-w-2xl',
          tall ? 'h-[88dvh] sm:h-[80vh]' : 'max-h-[90dvh]',
        )}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line sm:hidden" />
        {title != null && (
          <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-3 sm:pt-5">
            <h2 className="text-[18px] font-semibold tracking-[-0.01em]">{title}</h2>
            <button
              onClick={onClose}
              aria-label="Schließen"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-elevated text-muted hover:text-fg"
            >
              <X size={18} />
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
        {footer && <div className="px-5 pb-[calc(var(--safe-bottom)+16px)] pt-3 sm:pb-4">{footer}</div>}
        {!footer && <div className="pb-safe" />}
      </div>
    </div>,
    document.body,
  );
}
