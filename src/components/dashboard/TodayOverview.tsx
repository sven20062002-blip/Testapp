import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight, Dumbbell, Flame, Footprints, Link2, RefreshCw, Scale } from 'lucide-react';
import { db } from '@/db/db';
import { useHealthContext, useProfile, useSources } from '@/hooks/useHealth';
import { useSettings } from '@/hooks/useData';
import { valueOn } from '@/health/merge';
import { fmtMetric } from '@/health/meta';
import { energyPlan } from '@/nutrition/calc';
import { addDays, dayKey } from '@/lib/day';
import { formatDuration, relativeDay, startOfWeek } from '@/lib/time';
import { fmtNumber, fmtVolume } from '@/lib/units';
import { ProgressBar } from '@/components/health/ProgressBar';
import { NutritionTodayCard } from '@/components/nutrition/NutritionTodayCard';

/**
 * Central daily overview: TRAINING · ERNÄHRUNG · AKTIVITÄT · KÖRPER.
 * Everything links to the detailed area; missing data is shown as "–", never invented.
 */
export function TodayOverview() {
  const ctx = useHealthContext();
  const profile = useProfile();
  const settings = useSettings();
  const sources = useSources();
  const plans = useLiveQuery(() => db.plans.toArray(), []);
  const workouts = useLiveQuery(() => db.workouts.where('status').equals('completed').toArray(), []);
  const today = dayKey();

  const training = useMemo(() => {
    const ws = workouts ?? [];
    const last = [...ws].sort((a, b) => b.startedAt - a.startedAt)[0];
    const week = ws.filter((w) => w.startedAt >= startOfWeek(Date.now()));
    // suggestion: the plan that was used longest ago (simple rotation)
    const next = [...(plans ?? [])].filter((p) => p.exercises.length).sort((a, b) => (a.lastUsedAt ?? 0) - (b.lastUsedAt ?? 0))[0];
    return { last, next, weekDur: week.reduce((a, w) => a + w.durationSec, 0), weekVol: week.reduce((a, w) => a + w.totalVolume, 0), weekCount: week.length };
  }, [workouts, plans]);

  if (!ctx.loaded) return null;
  const v = (m: Parameters<typeof valueOn>[1]) => valueOn(ctx.merged, m, today);
  const steps = v('steps')?.value ?? null;
  // weight for energy estimate
  let weight: number | null = profile.weightKg;
  let weightDay: string | null = null;
  for (let i = 0; i < 60; i++) {
    const w = valueOn(ctx.merged, 'weight_kg', addDays(today, -i));
    if (w) {
      weight = w.value;
      weightDay = addDays(today, -i);
      break;
    }
  }
  // change vs. ~30 days before the latest weighing
  let weight30: number | null = null;
  if (weightDay)
    for (let i = 25; i <= 40 && weight30 == null; i++) weight30 = valueOn(ctx.merged, 'weight_kg', addDays(weightDay, -i))?.value ?? null;
  const plan = energyPlan(profile, weight);
  const measuredTotal = v('total_kcal');
  const lastSync = (sources ?? []).filter((s) => s.connected && s.id !== 'manual').reduce<number | null>((m, s) => (s.lastSyncAt && (!m || s.lastSyncAt > m) ? s.lastSyncAt : m), null);

  return (
    <div className="grid gap-2.5 sm:grid-cols-2">
      {/* TRAINING */}
      <Link to="/workout" className="card block p-4">
        <Head icon={<Dumbbell size={14} />} title="Training" />
        {training.last ? (
          <>
            <div className="mt-1.5 truncate text-[16px] font-bold">{training.last.name}</div>
            <div className="num text-[12px] text-muted">
              Letztes Workout {relativeDay(training.last.startedAt).toLowerCase()} · {formatDuration(training.last.durationSec)} · {fmtVolume(training.last.totalVolume, settings.unit, true)}
            </div>
          </>
        ) : (
          <div className="mt-1.5 text-[14px] text-muted">Noch kein Workout absolviert</div>
        )}
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Mini k="Diese Woche" v={`${training.weekCount}/${settings.weeklyGoal}`} />
          <Mini k="Dauer" v={formatDuration(training.weekDur)} />
          <Mini k="Volumen" v={fmtVolume(training.weekVol, settings.unit, true)} />
        </div>
        {training.next && (
          <div className="mt-2.5 flex items-center justify-between rounded-xl bg-elevated/70 px-3 py-2 text-[12px]">
            <span className="text-muted">Als Nächstes (Rotation)</span>
            <span className="flex items-center gap-1.5 font-semibold">
              <span className="h-2 w-2 rounded-full" style={{ background: training.next.color }} /> {training.next.name}
            </span>
          </div>
        )}
      </Link>

      {/* ERNÄHRUNG */}
      <div className="flex flex-col">
        <NutritionTodayCard className="flex-1" />
        {(measuredTotal || plan) && (
          <div className="mt-[-10px] rounded-b-2xl border border-t-0 border-line/70 bg-surface px-4 pb-3 pt-4 text-[12px] text-muted">
            {measuredTotal ? (
              <span>
                Verbrauch heute bisher: <b className="num text-fg">{fmtNumber(measuredTotal.value)} kcal</b> (gemessen, Ruhe + Aktivität)
              </span>
            ) : (
              <span>
                Geschätzter Tagesbedarf: <b className="num text-fg">{fmtNumber(plan!.tdee)} kcal</b> (Mifflin-St Jeor × Aktivität)
              </span>
            )}
          </div>
        )}
      </div>

      {/* AKTIVITÄT */}
      <Link to="/activity" className="card block p-4">
        <Head icon={<Footprints size={14} />} title="Aktivität" />
        <div className="label mt-2">Schritte heute</div>
        <div className="num text-[26px] font-extrabold leading-tight">
          {steps != null ? fmtNumber(steps) : '–'}
          <span className="text-[14px] font-semibold text-subtle"> / {fmtNumber(profile.stepGoal)}</span>
        </div>
        <ProgressBar className="mt-1.5" value={steps ?? 0} max={profile.stepGoal} tone={(steps ?? 0) >= profile.stepGoal ? 'good' : 'accent'} />
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Mini k="Distanz" v={fmtMetric('distance_m', v('distance_m')?.value)} />
          <Mini k="Aktive Min" v={fmtMetric('active_min', v('active_min')?.value, false)} />
          <Mini k="Aktiv-kcal" v={fmtMetric('active_kcal', v('active_kcal')?.value, false)} icon={<Flame size={10} />} />
        </div>
      </Link>
      {/* KÖRPER */}
      <Link to="/body" className="card block p-4">
        <Head icon={<Scale size={14} />} title="Körper" extra={lastSync ? <span className="flex items-center gap-1 text-[11px] text-subtle"><RefreshCw size={10} /> {relativeDay(lastSync)}</span> : null} />
        <div className="label mt-2">Aktuelles Gewicht</div>
        <div className="num text-[26px] font-extrabold leading-tight">
          {weightDay && weight != null ? fmtNumber(weight, 1) : '–'}
          <span className="text-[14px] font-semibold text-subtle"> kg</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Mini k="30 Tage" v={weight30 != null && weight != null ? `${weight - weight30 > 0 ? '+' : weight - weight30 < 0 ? '−' : '±'}${fmtNumber(Math.abs(weight - weight30), 1)}` : '–'} />
          <Mini k="Ziel" v={profile.goalWeightKg != null ? fmtNumber(profile.goalWeightKg, 1) : '–'} />
          <Mini k="Gemessen" v={weightDay ? relativeDay(new Date(`${weightDay}T12:00:00`).getTime()) : '–'} />
        </div>
      </Link>
      {!steps && !weightDay && (
        <Link to="/health/sources" className="flex items-center justify-between rounded-2xl border border-dashed border-line px-4 py-3 text-[13px] text-muted sm:col-span-2">
          <span className="flex items-center gap-2">
            <Link2 size={16} /> Fitbit / Google Health oder Apple Health verbinden, um Schritte und Gewicht automatisch zu übernehmen
          </span>
          <ChevronRight size={16} />
        </Link>
      )}
    </div>
  );
}

function Head({ icon, title, extra }: { icon: React.ReactNode; title: string; extra?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-muted">
        {icon} {title}
      </span>
      {extra ?? <ChevronRight size={16} className="text-subtle" />}
    </div>
  );
}

function Mini({ k, v, icon }: { k: string; v: string; icon?: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl bg-elevated/70 px-2 py-1.5">
      <div className="num truncate text-[14px] font-bold">{v}</div>
      <div className="flex items-center gap-1 truncate text-[10.5px] text-muted">
        {icon}
        {k}
      </div>
    </div>
  );
}
