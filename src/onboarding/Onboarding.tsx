import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Activity, ArrowLeft, ArrowRight, Check, Dumbbell, Flame, Footprints, HeartPulse, Pencil, Ruler, Sparkles, Target, Timer, TrendingDown, TrendingUp, User } from 'lucide-react';
import type { NutritionGoal, Sex, ThemeMode, WeightUnit } from '@/db/types';
import { updateSettings } from '@/db/repo/settings';
import { ACTIVITY_LEVELS, GOAL_LABELS, energyPlan } from '@/nutrition/calc';
import { REST_PRESETS } from '@/components/workout/TimerPanel';
import { Segmented } from '@/components/ui/Segmented';
import { Button } from '@/components/ui/Button';
import type { Area } from '@/components/ui/PageHeader';
import { Logo } from '@/components/layout/Logo';
import { onAppLeave } from '@/lib/leave';
import { formatClock } from '@/lib/time';
import { fmtNumber, parseDecimal, unitToKg, weightInputValue } from '@/lib/units';
import { STEPS, applyDraft, firstIncompleteStep, initialDraft, parsed, saveDraft, skipOnboarding, stepErrors, type OnboardingDraft, type StepId } from './model';

const STEP_META: Record<StepId, { area: Area; icon: ReactNode; title: string; text: string }> = {
  welcome: { area: 'train', icon: <Sparkles size={18} />, title: 'Willkommen bei Forge', text: 'Ein paar Angaben, damit Kalorienbedarf, Ziele und Statistiken zu dir passen. Dauert etwa eine Minute.' },
  body: { area: 'body', icon: <Ruler size={18} />, title: 'Über dich', text: 'Grundlage für Grundumsatz und Kalorienbedarf (Mifflin-St-Jeor-Formel).' },
  goal: { area: 'food', icon: <Target size={18} />, title: 'Dein Ziel', text: 'Bestimmt Kalorienüberschuss oder -defizit und deinen Proteinbedarf.' },
  training: { area: 'train', icon: <Dumbbell size={18} />, title: 'Training', text: 'Für dein Wochenziel, den Aktivitätsfaktor und die Satzpause.' },
  daily: { area: 'move', icon: <Footprints size={18} />, title: 'Alltag & Darstellung', text: 'Dein tägliches Schrittziel und wie die App aussehen soll.' },
  summary: { area: 'social', icon: <Check size={18} />, title: 'Alles bereit', text: 'Das haben wir aus deinen Angaben berechnet.' },
};

const GOAL_ICONS: Record<NutritionGoal, ReactNode> = {
  muscle: <TrendingUp size={18} />,
  fatloss: <TrendingDown size={18} />,
  maintain: <Activity size={18} />,
  fitness: <HeartPulse size={18} />,
};
const GOAL_HINTS: Record<NutritionGoal, string> = {
  muscle: 'Leichter Kalorienüberschuss',
  fatloss: 'Moderates Defizit, viel Protein',
  maintain: 'Kalorien auf Bedarf',
  fitness: 'Ausgewogen, ohne festes Ziel',
};
const STEP_GOALS = [6000, 8000, 10000, 12000, 15000];

