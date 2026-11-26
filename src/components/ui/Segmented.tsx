import clsx from 'clsx';

/** Segmented control with a selection pill that glides to the chosen option. */
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
  const idx = options.findIndex((o) => o.value === value);
  return (
    <div role="radiogroup" aria-label={label} className={clsx('relative flex rounded-full bg-elevated p-1', className)}>
      {idx >= 0 && (
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-1 left-1 top-1 rounded-full bg-surface shadow-[0_1px_3px_rgb(0_0_0/0.12)] transition-transform duration-300 ease-[cubic-bezier(.3,1.25,.55,1)] dark:bg-line"
          style={{ width: `calc((100% - 8px) / ${options.length})`, transform: `translateX(${idx * 100}%)` }}
        />
      )}
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'relative z-[1] min-w-0 flex-1 basis-0 truncate whitespace-nowrap rounded-full font-medium transition-colors duration-200',
            size === 'sm' ? 'px-2 py-1.5 text-[11.5px]' : 'px-3 py-2 text-[12.5px]',
            value === o.value ? 'text-fg' : 'text-muted hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
