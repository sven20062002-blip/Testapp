import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: string | true }) {
  const nav = useNavigate();
  return (
    <header className="mb-5 flex items-end justify-between gap-3 pt-2">
      <div className="min-w-0">
        {back && (
          <button
            onClick={() => (back === true ? nav(-1) : nav(back))}
            className="-ml-1.5 mb-1 flex items-center gap-0.5 text-sm font-semibold text-muted hover:text-fg"
          >
            <ChevronLeft size={18} /> Zurück
          </button>
        )}
        <h1 className="truncate text-[28px] font-extrabold leading-tight tracking-tight sm:text-[32px]">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </header>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2.5 mt-7 flex items-center justify-between px-0.5">
      <h2 className="text-[17px] font-bold tracking-tight">{children}</h2>
      {action}
    </div>
  );
}
