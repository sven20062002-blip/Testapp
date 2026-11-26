import { useEffect, useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';
import { Field } from '@/components/exercises/ExerciseForm';
import { useFeedback } from '@/components/ui/Feedback';
import type { Food, Nutrients } from '@/db/types';
import { NUTRIENT_KEYS, NUTRIENT_LABELS } from '@/nutrition/calc';
import { saveCustomFood } from '@/nutrition/repo';
import { parseDecimal } from '@/lib/units';

type Texts = Record<keyof Nutrients, string>;
const toTexts = (n?: Nutrients): Texts =>
  Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, n?.[k] == null ? '' : String(n[k]).replace('.', ',')])) as Texts;

/** Create / edit a custom food. Empty nutrient fields stay "unknown" (null) – never 0. */
export function FoodForm({
  open,
  onClose,
  food,
  initialBarcode,
  initialName,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  food?: Food | null;
  initialBarcode?: string | null;
  initialName?: string;
  onSaved?: (f: Food) => void;
}) {
  const { toast } = useFeedback();
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [barcode, setBarcode] = useState('');
  const [unit, setUnit] = useState<'g' | 'ml'>('g');
  const [serving, setServing] = useState('');
  const [vals, setVals] = useState<Texts>(toTexts());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(food?.name ?? initialName ?? '');
    setBrand(food?.brand ?? '');
    setBarcode(food?.barcode ?? initialBarcode ?? '');
    setUnit(food?.unit ?? 'g');
    setServing(food?.servingSize ? String(food.servingSize).replace('.', ',') : '');
    setVals(toTexts(food?.per100));
    setError(null);
  }, [open, food, initialBarcode, initialName]);

  const save = async () => {
    const per100 = Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, vals[k].trim() === '' ? null : parseDecimal(vals[k])])) as unknown as Nutrients;
    for (const k of NUTRIENT_KEYS)
      if (vals[k].trim() !== '' && per100[k] == null) {
        setError(`Ungültiger Wert bei ${NUTRIENT_LABELS[k]}.`);
        return;
      }
    try {
      const f = await saveCustomFood(
        { name, brand, barcode: barcode.trim() || null, per100, unit, servingSize: serving.trim() ? parseDecimal(serving) : null },
        food?.source === 'custom' ? food.id : undefined,
      );
      toast(food?.source === 'custom' ? 'Lebensmittel gespeichert' : `„${f.name}“ angelegt`, 'success');
      onSaved?.(f);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={food?.source === 'custom' ? 'Lebensmittel bearbeiten' : 'Eigenes Lebensmittel'}
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
        <Field label="Name" htmlFor="food-name">
          <input id="food-name" className="field" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="z. B. Haferflocken" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Marke" htmlFor="food-brand">
            <input id="food-brand" className="field" value={brand} maxLength={60} onChange={(e) => setBrand(e.target.value)} placeholder="optional" />
          </Field>
          <Field label="Barcode (EAN)" htmlFor="food-ean">
            <input id="food-ean" className="field num" inputMode="numeric" value={barcode} maxLength={14} onChange={(e) => setBarcode(e.target.value.replace(/\D/g, ''))} placeholder="optional" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="label mb-1.5 block">Einheit</span>
            <Segmented value={unit} onChange={setUnit} options={[{ value: 'g', label: 'Gramm' }, { value: 'ml', label: 'Milliliter' }]} label="Einheit" />
          </div>
          <Field label={`Portion (${unit})`} htmlFor="food-serving">
            <input id="food-serving" className="field num" inputMode="decimal" value={serving} onChange={(e) => setServing(e.target.value)} placeholder="optional" />
          </Field>
        </div>
        <div>
          <span className="label mb-1.5 block">Nährwerte pro 100 {unit}</span>
          <p className="mb-2 text-[11.5px] text-subtle">Nur Kalorien sind Pflicht. Leere Felder gelten als „unbekannt“ und werden nicht als 0 gezählt.</p>
          <div className="grid grid-cols-2 gap-2.5">
            {NUTRIENT_KEYS.map((k) => (
              <label key={k} className="block">
                <span className="mb-1 block text-[11.5px] font-semibold text-muted">
                  {NUTRIENT_LABELS[k]} ({k === 'kcal' ? 'kcal' : 'g'}){k === 'kcal' && ' *'}
                </span>
                <input
                  className="field num py-2.5"
                  inputMode="decimal"
                  value={vals[k]}
                  aria-label={`${NUTRIENT_LABELS[k]} pro 100 ${unit}`}
                  onChange={(e) => setVals((v) => ({ ...v, [k]: e.target.value.replace(/[^\d.,]/g, '') }))}
                />
              </label>
            ))}
          </div>
        </div>
        {error && <p className="animate-shake text-[13px] font-medium text-bad">{error}</p>}
      </form>
    </Sheet>
  );
}
