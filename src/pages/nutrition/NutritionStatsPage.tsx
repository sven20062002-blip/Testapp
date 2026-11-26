import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Scale, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { db } from '@/db/db';
import type { FoodLogEntry } from '@/db/types';
import { PageHeader, SectionTitle } from '@/components/ui/PageHeader';
import { Segmented } from '@/components/ui/Segmented';
import { Stat } from '@/components/ui/Stat';
import { Empty } from '@/components/ui/Empty';
import { BarTrend, LineTrend } from '@/components/charts/Charts';
import { useHealthContext, useProfile } from '@/hooks/useHealth';
import { useLatestWeight, useTargets } from '@/components/nutrition/shared';
import { energyPlan, entryNutrients, expectedWeeklyChange, sumNutrients, GOAL_LABELS, type Totals } from '@/nutrition/calc';
import { addDays, dayKey, dayLabel, lastNDays, relativeDayKey } from '@/lib/day';
import { fmtNumber } from '@/lib/units';
import { valueOn } from '@/health/merge';

type Range = 7 | 30 | 90;

export default function NutritionStatsPage() {
  const [range, setRange] = useState<Range>(30);
  const today = dayKey();
  const entries = useLiveQuery(() => db.foodLog.where('date').between(addDays(today, -97), today, true, true).toArray(), [today]);
  const targets = useTargets(today);
  const profile = useProfile();
  const w = useLatestWeight();
  const ctx = useHealthContext(120);
  const [cmpA, setCmpA] = useState(today);
  const [cmpB, setCmpB] = useState(addDays(today, -1));

  const byDay = useMemo(() => {
    const m = new Map<string, FoodLogEntry[]>();
    for (const e of entries ?? []) m.set(e.date, [...(m.get(e.date) ?? []), e]);
    const t = new Map<string, Totals>();
    for (const [d, list] of m) t.set(d, sumNutrients(list.map(entryNutrients)));
    return t;
  }, [entries]);

  const days = lastNDays(range, today);
  const logged = days.filter((d) => byDay.has(d));
  const avg = (k: 'kcal' | 'protein' | 'carbs' | 'fat') => (logged.length ? logged.reduce((a, d) => a + byDay.get(d)![k], 0) / logged.length : 0);
  const avgKcal = avg('kcal');
  const avgP = avg('protein');
  const avgC = avg('carbs');
  const avgF = avg('fat');
  const macroKcal = avgP * 4 + avgC * 4 + avgF * 9;

  const weeks = useMemo(() => {
    const out: { label: string; days: number; kcal: number; protein: number; carbs: number; fat: number }[] = [];
    for (let i = 0; i < Math.ceil(range / 7); i++) {
      const ds = lastNDays(7, addDays(today, -7 * i)).filter((d) => byDay.has(d));
      const a = (k: 'kcal' | 'protein' | 'carbs' | 'fat') => (ds.length ? ds.reduce((s, d) => s + byDay.get(d)![k], 0) / ds.length : 0);
      out.push({ label: i === 0 ? 'Letzte 7 Tage' : `Vor ${i} Wo.`, days: ds.length, kcal: a('kcal'), protein: a('protein'), carbs: a('carbs'), fat: a('fat') });
    }
    return out;
  }, [byDay, range, today]);

  // weight trend: linear regression over merged weight_kg in last 6 weeks
  const weightTrend = useMemo(() => {
    if (!ctx.loaded) return null;
    const pts: [number, number][] = [];
    lastNDays(42, today).forEach((d, i) => {
      const v = valueOn(ctx.merged, 'weight_kg', d)?.value;
      if (v != null) pts.push([i, v]);
    });
    if (pts.length < 3 || pts[pts.length - 1][0] - pts[0][0] < 14) return null;
    const n = pts.length;
    const mx = pts.reduce((a, p) => a + p[0], 0) / n;
    const my = pts.reduce((a, p) => a + p[1], 0) / n;
    const slope = pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0) / pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0);
    return { perWeek: slope * 7, points: n };
  }, [ctx, today]);

  const plan = energyPlan(profile, w.kg);
  const expected = plan && logged.length >= 5 ? expectedWeeklyChange(avgKcal - plan.tdee) : null;
  const goalDir = profile.goal === 'fatloss' ? -1 : profile.goal === 'muscle' ? 1 : 0;

  if (!entries) return <div className="page" />;
  return (
    <div className="page">
      <PageHeader back="/nutrition" title="Ernährungsstatistik" />
      <Segmented
        value={String(range) as '7' | '30' | '90'}
        onChange={(v) => setRange(Number(v) as Range)}
        options={[
          { value: '7', label: '7 Tage' },
          { value: '30', label: '30 Tage' },
          { value: '90', label: '90 Tage' },
        ]}
        label="Zeitraum"
      />

      {logged.length === 0 ? (
        <Empty icon={<Scale size={28} />} title="Keine Einträge im Zeitraum" text="Erfasse Mahlzeiten im Tagebuch, um Durchschnittswerte und Verläufe zu sehen." />
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <Stat label="Ø Kalorien" value={`${fmtNumber(avgKcal, 0)} kcal`} sub={targets.kcal ? `Ziel ${fmtNumber(targets.kcal, 0)} kcal` : undefined} />
            <Stat label="Ø Protein" value={`${fmtNumber(avgP, 0)} g`} sub={targets.protein ? `Ziel ${fmtNumber(targets.protein, 0)} g` : undefined} />
            <Stat label="Erfasste Tage" value={`${logged.length} / ${range}`} sub="Durchschnitt nur über erfasste Tage" />
            <Stat label="Tage im Kalorienziel" value={targets.kcal ? `${logged.filter((d) => Math.abs(byDay.get(d)!.kcal - targets.kcal!) <= targets.kcal! * 0.1).length}` : '–'} sub="± 10 %" />
          </div>

          <SectionTitle>Kalorien pro Tag</SectionTitle>
          <div className="card p-3.5">
            <BarTrend color="food" data={days.map((d) => ({ label: dayLabel(d), value: byDay.get(d)?.kcal != null ? Math.round(byDay.get(d)!.kcal) : null }))} fmt={(v) => `${fmtNumber(v)} kcal`} />
            {targets.kcal && <p className="mt-2 text-[11.5px] text-muted">Tagesziel: {fmtNumber(targets.kcal, 0)} kcal</p>}
          </div>

          <SectionTitle>Protein pro Tag</SectionTitle>
          <div className="card p-3.5">
            <LineTrend color="food" data={days.map((d) => ({ label: dayLabel(d), value: byDay.get(d) ? Math.round(byDay.get(d)!.protein) : null }))} fmt={(v) => `${fmtNumber(v)} g Protein`} />
            {targets.protein && <p className="mt-2 text-[11.5px] text-muted">Tagesziel: {fmtNumber(targets.protein, 0)} g</p>}
          </div>

          <SectionTitle>Makroverteilung (Ø Energieanteil)</SectionTitle>
          <div className="card space-y-2.5 p-3.5">
            {(
              [
                ['Protein', avgP * 4],
                ['Kohlenhydrate', avgC * 4],
                ['Fett', avgF * 9],
              ] as const
            ).map(([l, k]) => {
              const pct = macroKcal ? (k / macroKcal) * 100 : 0;
              return (
                <div key={l}>
                  <div className="flex justify-between text-[12.5px]">
                    <span className="font-semibold">{l}</span>
                    <span className="num text-muted">{fmtNumber(pct, 0)} %</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-elevated">
                    <div className="h-full rounded-full bg-area-food" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          <SectionTitle>Wochenvergleich</SectionTitle>
          <div className="card overflow-x-auto p-3.5">
            <table className="num w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-[10.5px] uppercase tracking-wider text-subtle">
                  <th className="pb-2 font-bold">Woche</th>
                  <th className="pb-2 text-right font-bold">kcal</th>
                  <th className="pb-2 text-right font-bold">P</th>
                  <th className="pb-2 text-right font-bold">K</th>
                  <th className="pb-2 text-right font-bold">F</th>
                </tr>
              </thead>
              <tbody>
                {weeks.map((wk) => (
                  <tr key={wk.label} className="border-t border-line/50">
                    <td className="py-2 font-semibold">
                      {wk.label}
                      <div className="text-[10.5px] font-normal text-subtle">{wk.days} Tage erfasst</div>
                    </td>
                    <td className="py-2 text-right">{wk.days ? fmtNumber(wk.kcal, 0) : '–'}</td>
                    <td className="py-2 text-right">{wk.days ? fmtNumber(wk.protein, 0) : '–'}</td>
                    <td className="py-2 text-right">{wk.days ? fmtNumber(wk.carbs, 0) : '–'}</td>
                    <td className="py-2 text-right">{wk.days ? fmtNumber(wk.fat, 0) : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[10.5px] text-subtle">Tagesdurchschnitte (g) über die erfassten Tage der Woche.</p>
          </div>
        </>
      )}

      <SectionTitle>Tagesvergleich</SectionTitle>
      <div className="card p-3.5">
        <div className="grid grid-cols-2 gap-2">
          <input type="date" className="field" value={cmpA} max={today} onChange={(e) => e.target.value && setCmpA(e.target.value)} aria-label="Erster Tag" />
          <input type="date" className="field" value={cmpB} max={today} onChange={(e) => e.target.value && setCmpB(e.target.value)} aria-label="Zweiter Tag" />
        </div>
        <table className="num mt-3 w-full text-[12.5px]">
          <thead>
            <tr className="text-left text-[10.5px] uppercase tracking-wider text-subtle">
              <th className="pb-2" />
              <th className="pb-2 text-right">{relativeDayKey(cmpA, today).split(',')[0]}</th>
              <th className="pb-2 text-right">{relativeDayKey(cmpB, today).split(',')[0]}</th>
              <th className="pb-2 text-right">Differenz</th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                ['Kalorien', 'kcal', 'kcal'],
                ['Protein', 'protein', 'g'],
                ['Kohlenhydrate', 'carbs', 'g'],
                ['Fett', 'fat', 'g'],
              ] as const
            ).map(([l, k, u]) => {
              const a = byDay.get(cmpA)?.[k];
              const b = byDay.get(cmpB)?.[k];
              return (
                <tr key={k} className="border-t border-line/50">
                  <td className="py-2 font-semibold">{l}</td>
                  <td className="py-2 text-right">{a == null ? '–' : `${fmtNumber(a, 0)} ${u}`}</td>
                  <td className="py-2 text-right">{b == null ? '–' : `${fmtNumber(b, 0)} ${u}`}</td>
                  <td className="py-2 text-right text-muted">{a == null || b == null ? '–' : `${a - b >= 0 ? '+' : '−'}${fmtNumber(Math.abs(a - b), 0)}`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {(byDay.get(cmpA) == null || byDay.get(cmpB) == null) && <p className="mt-2 text-[10.5px] text-subtle">Hinweis: Tage ohne Einträge werden als „–“ angezeigt (Daten der letzten ~3 Monate).</p>}
      </div>

      <SectionTitle>Gewicht & Ziel</SectionTitle>
      <div className="card space-y-2 p-3.5 text-[12.5px]">
        <p>
          Ziel: <b>{GOAL_LABELS[profile.goal]}</b>
          {profile.goalWeightKg != null && w.kg != null && (
            <>
              {' '}
              · Zielgewicht {fmtNumber(profile.goalWeightKg, 1)} kg (noch {fmtNumber(Math.abs(w.kg - profile.goalWeightKg), 1)} kg)
            </>
          )}
        </p>
        {weightTrend ? (
          <p className="flex items-center gap-2">
            {weightTrend.perWeek < -0.05 ? <TrendingDown size={16} /> : weightTrend.perWeek > 0.05 ? <TrendingUp size={16} /> : <Minus size={16} />}
            Gewichtstrend (6 Wochen): <b className="num">{weightTrend.perWeek >= 0 ? '+' : '−'}{fmtNumber(Math.abs(weightTrend.perWeek), 2)} kg/Woche</b>
          </p>
        ) : (
          <p className="text-muted">Für einen Gewichtstrend werden mindestens 3 Messungen über 2 Wochen benötigt (Gewichtsverlauf).</p>
        )}
        {weightTrend && (
          <p className={goalDir === 0 ? 'text-muted' : Math.sign(weightTrend.perWeek) === goalDir && Math.abs(weightTrend.perWeek) > 0.05 ? 'font-semibold text-good' : 'font-semibold text-warn'}>
            {goalDir === 0
              ? Math.abs(weightTrend.perWeek) <= 0.15
                ? 'Gewicht stabil – passt zu deinem Ziel.'
                : 'Gewicht verändert sich, obwohl dein Ziel „halten“ ist – ggf. Kalorienziel anpassen.'
              : Math.sign(weightTrend.perWeek) === goalDir && Math.abs(weightTrend.perWeek) > 0.05
                ? 'Die Entwicklung passt zu deinem Ernährungsziel.'
                : 'Die Entwicklung passt noch nicht zu deinem Ernährungsziel – prüfe Kalorienziel und Erfassung.'}
          </p>
        )}
        {expected != null && (
          <p className="text-[11.5px] text-muted">
            Rechnerisch erwartet (Ø {fmtNumber(avgKcal, 0)} kcal vs. geschätztem Bedarf {fmtNumber(plan!.tdee, 0)} kcal): {expected >= 0 ? '+' : '−'}
            {fmtNumber(Math.abs(expected), 2)} kg/Woche. Schätzwert (7.700 kcal ≈ 1 kg) – unvollständige Erfassung verfälscht das Ergebnis.
          </p>
        )}
      </div>
    </div>
  );
}
