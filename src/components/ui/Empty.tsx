import type { ReactNode } from 'react';

export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center animate-rise">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-elevated text-muted">{icon}</div>
      <h3 className="text-base font-bold">{title}</h3>
      {text && <p className="mt-1.5 max-w-xs text-sm text-muted">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
