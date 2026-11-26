import clsx from 'clsx';
import type { ReactNode } from 'react';

export function Chip({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={clsx(
        'shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition',
        active ? 'border-accent bg-accent text-accent-fg' : 'border-line bg-surface text-muted hover:text-fg',
      )}
    >
      {children}
    </button>
  );
}

export function Badge({ children, tone = 'default', className }: { children: ReactNode; tone?: 'default' | 'accent' | 'good' | 'warn' | 'bad'; className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold',
        tone === 'default' && 'bg-elevated text-muted',
        tone === 'accent' && 'bg-accent-soft text-fg dark:text-accent',
        tone === 'good' && 'bg-good/12 text-good',
        tone === 'warn' && 'bg-warn/15 text-warn',
        tone === 'bad' && 'bg-bad/12 text-bad',
        className,
      )}
    >
      {children}
    </span>
  );
}
