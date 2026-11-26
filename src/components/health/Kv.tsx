import type { ReactNode } from 'react';

/** Small labelled value tile. */
export function Kv({ k, v, sub }: { k: string; v: string; sub?: ReactNode }) {
  return (
    <div className="rounded-xl bg-elevated/70 px-3 py-2">
      <div className="text-[10.5px] text-muted">{k}</div>
      <div className="num text-[14px] font-bold">{v}</div>
      {sub}
    </div>
  );
}
