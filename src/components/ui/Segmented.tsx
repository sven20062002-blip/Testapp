import clsx from 'clsx';

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
  className,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  size?: 'sm' | 'md';
  className?: string;
  label?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={clsx('flex rounded-xl bg-elevated p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'flex-1 whitespace-nowrap rounded-lg font-semibold transition',
            size === 'sm' ? 'px-2 py-1.5 text-xs' : 'px-3 py-2 text-[13px]',
            value === o.value ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
