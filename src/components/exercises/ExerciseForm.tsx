import { useEffect, useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { useFeedback } from '@/components/ui/Feedback';
import { createExercise, updateExercise, type ExerciseInput } from '@/db/repo/exercises';
import type { Exercise, ExerciseCategory, MuscleGroup, TrackingType } from '@/db/types';
import { CATEGORY_LABELS, MUSCLE_LABELS, MUSCLE_ORDER, TRACKING_LABELS } from '@/lib/labels';

const empty: ExerciseInput = {
  nameDe: '',
  nameEn: '',
  muscleGroup: 'chest',
  secondaryMuscles: [],
  category: 'barbell',
  trackingType: 'weight_reps',
  description: '',
};

export function ExerciseForm({
  open,
  onClose,
  exercise,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  exercise?: Exercise;
  onSaved?: (id: string) => void;
}) {
  const [v, setV] = useState<ExerciseInput>(empty);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useFeedback();

  useEffect(() => {
    if (open) {
      setV(exercise ? { ...exercise } : empty);
      setError(null);
    }
  }, [open, exercise]);

  const set = <K extends keyof ExerciseInput>(k: K, val: ExerciseInput[K]) => setV((x) => ({ ...x, [k]: val }));

  const save = async () => {
    try {
      if (exercise) {
        await updateExercise(exercise.id, v);
        toast('Übung gespeichert', 'success');
        onSaved?.(exercise.id);
      } else {
        const e = await createExercise(v);
        toast(`„${e.nameDe}“ angelegt`, 'success');
        onSaved?.(e.id);
      }
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={exercise ? 'Übung bearbeiten' : 'Neue Übung'}
      size="lg"
      footer={
        <Button variant="primary" size="lg" block onClick={save}>
          Speichern
        </Button>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field label="Name (Deutsch)" htmlFor="ex-de">
          <input id="ex-de" className="field" value={v.nameDe} maxLength={60} onChange={(e) => set('nameDe', e.target.value)} placeholder="z. B. Dips" autoFocus />
        </Field>
        <Field label="Name (Englisch)" htmlFor="ex-en">
          <input id="ex-en" className="field" value={v.nameEn} maxLength={60} onChange={(e) => set('nameEn', e.target.value)} placeholder="optional" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Muskelgruppe" htmlFor="ex-mg">
            <select id="ex-mg" className="field" value={v.muscleGroup} onChange={(e) => set('muscleGroup', e.target.value as MuscleGroup)}>
              {MUSCLE_ORDER.map((m) => (
                <option key={m} value={m}>
                  {MUSCLE_LABELS[m]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Kategorie" htmlFor="ex-cat">
            <select id="ex-cat" className="field" value={v.category} onChange={(e) => set('category', e.target.value as ExerciseCategory)}>
              {Object.entries(CATEGORY_LABELS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Erfassung" htmlFor="ex-tt">
          <select id="ex-tt" className="field" value={v.trackingType} onChange={(e) => set('trackingType', e.target.value as TrackingType)}>
            {Object.entries(TRACKING_LABELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Beschreibung" htmlFor="ex-desc">
          <textarea id="ex-desc" className="field min-h-[90px] resize-y" value={v.description} onChange={(e) => set('description', e.target.value)} placeholder="Ausführung, Hinweise …" />
        </Field>
        {error && <p className="animate-shake text-[13px] font-medium text-bad">{error}</p>}
      </form>
    </Sheet>
  );
}

export function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="label mb-1.5 block">
        {label}
      </label>
      {children}
    </div>
  );
}
