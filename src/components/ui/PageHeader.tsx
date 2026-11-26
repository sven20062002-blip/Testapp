import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';

export type Area = 'train' | 'food' | 'move' | 'body' | 'social';

export function PageHeader({
  title,
  subtitle,
  actions,
  back,
  area,
  icon,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  back?: string | true;
  /** colours the small eyebrow icon in the area's accent */
  area?: Area;
  icon?: ReactNode;
}) {
  const nav = useNavigate();
  return (
    <header className="mb-6 pt-3">
      {back && (
        <button
          onClick={() => (back === true ? nav(-1) : nav(back))}
          className="-ml-2 mb-2 flex h-9 items-center gap-0.5 rounded-full pl-1 pr-3 text-[14px] font-medium text-muted transition hover:bg-elevated hover:text-fg"
        >
          <ChevronLeft size={18} /> Zurück
        </button>
      )}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          {icon && <span className={clsx('chip mb-3 h-9 w-9', area ? `chip-${area}` : 'chip-train')}>{icon}</span>}
          <h1 className="title-xl truncate">{title}</h1>
          {subtitle && <p className="mt-1 text-[14px] text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
      </div>
    </header>
  );
}

export function SectionTitle({ children, action, area }: { children: ReactNode; action?: ReactNode; area?: Area }) {
  return (
    <div className="mb-3 mt-9 flex items-center justify-between gap-3 px-0.5">
      <h2 className="flex items-center gap-2 text-[17px] font-semibold tracking-[-0.01em]">
        {area && <span className={`h-2 w-2 rounded-full bg-area-${area}`} aria-hidden />}
        {children}
      </h2>
      {action}
    </div>
  );
}
