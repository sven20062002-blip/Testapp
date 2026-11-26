import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Calculator, RotateCcw, Scale } from 'lucide-react';
import clsx from 'clsx';
import type { Profile, Sex, NutritionGoal } from '@/db/types';
import { updateProfile } from '@/health/repo';
import { useProfile } from '@/hooks/useHealth';
import { ACTIVITY_LEVELS, GOAL_LABELS, dailyTargets, energyPlan } from '@/nutrition/calc';
import { fmtNumber, parseDecimal } from '@/lib/units';
import { dayLabel } from '@/lib/day';
import { PageHeader, SectionTitle } from '@/components/ui/PageHeader';
import { Segmented } from '@/components/ui/Segmented';
import { Button } from '@/components/ui/Button';
import { useFeedback } from '@/components/ui/Feedback';
import { useLatestWeight } from '@/components/nutrition/shared';

/** Numeric profile field that saves on blur; empty → null */
function NumField({
  label,
  value,
  unit,
  onSave,
  min,
  max,
  integer,
  placeholder,
}: {
  label: string;
  value: number | null;
  unit: string;
  onSave: (v: number | null) => Promise<void> | void;
  min: number;
  max: number;
  integer?: boolean;
  placeholder?: string;
}) {
  const { toast } = useFeedback();
  const [text, setText] = useState(value == null ? '' : String(value).replace('.', ','));
  useEffect(() => {
    setText(value == null ? '' : String(value).replace('.', ','));
  }, [value]);
  const commit = async () => {
    if (text.trim() === '') return onSave(null);
    const v = parseDecimal(text);
    if (v == null || v < min || v > max) {
      toast(`${label}: bitte einen Wert zwischen ${min} und ${max} eingeben`, 'error');
      setText(value == null ? '' : String(value).replace('.', ','));
      return;
    }
    await onSave(integer ? Math.round(v) : Math.round(v * 10) / 10);
  };
  return (
    <label className="block">
      <span className="mb-1 block text-[11.5px] font-semibold text-muted">{label}</span>
      <div className="relative">
        <input
          className="field num pr-12"
          inputMode={integer ? 'numeric' : 'decimal'}
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value.replace(/[^\d.,]/g, ''))}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          aria-label={label}
        />
        <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[12.5px] text-subtle">{unit}</span>
      </div>
    </label>
  );
}

