import type { HealthMetric, HealthSourceId } from '@/db/types';
import { SOURCE_META } from '@/health/meta';

const KIND = { measured: 'gemessen', estimated: 'geschätzt', manual: 'manuell' } as const;

/** Transparent origin of a value: source + measured / estimated / manual. */
export function SourceBadge({ m, source, calc }: { m?: Pick<HealthMetric, 'source' | 'kind'>; source?: HealthSourceId; calc?: boolean }) {
  if (calc) return <span className="text-[10.5px] text-subtle">eigene Berechnung</span>;
  const s = m?.source ?? source;
  if (!s) return null;
  return (
    <span className="text-[10.5px] text-subtle">
      {SOURCE_META[s].short}
      {m ? ` · ${KIND[m.kind]}` : ''}
    </span>
  );
}
