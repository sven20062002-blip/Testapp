import clsx from 'clsx';

export function Avatar({ name, color, size = 40, className }: { name: string; color: string; size?: number; className?: string }) {
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('') || '?';
  return (
    <span
      aria-hidden
      className={clsx('inline-flex shrink-0 items-center justify-center rounded-full font-semibold', className)}
      style={{ width: size, height: size, fontSize: size * 0.38, background: `${color}26`, color, boxShadow: `inset 0 0 0 1.5px ${color}55` }}
    >
      {initials}
    </span>
  );
}

export const AVATAR_COLORS = ['#CDFF40', '#FF5C9A', '#3DD6F5', '#FF8A3D', '#A78BFA', '#34D399', '#FACC15', '#F87171'];
