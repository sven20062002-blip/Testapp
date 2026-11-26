import clsx from 'clsx';
import type { ReactNode } from 'react';

export function Stat({ label, value, sub, icon, className }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <div className={clsx('card p-4', className)}>
      <div className="flex items-center gap-1.5 text-muted">
        {icon}
        <span className="text-[12px] font-semibold">{label}</span>
      </div>
      <div className="num mt-1.5 text-[22px] font-extrabold leading-none tracking-tight">{value}</div>
      {sub && <div className="mt-1 text-[12px] text-subtle">{sub}</div>}
    </div>
  );
}
