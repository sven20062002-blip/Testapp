import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight, Dumbbell, Footprints, Utensils, Link2, RefreshCw, Scale } from 'lucide-react';
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
import { dayTotals, useDayEntries, useTargets } from '@/components/nutrition/shared';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';

/**
 * Central daily overview: TRAINING · ERNÄHRUNG · AKTIVITÄT · KÖRPER.
 * Everything links to the detailed area; missing data is shown as "–", never invented.
 */
/** Shared data of the daily widgets (training, activity, body, energy). Missing data stays null – never invented. */
function useToday() {
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

  return { training, settings, profile, steps, v, weight, weightDay, weight30, plan, measuredTotal, lastSync };
}

/** Last workout, this week and the next plan in rotation. */
export function TrainingWidget({ compact }: { compact?: boolean }) {
  const d = useToday();
  if (!d) return null;
  const { training, settings } = d;
  if (compact)
    return (
      <Link to="/workout" className="card block h-full p-3.5">
        <Head area="train" icon={<Dumbbell size={15} />} title="Training" />
        <div className="num mt-2.5 text-[21px] font-bold leading-tight tracking-[-0.02em]">
          <AnimatedNumber value={training.weekCount} />
          <span className="text-[12px] font-semibold text-subtle"> / {settings.weeklyGoal}</span>
        </div>
        <div className="text-[10.5px] text-muted">Workouts diese Woche</div>
        <ProgressBar className="mt-1.5" value={training.weekCount} max={settings.weeklyGoal} area="train" tone={training.weekCount >= settings.weeklyGoal ? 'good' : undefined} />
        <div className="mt-2 truncate text-[10.5px] text-muted">{training.last ? `${training.last.name} · ${relativeDay(training.last.startedAt).toLowerCase()}` : 'Noch kein Workout'}</div>
      </Link>
    );
  return (
    <>
      {/* TRAINING */}
      <Link to="/workout" className="card block p-3.5">
        <Head area="train" icon={<Dumbbell size={15} />} title="Training" />
        {training.last ? (
          <>
            <div className="mt-2 truncate text-[14px] font-semibold">{training.last.name}</div>
            <div className="num text-[11.5px] text-muted">
              Letztes Workout {relativeDay(training.last.startedAt).toLowerCase()} · {formatDuration(training.last.durationSec)} · {fmtVolume(training.last.totalVolume, settings.unit, true)}
            </div>
          </>
        ) : (
          <div className="mt-1.5 text-[12.5px] text-muted">Noch kein Workout absolviert</div>
        )}
        <div className="mt-2.5 grid grid-cols-3 gap-2">
          <Mini k="Diese Woche" v={`${training.weekCount}/${settings.weeklyGoal}`} />
          <Mini k="Dauer" v={formatDuration(training.weekDur)} />
          <Mini k="Volumen" v={fmtVolume(training.weekVol, settings.unit, true)} />
        </div>
        {training.next && (
          <div className="mt-2.5 flex items-center justify-between rounded-xl bg-elevated/70 px-3 py-2 text-[11.5px]">
            <span className="text-muted">Als Nächstes (Rotation)</span>
            <span className="flex items-center gap-1.5 font-semibold">
              <span className="h-2 w-2 rounded-full" style={{ background: training.next.color }} /> {training.next.name}
            </span>
          </div>
        )}
      </Link>

    </>
  );
}

