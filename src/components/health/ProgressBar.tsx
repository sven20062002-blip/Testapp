import clsx from 'clsx';

export function ProgressBar({ value, max, className, tone = 'accent' }: { value: number; max: number; className?: string; tone?: 'accent' | 'good' | 'warn' | 'bad' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={clsx('h-2 overflow-hidden rounded-full bg-elevated', className)} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemax={Math.round(max)}>
      <div
        className={clsx('h-full rounded-full transition-[width] duration-500', tone === 'accent' && 'bg-accent', tone === 'good' && 'bg-good', tone === 'warn' && 'bg-warn', tone === 'bad' && 'bg-bad')}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
