import { useEffect, useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { useFeedback } from '@/components/ui/Feedback';
import { Field } from '@/components/exercises/ExerciseForm';
import { saveManualMetric } from '@/health/repo';
import { METRIC_META } from '@/health/meta';
import type { MetricKey } from '@/db/types';
import { addDays, dayKey } from '@/lib/day';
import { parseDecimal } from '@/lib/units';

const MANUAL_METRICS: MetricKey[] = ['weight_kg', 'body_fat_pct', 'steps', 'active_min'];

export function MetricEntrySheet({ open, onClose, metric: initial = 'weight_kg', metrics = MANUAL_METRICS }: { open: boolean; onClose: () => void; metric?: MetricKey; metrics?: MetricKey[] }) {
  const [metric, setMetric] = useState<MetricKey>(initial);
  const [date, setDate] = useState(dayKey());
  const [value, setValue] = useState('');
  const [err, setErr] = useState('');
  const { toast } = useFeedback();
  useEffect(() => {
    if (open) {
      setMetric(initial);
      setDate(dayKey());
      setValue('');
      setErr('');
    }
  }, [open, initial]);
  const meta = METRIC_META[metric];
  const save = async () => {
    const v = parseDecimal(value);
    if (v == null) return setErr('Bitte einen Wert eingeben.');
    try {
      await saveManualMetric(metric, date, metric === 'distance_m' ? v * 1000 : v);
      toast(`${meta.label} gespeichert`, 'success');
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Wert eintragen"
      footer={
        <Button variant="primary" size="lg" block onClick={save}>
          Speichern
        </Button>
      }
    >
      <div className="space-y-4">
        {metrics.length > 1 && (
          <Field label="Messwert" htmlFor="me-metric">
            <select id="me-metric" className="field" value={metric} onChange={(e) => setMetric(e.target.value as MetricKey)}>
              {metrics.map((m) => (
                <option key={m} value={m}>
                  {METRIC_META[m].label}
                </option>
              ))}
            </select>
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Datum" htmlFor="me-date">
            <input id="me-date" type="date" className="field" value={date} max={dayKey()} min={addDays(dayKey(), -3650)} onChange={(e) => setDate(e.target.value || dayKey())} />
          </Field>
          <Field label={`Wert${meta.unit ? ` (${meta.unit})` : ''}`} htmlFor="me-val">
            <input
              id="me-val"
              className="field num text-[15.5px] font-bold"
              inputMode="decimal"
              value={value}
              autoFocus
              onChange={(e) => (setValue(e.target.value.replace(/[^\d.,-]/g, '')), setErr(''))}
              onKeyDown={(e) => e.key === 'Enter' && save()}
            />
          </Field>
        </div>
        <p className="text-[11.5px] text-subtle">Manuelle Werte werden als „manuell“ gekennzeichnet. Hat eine verbundene Quelle für denselben Tag einen Messwert, entscheidet die Quellen-Reihenfolge.</p>
        {err && <p className="animate-shake text-[13px] font-medium text-bad">{err}</p>}
      </div>
    </Sheet>
  );
}
