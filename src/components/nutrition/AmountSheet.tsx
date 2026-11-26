import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ExternalLink, Star } from 'lucide-react';
import clsx from 'clsx';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Chip';
import { useFeedback } from '@/components/ui/Feedback';
import type { Food, MealSlot, Nutrients } from '@/db/types';
import { NUTRIENT_KEYS, NUTRIENT_LABELS, scale } from '@/nutrition/calc';
import { MEALS, logFood, toggleFavorite } from '@/nutrition/repo';
import { parseDecimal } from '@/lib/units';
import { NutrientTable } from './shared';

export function SourceBadge({ food }: { food: Pick<Food, 'source' | 'incomplete'> }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      <Badge tone={food.source === 'off' ? 'default' : 'accent'}>{food.source === 'off' ? 'Open Food Facts' : 'Eigenes'}</Badge>
      {food.incomplete && (
        <Badge tone="warn">
          <AlertTriangle size={10} /> unvollständig
        </Badge>
      )}
    </span>
  );
}

/** Choose amount + meal for a food and add it to the diary. Nutrients are calculated live. */
export function AmountSheet({
  food,
  date,
  meal: initialMeal,
  onClose,
  onAdded,
}: {
  food: Food | null;
  date: string;
  meal: MealSlot;
  onClose: () => void;
  onAdded?: () => void;
}) {
  const { toast } = useFeedback();
  const [amount, setAmount] = useState('100');
  const [meal, setMeal] = useState<MealSlot>(initialMeal);
  const [error, setError] = useState<string | null>(null);
  const [fav, setFav] = useState(false);

  useEffect(() => {
    if (!food) return;
    setAmount(String(food.servingSize ?? 100).replace('.', ','));
    setMeal(initialMeal);
    setError(null);
    setFav(!!food.favorite);
  }, [food, initialMeal]);

  const qty = parseDecimal(amount);
  const n: Nutrients | null = useMemo(() => (food && qty ? scale(food.per100, qty) : null), [food, qty]);
  const missing = food ? NUTRIENT_KEYS.filter((k) => food.per100[k] == null) : [];

  const add = async () => {
    if (!food || qty == null) {
      setError('Bitte eine Menge eingeben.');
      return;
    }
    try {
      await logFood(date, meal, food, qty);
      toast(`${food.name} hinzugefügt`, 'success');
      onAdded?.();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const quick = [50, 100, 150, 200, ...(food?.servingSize && ![50, 100, 150, 200].includes(food.servingSize) ? [food.servingSize] : [])];

  return (
    <Sheet
      open={!!food}
      onClose={onClose}
      title={food?.name}
      size="lg"
      footer={
        <Button variant="primary" size="lg" block onClick={add} disabled={!qty}>
          Hinzufügen
        </Button>
      }
    >
      {food && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              {food.brand && <div className="truncate text-sm text-muted">{food.brand}</div>}
              <SourceBadge food={food} />
            </div>
            <button
              aria-label={fav ? 'Aus Favoriten entfernen' : 'Zu Favoriten'}
              onClick={async () => {
                await toggleFavorite(food.id);
                setFav((v) => !v);
              }}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-elevated"
            >
              <Star size={18} className={clsx(fav ? 'fill-warn text-warn' : 'text-muted')} />
            </button>
          </div>

          <div>
            <label htmlFor="amount" className="label mb-1.5 block">
              Menge ({food.unit})
            </label>
            <input
              id="amount"
              className="field num text-center text-2xl font-extrabold"
              inputMode="decimal"
              value={amount}
              autoFocus
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => (setAmount(e.target.value.replace(/[^\d.,]/g, '')), setError(null))}
              onKeyDown={(e) => e.key === 'Enter' && add()}
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {quick.map((q) => (
                <button
                  key={q}
                  onClick={() => setAmount(String(q))}
                  className={clsx('num rounded-lg px-3 py-1.5 text-[13px] font-semibold', qty === q ? 'bg-accent text-accent-fg' : 'bg-elevated')}
                >
                  {q === food.servingSize ? `1 Portion (${q} ${food.unit})` : `${q} ${food.unit}`}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="label mb-1.5 block">Mahlzeit</span>
            <div className="grid grid-cols-4 gap-1.5">
              {MEALS.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setMeal(m.key)}
                  className={clsx('rounded-lg py-2 text-[12px] font-semibold', meal === m.key ? 'bg-fg text-bg' : 'bg-elevated text-muted')}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-elevated/60 p-3">
            <div className="label mb-2">Nährwerte für {amount || '–'} {food.unit}</div>
            {n ? <NutrientTable n={n} /> : <p className="text-sm text-muted">Menge eingeben</p>}
            <div className="mt-3 text-[11px] text-subtle">
              Basis: pro 100 {food.unit} · {food.per100.kcal == null ? 'Kalorien unbekannt' : `${Math.round(food.per100.kcal)} kcal`}
            </div>
          </div>

          {missing.length > 0 && (
            <div className="flex gap-2 rounded-xl bg-warn/10 p-3 text-[12px]">
              <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warn" />
              <span>
                Nicht angegeben (wird nicht mitgezählt): {missing.map((k) => NUTRIENT_LABELS[k]).join(', ')}.
                {food.source === 'off' && ' Daten aus der Community-Datenbank Open Food Facts – bitte bei Bedarf mit der Verpackung abgleichen.'}
              </span>
            </div>
          )}
          {food.sourceUrl && (
            <a href={food.sourceUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[12px] font-semibold text-muted hover:text-fg">
              <ExternalLink size={12} /> Produkt auf Open Food Facts ansehen
            </a>
          )}
          {error && <p className="text-sm font-medium text-bad">{error}</p>}
        </div>
      )}
    </Sheet>
  );
}
