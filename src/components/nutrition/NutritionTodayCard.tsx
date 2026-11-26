import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Utensils } from 'lucide-react';
import { dayKey } from '@/lib/day';
import { fmtNumber } from '@/lib/units';
import { MacroBar, dayTotals, useDayEntries, useTargets } from './shared';

/** Compact dashboard card: today's calories and macros. */
export function NutritionTodayCard({ className }: { className?: string }) {
  const today = dayKey();
  const entries = useDayEntries(today);
  const targets = useTargets(today);
  const t = useMemo(() => dayTotals(entries ?? []), [entries]);
  const left = targets.kcal != null ? targets.kcal - t.kcal : null;

  return (
    <Link to="/nutrition" className={`card block p-3.5 transition hover:border-line ${className ?? ''}`} aria-label="Ernährung heute">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-[13px] font-semibold">
          <span className="chip chip-food h-8 w-8 rounded-[10px]">
            <Utensils size={16} />
          </span>
          Ernährung
        </span>
        <ChevronRight size={16} className="text-subtle" />
      </div>
      {targets.kcal == null && !entries?.length ? (
        <div className="mt-2">
          <div className="text-[14px] font-bold">Profil ausfüllen</div>
          <p className="text-[11.5px] text-muted">Für Kalorien- und Makroziele Alter, Größe und Gewicht angeben.</p>
        </div>
      ) : (
        <>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="num text-[24px] font-bold leading-none tracking-[-0.02em]">{fmtNumber(t.kcal, 0)}</span>
            <span className="num text-[12.5px] text-muted">{targets.kcal != null ? `/ ${fmtNumber(targets.kcal, 0)} kcal` : 'kcal'}</span>
          </div>
          <div className="num mt-0.5 text-[11.5px] text-muted">
            {left == null ? 'Kein Kalorienziel' : left >= 0 ? `noch ${fmtNumber(left, 0)} kcal übrig` : `${fmtNumber(-left, 0)} kcal über dem Ziel`}
          </div>
          <div className="mt-3 space-y-2">
            <MacroBar compact label="Protein" value={t.protein} target={targets.protein} unit="g" />
            <MacroBar compact label="Kohlenhydrate" value={t.carbs} target={targets.carbs} unit="g" />
            <MacroBar compact label="Fett" value={t.fat} target={targets.fat} unit="g" />
          </div>
        </>
      )}
    </Link>
  );
}