/** Today's calories and macros (+ measured or estimated energy need). */
export function NutritionWidget({ compact }: { compact?: boolean }) {
  const d = useToday();
  if (!d) return null;
  if (compact) return <NutritionCompact />;
  const { measuredTotal, plan } = d;
  return (
    <>
      {/* ERNÄHRUNG */}
      <div className="flex flex-col">
        <NutritionTodayCard className="flex-1" />
        {(measuredTotal || plan) && (
          <div className="mt-[-10px] rounded-b-2xl border border-t-0 border-line/70 bg-surface px-4 pb-3 pt-4 text-[11.5px] text-muted">
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

    </>
  );
}

function NutritionCompact() {
  const today = dayKey();
  const entries = useDayEntries(today);
  const targets = useTargets(today);
  const t = useMemo(() => dayTotals(entries ?? []), [entries]);
  return (
    <Link to="/nutrition" className="card block h-full p-3.5">
      <Head area="food" icon={<Utensils size={15} />} title="Ernährung" />
      <div className="num mt-2.5 text-[21px] font-bold leading-tight tracking-[-0.02em]">
        <AnimatedNumber value={Math.round(t.kcal)} />
        <span className="text-[12px] font-semibold text-subtle"> kcal</span>
      </div>
      <div className="text-[10.5px] text-muted">{targets.kcal != null ? `von ${fmtNumber(targets.kcal)} kcal` : 'heute gegessen'}</div>
      <ProgressBar className="mt-1.5" value={t.kcal} max={targets.kcal ?? 0} area="food" tone={targets.kcal != null && t.kcal > targets.kcal ? 'warn' : undefined} />
      <div className="num mt-2 truncate text-[10.5px] text-muted">
        P {fmtNumber(t.protein)} · K {fmtNumber(t.carbs)} · F {fmtNumber(t.fat)} g
      </div>
    </Link>
  );
}

/** Steps today vs. goal (half width). */
export function ActivityWidget(_: { compact?: boolean }) {
  const d = useToday();
  if (!d) return null;
  const { steps, profile, v } = d;
  return (
    <>
        <Link to="/activity" className="card block h-full p-3.5">
        <Head area="move" icon={<Footprints size={15} />} title="Aktivität" />
        <div className="num mt-2.5 text-[21px] font-bold leading-tight tracking-[-0.02em]">{steps != null ? <AnimatedNumber value={steps} /> : '–'}</div>
        <div className="text-[10.5px] text-muted">von {fmtNumber(profile.stepGoal)} Schritten</div>
        <ProgressBar className="mt-1.5" value={steps ?? 0} max={profile.stepGoal} area="move" tone={(steps ?? 0) >= profile.stepGoal ? 'good' : undefined} />
        <div className="num mt-2 truncate text-[10.5px] text-muted">
          {[v('distance_m') && fmtMetric('distance_m', v('distance_m')?.value), v('active_kcal') && `${fmtMetric('active_kcal', v('active_kcal')?.value, false)} kcal aktiv`].filter(Boolean).join(' · ') || 'Noch keine Aktivitätsdaten'}
        </div>
      </Link>
    </>
  );
}

/** Current weight, goal and 30-day change (half width). */
export function BodyWidget(_: { compact?: boolean }) {
  const d = useToday();
  if (!d) return null;
  const { weight, weightDay, weight30, profile, lastSync } = d;
  return (
    <>
        <Link to="/body" className="card block h-full p-3.5">
        <Head area="body" icon={<Scale size={15} />} title="Körper" extra={lastSync ? <span className="flex items-center gap-1 text-[10px] text-subtle"><RefreshCw size={10} /> {relativeDay(lastSync)}</span> : null} />
        <div className="num mt-2.5 text-[21px] font-bold leading-tight tracking-[-0.02em]">
          {weightDay && weight != null ? <AnimatedNumber value={weight} digits={1} /> : '–'}
          <span className="text-[12px] font-semibold text-subtle"> kg</span>
        </div>
        <div className="text-[10.5px] text-muted">{weightDay ? `gewogen ${relativeDay(new Date(`${weightDay}T12:00:00`).getTime()).toLowerCase()}` : 'Aktuelles Gewicht'}</div>
        <div className="num mt-3.5 truncate text-[10.5px] text-muted">
          {[
            profile.goalWeightKg != null && `Ziel ${fmtNumber(profile.goalWeightKg, 1)} kg`,
            weight30 != null && weight != null && `${weight - weight30 > 0 ? '+' : weight - weight30 < 0 ? '−' : '±'}${fmtNumber(Math.abs(weight - weight30), 1)} in 30 T.`,
          ]
            .filter(Boolean)
            .join(' · ') || 'Noch kein Verlauf'}
        </div>
      </Link>
    </>
  );
}

/** Hint to connect a data source when neither steps nor weight exist (shown below the activity/body widgets). */
export function HealthHint() {
  const d = useToday();
  if (!d) return null;
  const { steps, weightDay } = d;
  return (
    <>
      {!steps && !weightDay && (
        <Link to="/health/sources" className="flex items-center justify-between rounded-2xl border border-dashed border-line px-3.5 py-2.5 text-[11.5px] text-muted">
          <span className="flex items-center gap-2">
            <Link2 size={16} /> Apple Health importieren oder Werte eintragen, um Schritte und Gewicht zu sehen
          </span>
          <ChevronRight size={16} />
        </Link>
      )}
    </>
  );
}

function Head({ icon, title, extra, area }: { icon: React.ReactNode; title: string; extra?: React.ReactNode; area: 'train' | 'food' | 'move' | 'body' }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-[13px] font-semibold">
        <span className={`chip chip-${area} h-7 w-7 rounded-[9px]`}>{icon}</span> {title}
      </span>
      {extra ?? <ChevronRight size={16} className="text-subtle" />}
    </div>
  );
}

function Mini({ k, v, icon }: { k: string; v: string; icon?: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl bg-elevated/60 px-2.5 py-1.5">
      <div className="num truncate text-[13px] font-semibold">{v}</div>
      <div className="flex items-center gap-1 truncate text-[10px] text-muted">
        {icon}
        {k}
      </div>
    </div>
  );
}
