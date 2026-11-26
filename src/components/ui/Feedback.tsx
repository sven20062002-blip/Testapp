import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { Sheet } from './Sheet';
import { Button } from './Button';
import { useSettings } from '@/hooks/useData';

type Tone = 'info' | 'success' | 'error' | 'warn';
interface Toast {
  id: number;
  text: string;
  tone: Tone;
  action?: { label: string; onClick: () => void };
}

interface ConfirmOpts {
  title: string;
  text?: string;
  confirmLabel?: string;
  danger?: boolean;
  /** if false, always ask even when user disabled confirmations */
  skippable?: boolean;
}

interface Ctx {
  toast: (text: string, tone?: Tone, action?: Toast['action']) => void;
  confirm: (o: ConfirmOpts) => Promise<boolean>;
}

const FeedbackCtx = createContext<Ctx>({ toast: () => {}, confirm: async () => true });
export const useFeedback = () => useContext(FeedbackCtx);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const settings = useSettings();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirm] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const idRef = useRef(0);

  const toast = useCallback<Ctx['toast']>((text, tone = 'info', action) => {
    const id = ++idRef.current;
    setToasts((t) => [...t.slice(-2), { id, text, tone, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 5000 : 3200);
  }, []);

  const confirm = useCallback<Ctx['confirm']>(
    (o) => {
      if (o.skippable !== false && !settings.confirmDeletes) return Promise.resolve(true);
      return new Promise((resolve) => setConfirm({ ...o, resolve }));
    },
    [settings.confirmDeletes],
  );

  const close = (v: boolean) => {
    confirmState?.resolve(v);
    setConfirm(null);
  };

  const icons = { info: Info, success: CheckCircle2, error: XCircle, warn: AlertTriangle };

  return (
    <FeedbackCtx.Provider value={{ toast, confirm }}>
      {children}
      {createPortal(
        <div
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 top-0 z-[80] flex flex-col items-center gap-2 px-4"
          style={{ paddingTop: 'calc(var(--safe-top) + 10px)' }}
        >
          {toasts.map((t) => {
            const I = icons[t.tone];
            return (
              <div
                key={t.id}
                role="status"
                className={clsx(
                  'flex max-w-md items-center gap-2.5 rounded-2xl border border-line bg-surface/95 px-4 py-3 text-sm font-medium shadow-2xl backdrop-blur animate-rise',
                  t.action ? 'pointer-events-auto' : 'pointer-events-none',
                )}
              >
                <I
                  size={18}
                  className={clsx(
                    'shrink-0',
                    t.tone === 'success' && 'text-good',
                    t.tone === 'error' && 'text-bad',
                    t.tone === 'warn' && 'text-warn',
                    t.tone === 'info' && 'text-info',
                  )}
                />
                <span>{t.text}</span>
                {t.action && (
                  <button
                    className="ml-1 font-bold text-accent dark:text-accent"
                    onClick={() => {
                      t.action!.onClick();
                      setToasts((x) => x.filter((y) => y.id !== t.id));
                    }}
                  >
                    {t.action.label}
                  </button>
                )}
              </div>
            );
          })}
        </div>,
        document.body,
      )}
      <Sheet
        open={!!confirmState}
        onClose={() => close(false)}
        title={confirmState?.title}
        footer={
          <div className="flex gap-2">
            <Button block size="lg" onClick={() => close(false)}>
              Abbrechen
            </Button>
            <Button block size="lg" variant={confirmState?.danger ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus>
              {confirmState?.confirmLabel ?? 'Bestätigen'}
            </Button>
          </div>
        }
      >
        {confirmState?.text && <p className="text-[15px] text-muted">{confirmState.text}</p>}
      </Sheet>
    </FeedbackCtx.Provider>
  );
}
