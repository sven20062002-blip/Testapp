import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import clsx from 'clsx';
import { db } from '@/db/db';
import type { FoodLogEntry, Nutrients } from '@/db/types';
import { useHealthContext, useProfile } from '@/hooks/useHealth';
import { dailyTargets, entryNutrients, sumNutrients, NUTRIENT_LABELS, type Targets, type Totals } from '@/nutrition/calc';
import { addDays, dayKey } from '@/lib/day';
import { valueOn } from '@/health/merge';
import { fmtNumber } from '@/lib/units';

export const fmtG = (v: number | null | undefined, d = 1) => (v == null ? 'unbekannt' : `${fmtNumber(v, v >= 100 ? 0 : d)} g`);
export const fmtKcal = (v: number | null | undefined) => (v == null ? 'unbekannt' : `${fmtNumber(v, 0)} kcal`);
export const fmtNutrient = (k: keyof Nutrients, v: number | null | undefined) => (k === 'kcal' ? fmtKcal(v) : fmtG(v, k === 'salt' ? 2 : 1));

/** Latest weight: merged tracked weight (manual/import) going back up to 180 days, else profile value */
export function useLatestWeight(): { kg: number | null; date: string | null; tracked: boolean } {
  const ctx = useHealthContext(180);
  const profile = useProfile();
  return useMemo(() => {
    if (ctx.loaded) {
      for (let i = 0; i <= 180; i++) {
        const d = addDays(dayKey(), -i);
        const m = valueOn(ctx.merged, 'weight_kg', d);
        if (m) return { kg: m.value, date: d, tracked: true };
      }
    }
    return { kg: profile.weightKg, date: null, tracked: false };
  }, [ctx, profile.weightKg]);
}

export function useTargets(date: string): Targets {
  const profile = useProfile();
  const ctx = useHealthContext(7);
  const w = useLatestWeight();
  const active = ctx.loaded ? valueOn(ctx.merged, 'active_kcal', date)?.value ?? null : null;
  return useMemo(() => dailyTargets(profile, w.kg, active), [profile, w.kg, active]);
}

export function useDayEntries(date: string): FoodLogEntry[] | undefined {
  return useLiveQuery(() => db.foodLog.where('date').equals(date).sortBy('createdAt'), [date]);
}

export function dayTotals(entries: FoodLogEntry[]): Totals {
  return sumNutrients(entries.map(entryNutrients));
}

export function MacroBar({
  label,
  value,
  target,
  unit,
  incomplete,
  compact,
}: {
  label: string;
  value: number;
  target: number | null;
  unit: string;
  incomplete?: boolean;
  compact?: boolean;
}) {
  const pct = target ? Math.min(100, (value / target) * 100) : 0;
  const over = target != null && value > target * 1.05;
  const remaining = target != null ? target - value : null;
  return (
    <div>
      <div className={clsx('flex items-baseline justify-between', compact ? 'text-[12px]' : 'text-[13px]')}>
        <span className="font-semibold">{label}</span>
        <span className="num text-muted">
          {incomplete && <span className="text-subtle">mind. </span>}
          <b className="text-fg">{fmtNumber(value, 0)}</b>
          {target != null && ` / ${fmtNumber(target, 0)}`} {unit}
        </span>
      </div>
      <div className={clsx('mt-1 overflow-hidden rounded-full bg-elevated', compact ? 'h-1.5' : 'h-2')}>
        <div className={clsx('h-full rounded-full transition-all duration-500', over ? 'bg-warn' : 'bg-accent')} style={{ width: `${target ? pct : 0}%` }} />
      </div>
      {!compact && remaining != null && (
        <div className="num mt-0.5 text-right text-[11px] text-subtle">
          {remaining >= 0 ? `noch ${fmtNumber(remaining, 0)} ${unit}` : `${fmtNumber(-remaining, 0)} ${unit} über Ziel`}
        </div>
      )}
    </div>
  );
}

/** Ring for calories */
export function KcalRing({ value, target, size = 132 }: { value: number; target: number | null; size?: number }) {
  const r = size / 2 - 9;
  const c = 2 * Math.PI * r;
  const pct = target ? Math.min(1, value / target) : 0;
  const over = target != null && value > target;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${Math.round(value)} von ${target ?? '–'} kcal`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--elevated))" strokeWidth={12} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={over ? 'rgb(var(--warn))' : 'rgb(var(--accent))'}
        strokeWidth={12}
        strokeLinecap="round"
        strokeDasharray={`${c * pct} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dasharray .5s ease' }}
      />
      <text x="50%" y="46%" textAnchor="middle" className="num" style={{ fill: 'rgb(var(--fg))', fontSize: size * 0.17, fontWeight: 800 }}>
        {fmtNumber(value, 0)}
      </text>
      <text x="50%" y="62%" textAnchor="middle" style={{ fill: 'rgb(var(--subtle))', fontSize: size * 0.09, fontWeight: 600 }}>
        {target ? `von ${fmtNumber(target, 0)} kcal` : 'kcal'}
      </text>
    </svg>
  );
}

/** Table of nutrients for an amount, unknowns shown as "unbekannt" */
export function NutrientTable({ n, keys }: { n: Nutrients; keys?: (keyof Nutrients)[] }) {
  const ks = keys ?? (Object.keys(NUTRIENT_LABELS) as (keyof Nutrients)[]);
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px]">
      {ks.map((k) => (
        <div key={k} className="flex justify-between gap-2 border-b border-line/50 pb-1">
          <dt className="text-muted">{NUTRIENT_LABELS[k]}</dt>
          <dd className={clsx('num font-semibold', n[k] == null && 'font-normal italic text-subtle')}>{fmtNutrient(k, n[k])}</dd>
        </div>
      ))}
    </dl>
  );
}

export function MacroLine({ n }: { n: Nutrients }) {
  const f = (v: number | null) => (v == null ? '?' : fmtNumber(v, 0));
  return (
    <span className="num">
      P {f(n.protein)} · K {f(n.carbs)} · F {f(n.fat)}
    </span>
  );
}
