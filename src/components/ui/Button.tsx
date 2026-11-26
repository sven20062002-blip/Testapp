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
  primary: 'bg-accent text-accent-fg hover:brightness-105 active:brightness-95',
  secondary: 'bg-elevated text-fg hover:bg-line',
  ghost: 'text-fg hover:bg-elevated',
  danger: 'bg-bad/12 text-bad hover:bg-bad/20',
  outline: 'border border-line text-fg hover:bg-elevated',
};
const sizes: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-[12.5px] gap-1.5 rounded-full',
  md: 'h-11 px-5 text-[14px] gap-2 rounded-full',
  lg: 'h-12 px-6 text-[14px] gap-2 rounded-full',
  xl: 'h-14 px-7 text-[15px] gap-2.5 rounded-full',
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
        'inline-flex select-none items-center justify-center font-semibold tracking-[-0.01em] transition active:scale-[.98] disabled:pointer-events-none disabled:opacity-40',
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
        'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition active:scale-95 disabled:opacity-40',
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
