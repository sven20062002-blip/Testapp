import clsx from 'clsx';
import type { ReactNode } from 'react';
import type { Area } from './PageHeader';

export function Stat({ label, value, sub, icon, className, area }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode; className?: string; area?: Area }) {
  return (
    <div className={clsx('card p-4', className)}>
      <div className="flex items-center gap-2 text-muted">
        {icon && <span className={clsx('chip h-6 w-6 rounded-lg', `chip-${area ?? 'train'}`)}>{icon}</span>}
        <span className="text-[12px] font-medium">{label}</span>
      </div>
      <div className="num mt-2.5 text-[24px] font-bold leading-none tracking-[-0.02em]">{value}</div>
      {sub && <div className="mt-1.5 text-[12px] text-subtle">{sub}</div>}
    </div>
  );
}
