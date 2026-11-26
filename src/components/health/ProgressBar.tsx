import { useEffect, useState } from 'react';
import clsx from 'clsx';
import type { Area } from '@/components/ui/PageHeader';

export function ProgressBar({ value, max, className, tone, area }: { value: number; max: number; className?: string; tone?: 'good' | 'warn' | 'bad'; area?: Area }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  // fills up from 0 when it appears, afterwards glides to new values
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(pct));
    return () => cancelAnimationFrame(id);
  }, [pct]);
  return (
    <div className={clsx('h-2 overflow-hidden rounded-full bg-elevated', className)} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemax={Math.round(max)}>
      <div
        className={clsx(
          'h-full rounded-full transition-[width] duration-700 ease-[cubic-bezier(.2,.9,.25,1)]',
          tone === 'good' && 'bg-good',
          tone === 'warn' && 'bg-warn',
          tone === 'bad' && 'bg-bad',
          !tone && (area ? `bg-area-${area}` : 'bg-accent'),
        )}
        style={{ width: `${shown}%` }}
      />
    </div>
  );
}