export default function Onboarding() {
  const [d, setD] = useState<OnboardingDraft | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<OnboardingDraft | null>(null);
  ref.current = d;
  /** set while "Training starten" is being saved – leaving the app then must not re-create the draft */
  const finishing = useRef(false);

  useEffect(() => {
    let alive = true;
    void initialDraft().then((x) => alive && setD(x));
    return () => {
      alive = false;
    };
  }, []);

  // every change is kept as a draft immediately (synchronous localStorage write) …
  useEffect(() => {
    if (d && !finishing.current) saveDraft(d);
  }, [d]);

  // … and when the app is left, the valid answers are written into the database as well
  useEffect(
    () =>
      onAppLeave(() => {
        const cur = ref.current;
        if (!cur || finishing.current) return;
        saveDraft(cur);
        void applyDraft(cur).catch(() => {});
      }),
    [],
  );

  const set = useCallback((patch: Partial<OnboardingDraft>) => setD((x) => (x ? { ...x, ...patch } : x)), []);

  if (!d) return <div className="min-h-[100dvh]" />;

  const stepId = STEPS[d.step];
  const meta = STEP_META[stepId];
  const errors = stepErrors(stepId, d);
  const err = (k: string) => (showErrors ? errors[k] : undefined);

  const go = async (to: number) => {
    setShowErrors(false);
    set({ step: to });
    await applyDraft({ ...d, step: to }).catch(() => {});
    window.scrollTo(0, 0);
  };
  const next = async () => {
    if (Object.keys(errors).length) return setShowErrors(true);
    if (stepId !== 'summary') return go(d.step + 1);
    const missing = firstIncompleteStep(d);
    if (missing >= 0) {
      await go(missing);
      setShowErrors(true);
      return;
    }
    setBusy(true);
    finishing.current = true;
    try {
      await applyDraft(d, true); // sets onboardedAt → the gate switches to the app
    } catch {
      finishing.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-lg flex-col px-4 pt-[calc(env(safe-area-inset-top)+16px)]">
      {/* progress */}
      <div className="flex items-center gap-3">
        {d.step > 0 ? (
          <button onClick={() => go(d.step - 1)} className="-ml-2 grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-elevated hover:text-fg" aria-label="Zurück">
            <ArrowLeft size={18} />
          </button>
        ) : (
          <Logo size={28} />
        )}
        <div className="flex flex-1 gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={d.step + 1} aria-label="Fortschritt">
          {STEPS.map((s, i) => (
            <span key={s} className={clsx('h-1.5 flex-1 rounded-full transition-colors', i <= d.step ? `bg-area-${STEP_META[s].area}` : 'bg-elevated')} />
          ))}
        </div>
        {stepId !== 'summary' && (
          <button
            onClick={() => {
              finishing.current = true;
              void skipOnboarding(d).catch(() => (finishing.current = false));
            }}
            className="text-[12.5px] font-medium text-subtle hover:text-fg">
            Überspringen
          </button>
        )}
      </div>

      <main key={stepId} className="flex-1 animate-rise pb-6 pt-8">
        <span className={`chip chip-${meta.area} mb-4 h-11 w-11`}>{meta.icon}</span>
        <h1 className="title-xl">{meta.title}</h1>
        <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{meta.text}</p>

        <div className="mt-7 space-y-6">
          {stepId === 'welcome' && (
            <>
              <Field label="Wie dürfen wir dich nennen?" error={err('name')} optional>
                <input className="field text-[15.5px]" value={d.name} maxLength={24} placeholder="Vorname" autoComplete="given-name" onChange={(e) => set({ name: e.target.value })} aria-label="Name" />
              </Field>
              <Field label="Gewichtseinheit">
                <Segmented<WeightUnit>
                  value={d.unit}
                  onChange={(u) => set(convertUnit(d, u))}
                  options={[
                    { value: 'kg', label: 'Kilogramm (kg)' },
                    { value: 'lb', label: 'Pfund (lb)' },
                  ]}
                  label="Gewichtseinheit"
                />
              </Field>
              <p className="flex gap-2 rounded-2xl bg-elevated/70 dark:bg-surface p-3.5 text-[12.5px] leading-relaxed text-muted">
                <User size={16} className="mt-0.5 shrink-0 text-area-train" />
                Deine Angaben bleiben auf diesem Gerät und werden automatisch gespeichert – auch wenn du die App zwischendurch verlässt.
              </p>
            </>
          )}

          {stepId === 'body' && (
            <>
              <Field label="Geschlecht" error={err('sex')} hint="Nur für die Formel des Grundumsatzes">
                <Segmented<Sex>
                  value={(d.sex ?? '') as Sex}
                  onChange={(v) => set({ sex: v })}
                  options={[
                    { value: 'male', label: 'Männlich' },
                    { value: 'female', label: 'Weiblich' },
                  ]}
                  label="Geschlecht"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <NumInput label="Alter" unit="Jahre" value={d.age} onChange={(v) => set({ age: v })} error={err('age')} integer />
                <NumInput label="Größe" unit="cm" value={d.heightCm} onChange={(v) => set({ heightCm: v })} error={err('heightCm')} integer />
              </div>
              <NumInput label="Aktuelles Körpergewicht" unit={d.unit} value={d.weight} onChange={(v) => set({ weight: v })} error={err('weight')} hint="Wird auch als erster Eintrag im Gewichtsverlauf gespeichert" />
            </>
          )}

          {stepId === 'goal' && (
            <>
              <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="Ziel">
                {(Object.keys(GOAL_LABELS) as NutritionGoal[]).map((g) => (
                  <button
                    key={g}
                    role="radio"
                    aria-checked={d.goal === g}
                    onClick={() => set({ goal: g })}
                    className={clsx('rounded-2xl p-3.5 text-left ring-2 transition', d.goal === g ? 'bg-area-food/10 ring-area-food' : 'bg-elevated/70 dark:bg-surface ring-transparent')}
                  >
                    <span className={clsx('mb-2 block', d.goal === g ? 'text-area-food' : 'text-muted')}>{GOAL_ICONS[g]}</span>
                    <span className="block text-[14px] font-semibold">{GOAL_LABELS[g]}</span>
                    <span className="block text-[11.5px] leading-snug text-muted">{GOAL_HINTS[g]}</span>
                  </button>
                ))}
              </div>
              <NumInput label="Zielgewicht" unit={d.unit} value={d.goalWeight} onChange={(v) => set({ goalWeight: v })} error={err('goalWeight')} optional />
            </>
          )}

          {stepId === 'training' && (
            <>
              <Field label="Wie oft möchtest du pro Woche trainieren?" error={err('trainingDays')}>
                <div className="flex items-center justify-between rounded-2xl bg-elevated/70 dark:bg-surface p-2">
                  <RoundBtn label="Weniger" onClick={() => set({ trainingDays: Math.max(1, d.trainingDays - 1) })}>
                    −
                  </RoundBtn>
                  <span className="text-center">
                    <span className="num block text-[28px] font-bold leading-none text-area-train">{d.trainingDays}</span>
                    <span className="text-[11.5px] text-muted">Workouts / Woche</span>
                  </span>
                  <RoundBtn label="Mehr" onClick={() => set({ trainingDays: Math.min(14, d.trainingDays + 1) })}>
                    +
                  </RoundBtn>
                </div>
              </Field>
              <Field label="Aktivität im Alltag (inkl. Training)">
                <div className="space-y-1.5" role="radiogroup" aria-label="Aktivitätslevel">
                  {ACTIVITY_LEVELS.map((a) => (
                    <button
                      key={a.value}
                      role="radio"
                      aria-checked={d.activityLevel === a.value}
                      onClick={() => set({ activityLevel: a.value })}
                      className={clsx('flex w-full items-center justify-between rounded-2xl px-3.5 py-3 text-left ring-2 transition', d.activityLevel === a.value ? 'bg-area-train/10 ring-area-train' : 'bg-elevated/70 dark:bg-surface ring-transparent')}
                    >
                      <span>
                        <span className="block text-[13px] font-semibold">{a.label}</span>
                        <span className="block text-[11.5px] text-muted">{a.hint}</span>
                      </span>
                      {d.activityLevel === a.value && <Check size={16} className="text-area-train" />}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Standard-Pause zwischen Sätzen" hint="Pro Übung jederzeit änderbar">
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Satzpause">
                  {REST_PRESETS.map((s) => (
                    <button
                      key={s}
                      role="radio"
                      aria-checked={d.restSec === s}
                      onClick={() => set({ restSec: s })}
                      className={clsx('num flex h-10 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold transition', d.restSec === s ? 'bg-fg text-bg' : 'bg-elevated/70 dark:bg-surface text-muted')}
                    >
                      <Timer size={14} /> {formatClock(s * 1000)}
                    </button>
                  ))}
                </div>
              </Field>
            </>
          )}

          {stepId === 'daily' && (
            <>
              <Field label="Tägliches Schrittziel" error={err('stepGoal')}>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Schrittziel">
                  {STEP_GOALS.map((s) => (
                    <button
                      key={s}
                      role="radio"
                      aria-checked={d.stepGoal === s}
                      onClick={() => set({ stepGoal: s })}
                      className={clsx('num h-10 rounded-full px-4 text-[13px] font-semibold transition', d.stepGoal === s ? 'bg-area-move text-black' : 'bg-elevated/70 dark:bg-surface text-muted')}
                    >
                      {fmtNumber(s)}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Darstellung">
                <Segmented<ThemeMode>
                  value={d.theme}
                  onChange={(t) => {
                    set({ theme: t });
                    void updateSettings({ theme: t }); // preview right away
                  }}
                  options={[
                    { value: 'light', label: 'Hell' },
                    { value: 'dark', label: 'Dunkel' },
                    { value: 'system', label: 'System' },
                  ]}
                  label="Darstellung"
                />
              </Field>
              <p className="rounded-2xl bg-elevated/70 dark:bg-surface p-3.5 text-[12.5px] leading-relaxed text-muted">
                Schritte und Aktivitätskalorien kannst du später unter <b className="text-fg">Mehr → Datenquellen</b> aus Apple Health übernehmen oder selbst eintragen.
              </p>
            </>
          )}

          {stepId === 'summary' && <Summary d={d} onEdit={(i) => void go(i)} />}
        </div>
      </main>

      <footer className="sticky bottom-0 -mx-4 bg-gradient-to-t from-surface via-surface to-surface/0 dark:from-bg dark:via-bg dark:to-bg/0 px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-4">
        <Button variant="primary" size="xl" block onClick={() => void next()} disabled={busy} icon={stepId === 'summary' ? <Flame size={18} /> : undefined}>
          {stepId === 'welcome' ? "Los geht's" : stepId === 'summary' ? 'Training starten' : 'Weiter'}
          {stepId !== 'summary' && <ArrowRight size={18} />}
        </Button>
        {showErrors && Object.keys(errors).length > 0 && <p className="mt-2 text-center text-[12.5px] text-bad">Bitte ergänze die markierten Angaben.</p>}
      </footer>
    </div>
  );
}

/** Switching kg ⇄ lb converts what was already typed. */
function convertUnit(d: OnboardingDraft, u: WeightUnit): Partial<OnboardingDraft> {
  if (u === d.unit) return {};
  const conv = (t: string) => {
    const v = parseDecimal(t);
    return v == null ? t : weightInputValue(unitToKg(v, d.unit), u);
  };
  return { unit: u, weight: conv(d.weight), goalWeight: conv(d.goalWeight) };
}

function Summary({ d, onEdit }: { d: OnboardingDraft; onEdit: (step: number) => void }) {
  const p = parsed(d);
  const plan = energyPlan({ sex: d.sex, age: p.age, heightCm: p.heightCm, activityLevel: d.activityLevel, goal: d.goal }, p.weightKg);
  const level = ACTIVITY_LEVELS.find((a) => a.value === d.activityLevel)?.label;
  const rows: [string, string, number][] = [
    ['Name', d.name.trim() || '–', 0],
    ['Körper', `${d.sex === 'female' ? 'Weiblich' : d.sex === 'male' ? 'Männlich' : '–'} · ${p.age ?? '–'} J. · ${p.heightCm ?? '–'} cm · ${d.weight || '–'} ${d.unit}`, 1],
    ['Ziel', `${GOAL_LABELS[d.goal]}${d.goalWeight ? ` · ${d.goalWeight} ${d.unit}` : ''}`, 2],
    ['Training', `${d.trainingDays}× pro Woche · ${level} · Pause ${formatClock(d.restSec * 1000)}`, 3],
    ['Alltag', `${fmtNumber(d.stepGoal)} Schritte · ${{ dark: 'Dunkel', light: 'Hell', system: 'System' }[d.theme]}`, 4],
  ];
  return (
    <>
      {plan && (
        <section className="rounded-3xl bg-elevated/70 dark:bg-surface p-5">
          <div className="text-[11.5px] font-semibold uppercase tracking-wider text-muted">Kalorienziel pro Tag</div>
          <div className="num mt-1 text-[34px] font-bold leading-none text-area-food">
            {fmtNumber(plan.target)} <span className="text-[15.5px] font-semibold text-muted">kcal</span>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[
              ['Protein', plan.protein],
              ['Kohlenhydrate', plan.carbs],
              ['Fett', plan.fat],
            ].map(([l, v]) => (
              <div key={l} className="rounded-xl bg-surface py-2.5 dark:bg-elevated/70">
                <div className="num text-[15.5px] font-bold">{v} g</div>
                <div className="text-[10.5px] text-muted">{l}</div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[10.5px] leading-relaxed text-subtle">Schätzung nach Mifflin-St Jeor · Grundumsatz {fmtNumber(plan.bmr)} kcal · Gesamtbedarf {fmtNumber(plan.tdee)} kcal.</p>
        </section>
      )}
      <section className="divide-y divide-line/60 rounded-3xl bg-elevated/70 dark:bg-surface">
        {rows.map(([l, v, step]) => (
          <button key={l} onClick={() => onEdit(step)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left" aria-label={`${l} ändern`}>
            <span className="w-20 shrink-0 text-[12.5px] text-muted">{l}</span>
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{v}</span>
            <Pencil size={14} className="shrink-0 text-subtle" />
          </button>
        ))}
      </section>
      <p className="text-[11.5px] leading-relaxed text-subtle">Alles lässt sich später unter Einstellungen und im Ernährungsprofil ändern.</p>
    </>
  );
}

function Field({ label, children, error, hint, optional }: { label: string; children: ReactNode; error?: string; hint?: string; optional?: boolean }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-[12.5px] font-semibold text-muted">{label}</span>
        {optional && <span className="text-[11.5px] text-subtle">optional</span>}
      </div>
      {children}
      {error ? <p className="mt-1.5 text-[11.5px] font-medium text-bad">{error}</p> : hint ? <p className="mt-1.5 text-[11.5px] text-subtle">{hint}</p> : null}
    </div>
  );
}

function NumInput({ label, unit, value, onChange, error, hint, integer, optional }: { label: string; unit: string; value: string; onChange: (v: string) => void; error?: string; hint?: string; integer?: boolean; optional?: boolean }) {
  return (
    <Field label={label} error={error} hint={hint} optional={optional}>
      <div className="relative">
        <input
          className={clsx('field num pr-16 text-[15.5px]', error && 'ring-2 ring-bad/60')}
          inputMode={integer ? 'numeric' : 'decimal'}
          enterKeyHint="next"
          value={value}
          aria-label={label}
          aria-invalid={!!error}
          onChange={(e) => onChange(integer ? e.target.value.replace(/\D/g, '') : e.target.value.replace(/[^\d.,]/g, ''))}
        />
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[13px] text-subtle">{unit}</span>
      </div>
    </Field>
  );
}

function RoundBtn({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} className="grid h-12 w-12 place-items-center rounded-full bg-elevated text-[20px] font-semibold text-fg active:scale-95">
      {children}
    </button>
  );
}