export default function NutritionProfilePage() {
  const p = useProfile();
  const w = useLatestWeight();
  const plan = energyPlan(p, w.kg);
  const targets = dailyTargets(p, w.kg, null);
  const save = (patch: Partial<Omit<Profile, 'id'>>) => updateProfile(patch);

  return (
    <div className="page">
      <PageHeader back="/nutrition" title="Ernährungsprofil" subtitle="Grundlage für Kalorienbedarf und Makroziele" />

      <section className="card space-y-4 p-3.5">
        <div className="grid grid-cols-2 gap-3">
          <NumField label="Alter" value={p.age} unit="J." min={16} max={100} integer onSave={(v) => save({ age: v })} />
          <div>
            <span className="mb-1 block text-[11.5px] font-semibold text-muted">Geschlecht</span>
            <Segmented<Sex>
              value={(p.sex ?? '') as Sex}
              onChange={(v) => save({ sex: v })}
              options={[
                { value: 'male', label: 'Männlich' },
                { value: 'female', label: 'Weiblich' },
              ]}
              label="Geschlecht"
            />
          </div>
          <NumField label="Größe" value={p.heightCm} unit="cm" min={120} max={230} integer onSave={(v) => save({ heightCm: v })} />
          <NumField label="Zielgewicht" value={p.goalWeightKg} unit="kg" min={30} max={300} onSave={(v) => save({ goalWeightKg: v })} />
        </div>
        <div>
          {w.tracked ? (
            <div className="flex items-center gap-3 rounded-xl bg-elevated/70 px-3 py-2.5 text-[12.5px]">
              <Scale size={16} className="text-muted" />
              <span className="flex-1">
                Aktuelles Gewicht <b className="num">{fmtNumber(w.kg!, 1)} kg</b> aus dem Gewichtsverlauf ({dayLabel(w.date!)})
              </span>
              <Link to="/body" className="font-semibold text-muted hover:text-fg">
                Verlauf
              </Link>
            </div>
          ) : (
            <NumField label="Aktuelles Körpergewicht" value={p.weightKg} unit="kg" min={30} max={300} onSave={(v) => save({ weightKg: v })} placeholder="oder im Gewichtsverlauf eintragen" />
          )}
        </div>
      </section>

      <SectionTitle>Aktivität & Ziel</SectionTitle>
      <section className="card space-y-4 p-3.5">
        <div>
          <span className="mb-1.5 block text-[11.5px] font-semibold text-muted">Aktivitätslevel (Alltag + Training)</span>
          <div className="space-y-1.5" role="radiogroup" aria-label="Aktivitätslevel">
            {ACTIVITY_LEVELS.map((a) => (
              <button
                key={a.value}
                role="radio"
                aria-checked={p.activityLevel === a.value}
                onClick={() => save({ activityLevel: a.value })}
                className={clsx('flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left transition', p.activityLevel === a.value ? 'border-accent bg-accent-soft/50' : 'border-line')}
              >
                <span>
                  <span className="block text-[13px] font-semibold">{a.label}</span>
                  <span className="block text-[11.5px] text-muted">{a.hint}</span>
                </span>
                <span className="num text-[11.5px] text-subtle">× {String(a.value).replace('.', ',')}</span>
              </button>
            ))}
          </div>
        </div>
        <NumField label="Trainingseinheiten pro Woche" value={p.trainingDaysPerWeek} unit="×" min={0} max={14} integer onSave={(v) => save({ trainingDaysPerWeek: v ?? 0 })} />
        <div>
          <span className="mb-1.5 block text-[11.5px] font-semibold text-muted">Ernährungsziel</span>
          <div className="grid grid-cols-2 gap-1.5">
            {(Object.keys(GOAL_LABELS) as NutritionGoal[]).map((g) => (
              <button key={g} onClick={() => save({ goal: g })} className={clsx('rounded-xl py-2.5 text-[12.5px] font-semibold', p.goal === g ? 'bg-fg text-bg' : 'bg-elevated text-muted')}>
                {GOAL_LABELS[g]}
              </button>
            ))}
          </div>
        </div>
      </section>

      <SectionTitle>Kalorienbedarf</SectionTitle>
      <section className="card p-3.5">
        {plan ? (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                ['Grundumsatz', plan.bmr],
                ['Gesamtbedarf', plan.tdee],
                ['Kalorienziel', plan.target],
              ].map(([l, v]) => (
                <div key={l as string} className="rounded-xl bg-elevated/70 p-2.5">
                  <div className="num text-[16.5px] font-bold">{fmtNumber(v as number, 0)}</div>
                  <div className="text-[10.5px] text-muted">{l} (kcal)</div>
                </div>
              ))}
            </div>
            <ul className="mt-3 space-y-1 text-[11.5px] text-muted">
              {plan.explanation.map((e) => (
                <li key={e} className="flex gap-1.5">
                  <Calculator size={12} className="mt-0.5 shrink-0" /> {e}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[10.5px] text-subtle">
              Schätzwerte nach der Mifflin-St-Jeor-Formel. Der tatsächliche Bedarf kann individuell abweichen – beobachte deinen Gewichtsverlauf und passe die Ziele an.
            </p>
          </>
        ) : (
          <p className="text-[13px] text-muted">Gib Alter, Geschlecht, Größe und Gewicht ein, um deinen Bedarf zu berechnen.</p>
        )}
      </section>

      <SectionTitle>Tagesziele</SectionTitle>
      <section className="card space-y-3 p-3.5">
        <TargetRow label="Kalorien" unit="kcal" manual={p.kcalTarget} calc={plan?.target ?? null} onSave={(v) => save({ kcalTarget: v })} max={8000} />
        <TargetRow label="Protein" unit="g" manual={p.proteinTarget} calc={plan?.protein ?? null} onSave={(v) => save({ proteinTarget: v })} max={500} />
        <TargetRow label="Kohlenhydrate" unit="g" manual={p.carbsTarget} calc={plan?.carbs ?? null} onSave={(v) => save({ carbsTarget: v })} max={1000} />
        <TargetRow label="Fett" unit="g" manual={p.fatTarget} calc={plan?.fat ?? null} onSave={(v) => save({ fatTarget: v })} max={400} />
        <TargetRow label="Ballaststoffe" unit="g" manual={p.fiberTarget} calc={plan?.fiber ?? null} onSave={(v) => save({ fiberTarget: v })} max={150} />
        {targets.kcal != null && targets.protein != null && targets.carbs != null && targets.fat != null && (
          <p className="num text-[11.5px] text-subtle">
            Makros ergeben {fmtNumber(targets.protein * 4 + targets.carbs * 4 + targets.fat * 9, 0)} kcal (Ziel {fmtNumber(targets.kcal, 0)} kcal).
          </p>
        )}
      </section>

      <SectionTitle>Kalorienbudget</SectionTitle>
      <section className="card space-y-3 p-3.5">
        <Segmented
          value={p.budgetMode}
          onChange={(v) => save({ budgetMode: v })}
          options={[
            { value: 'static', label: 'Fest (Schätzung)' },
            { value: 'dynamic', label: 'Mit Aktivitätsdaten' },
          ]}
          label="Kalorienbudget"
        />
        <p className="text-[11.5px] leading-relaxed text-muted">
          {p.budgetMode === 'static'
            ? 'Das Ziel basiert auf deinem Aktivitätslevel. Gemessene Aktivitätskalorien werden NICHT zusätzlich addiert – sie sind im Aktivitätsfaktor bereits enthalten (keine Doppelzählung).'
            : 'Das Ziel = Grundumsatz × 1,2 (ohne Sport) + am Tag gemessene Aktivitätskalorien (z. B. aus Apple Health) ± Zielanpassung. Ruheenergie und Gesamtverbrauch werden dabei nicht zusätzlich gezählt.'}
        </p>
        {p.budgetMode === 'dynamic' && p.kcalTarget != null && <p className="text-[11.5px] text-warn">Hinweis: Ein manuelles Kalorienziel ist gesetzt und hat Vorrang vor dem dynamischen Budget.</p>}
      </section>

      <SectionTitle>Weitere Ziele</SectionTitle>
      <section className="card p-3.5">
        <NumField label="Schrittziel" value={p.stepGoal} unit="Schritte" min={1000} max={50000} integer onSave={(v) => save({ stepGoal: v ?? 10000 })} />
      </section>
    </div>
  );
}

function TargetRow({ label, unit, manual, calc, onSave, max }: { label: string; unit: string; manual: number | null; calc: number | null; onSave: (v: number | null) => Promise<void>; max: number }) {
  return (
    <div className="flex items-end gap-2">
      <div className="flex-1">
        <NumField label={`${label}${manual == null ? ' · berechnet' : ' · manuell'}`} value={manual ?? calc} unit={unit} min={0} max={max} integer onSave={(v) => onSave(v == null || v === calc ? null : v)} placeholder="Profil ausfüllen" />
      </div>
      {manual != null && (
        <Button size="sm" className="mb-1" onClick={() => onSave(null)} icon={<RotateCcw size={13} />} disabled={calc == null}>
          Berechnung verwenden
        </Button>
      )}
    </div>
  );
}
