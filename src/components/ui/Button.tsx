import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import clsx from 'clsx';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'sm' | 'md' | 'lg' | 'xl';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  block?: boolean;
}

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:brightness-105 active:brightness-95 shadow-[0_6px_20px_-6px_rgb(var(--accent)/.55)]',
  secondary: 'bg-elevated text-fg hover:bg-line/70',
  ghost: 'text-fg hover:bg-elevated',
  danger: 'bg-bad/12 text-bad hover:bg-bad/20',
  outline: 'border border-line text-fg hover:bg-elevated',
};
const sizes: Record<Size, string> = {
  sm: 'h-9 px-3 text-[13px] gap-1.5 rounded-xl',
  md: 'h-11 px-4 text-[15px] gap-2 rounded-xl',
  lg: 'h-12 px-5 text-[15px] gap-2 rounded-2xl',
  xl: 'h-14 px-6 text-base gap-2.5 rounded-2xl',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, block, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={clsx(
        'inline-flex select-none items-center justify-center font-semibold transition active:scale-[.98] disabled:pointer-events-none disabled:opacity-40',
        variants[variant],
        sizes[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
});

export function IconButton({
  label,
  className,
  children,
  variant = 'ghost',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; variant?: 'ghost' | 'secondary' | 'danger' }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={clsx(
        'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition active:scale-95 disabled:opacity-40',
        variant === 'ghost' && 'text-muted hover:bg-elevated hover:text-fg',
        variant === 'secondary' && 'bg-elevated text-fg hover:bg-line/70',
        variant === 'danger' && 'text-bad hover:bg-bad/10',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
