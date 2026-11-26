import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Globe, Loader2, Plus, ScanBarcode, Search, Star, ChefHat } from 'lucide-react';
import clsx from 'clsx';
import { db } from '@/db/db';
import type { Food, MealSlot, Recipe } from '@/db/types';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';
import { useFeedback } from '@/components/ui/Feedback';
import { searchProducts, OffError, type OffProduct } from '@/nutrition/off';
import { MEALS, logRecipe, recipePerPortion, saveOffProduct } from '@/nutrition/repo';
import { fmtNumber, parseDecimal } from '@/lib/units';
import { AmountSheet, SourceBadge } from './AmountSheet';
import { BarcodeScanner } from './BarcodeScanner';
import { FoodForm } from './FoodForm';
import { MacroLine } from './shared';

type Tab = 'recent' | 'favorites' | 'recipes';

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Add-to-diary flow: recent, favourites, local + online search, barcode scan, recipes, custom food. */
export function AddFoodSheet({ open, onClose, date, meal }: { open: boolean; onClose: () => void; date: string; meal: MealSlot }) {
  const { toast } = useFeedback();
  const foods = useLiveQuery(() => db.foods.toArray(), []);
  const recipes = useLiveQuery(() => db.recipes.orderBy('name').toArray(), []);
  const [tab, setTab] = useState<Tab>('recent');
  const [q, setQ] = useState('');
  const [online, setOnline] = useState<OffProduct[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [onlineError, setOnlineError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Food | null>(null);
  const [scan, setScan] = useState(false);
  const [custom, setCustom] = useState<{ barcode: string | null; name?: string; hint?: string } | null>(null);
  const [recipe, setRecipe] = useState<Recipe | null>(null);

  const active = useMemo(() => (foods ?? []).filter((f) => !f.deletedAt), [foods]);
  const list = useMemo(() => {
    if (q.trim()) {
      const n = norm(q.trim());
      return active.filter((f) => norm(`${f.name} ${f.brand}`).includes(n) || f.barcode === q.trim()).sort((a, b) => b.useCount - a.useCount);
    }
    if (tab === 'favorites') return active.filter((f) => f.favorite).sort((a, b) => a.name.localeCompare(b.name, 'de'));
    return active
      .filter((f) => f.lastUsedAt)
      .sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0))
      .slice(0, 40);
  }, [active, q, tab]);

  const reset = () => {
    setQ('');
    setOnline(null);
    setOnlineError(null);
  };
  const close = () => {
    reset();
    onClose();
  };

  const searchOnline = async () => {
    if (q.trim().length < 2) return;
    setSearching(true);
    setOnlineError(null);
    try {
      setOnline(await searchProducts(q.trim()));
    } catch (e) {
      setOnline(null);
      setOnlineError((e as OffError).message);
    } finally {
      setSearching(false);
    }
  };

  const pickOnline = async (p: OffProduct) => setPicked(await saveOffProduct(p));

  const mealLabel = MEALS.find((m) => m.key === meal)?.label;

  return (
    <>
      <Sheet open={open && !picked && !scan && !custom && !recipe} onClose={close} title={`Zu ${mealLabel} hinzufügen`} tall size="lg">
        <div className="sticky top-0 z-10 -mx-5 bg-surface px-5 pb-3">
          <div className="grid grid-cols-2 gap-2">
            <Button variant="primary" onClick={() => setScan(true)} icon={<ScanBarcode size={18} />}>
              Barcode scannen
            </Button>
            <Button onClick={() => setCustom({ barcode: null, name: q.trim() || undefined })} icon={<Plus size={18} />}>
              Eigenes
            </Button>
          </div>
          <form
            className="relative mt-3"
            onSubmit={(e) => {
              e.preventDefault();
              void searchOnline();
            }}
          >
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-subtle" />
            <input
              className="field pl-10 pr-24"
              placeholder="Lebensmittel suchen …"
              aria-label="Lebensmittel suchen"
              value={q}
              enterKeyHint="search"
              onChange={(e) => {
                setQ(e.target.value);
                setOnline(null);
                setOnlineError(null);
              }}
            />
            {q.trim().length >= 2 && (
              <button type="submit" className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-lg bg-surface px-2.5 py-1.5 text-[11.5px] font-bold">
                <Globe size={13} /> Online
              </button>
            )}
          </form>
          {!q.trim() && (
            <Segmented
              className="mt-3"
              size="sm"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'recent', label: 'Zuletzt' },
                { value: 'favorites', label: 'Favoriten' },
                { value: 'recipes', label: 'Rezepte' },
              ]}
              label="Liste"
            />
          )}
        </div>

        {(q.trim() || tab !== 'recipes') && (
          <>
            {q.trim() && <div className="label mb-1 mt-1">In deiner Bibliothek</div>}
            <ul className="divide-y divide-line/60">
              {list.map((f) => (
                <FoodRow key={f.id} food={f} onClick={() => setPicked(f)} />
              ))}
            </ul>
            {!list.length && (
              <p className="py-6 text-center text-[13px] text-muted">
                {q.trim()
                  ? 'Nichts Lokales gefunden – tippe auf „Online“, um Open Food Facts zu durchsuchen.'
                  : tab === 'favorites'
                    ? 'Noch keine Favoriten. Markiere Lebensmittel mit dem Stern.'
                    : 'Noch nichts erfasst. Scanne einen Barcode oder suche ein Lebensmittel.'}
              </p>
            )}
          </>
        )}

        {q.trim() && (searching || online || onlineError) && (
          <div className="mt-4">
            <div className="label mb-1 flex items-center gap-1.5">
              <Globe size={12} /> Open Food Facts
            </div>
            {searching && (
              <p className="flex items-center gap-2 py-4 text-[13px] text-muted">
                <Loader2 size={16} className="animate-spin" /> Suche läuft …
              </p>
            )}
            {onlineError && <p className="py-3 text-[13px] text-warn">{onlineError}</p>}
            {online && !online.length && <p className="py-3 text-[13px] text-muted">Keine Treffer mit Nährwerten.</p>}
            <ul className="divide-y divide-line/60">
              {online?.map((p) => (
                <li key={p.barcode + p.name}>
                  <button onClick={() => pickOnline(p)} className="flex w-full items-center gap-3 px-1 py-2.5 text-left hover:bg-elevated/50">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{p.name}</div>
                      <div className="truncate text-[11.5px] text-muted">
                        {[p.brand, `${fmtNumber(p.per100.kcal ?? 0, 0)} kcal/100 ${p.unit}`].filter(Boolean).join(' · ')}
                      </div>
                      <SourceBadge food={{ source: 'off', incomplete: p.incomplete }} />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
            {online && <p className="mt-2 text-[10.5px] text-subtle">Daten: Open Food Facts (Community-Datenbank, ODbL). Angaben können unvollständig sein.</p>}
          </div>
        )}

        {!q.trim() && tab === 'recipes' && (
          <ul className="divide-y divide-line/60">
            {recipes?.map((r) => {
              const pp = recipePerPortion(r);
              return (
                <li key={r.id}>
                  <button onClick={() => setRecipe(r)} className="flex w-full items-center gap-3 px-1 py-3 text-left hover:bg-elevated/50">
                    <ChefHat size={18} className="text-subtle" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{r.name}</div>
                      <div className="text-[11.5px] text-muted">
                        {fmtNumber(pp.kcal ?? 0, 0)} kcal pro Portion · <MacroLine n={pp} />
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
            {!recipes?.length && <p className="py-6 text-center text-[13px] text-muted">Noch keine Rezepte. Lege sie unter „Lebensmittel & Rezepte“ an oder speichere eine Mahlzeit als Rezept.</p>}
          </ul>
        )}
      </Sheet>

      <AmountSheet food={picked} date={date} meal={meal} onClose={() => setPicked(null)} onAdded={reset} />

      <BarcodeScanner
        open={scan}
        onClose={() => setScan(false)}
        onFood={(f) => {
          setScan(false);
          setPicked(f);
        }}
        onNotFound={(barcode, hint) => {
          setScan(false);
          toast(hint, 'warn');
          setCustom({ barcode, hint });
        }}
      />

      <FoodForm
        open={!!custom}
        onClose={() => setCustom(null)}
        initialBarcode={custom?.barcode}
        initialName={custom?.name}
        onSaved={(f) => {
          setCustom(null);
          setPicked(f);
        }}
      />

      <RecipeLogSheet recipe={recipe} date={date} meal={meal} onClose={() => setRecipe(null)} />
    </>
  );
}

export function FoodRow({ food, onClick, right }: { food: Food; onClick: () => void; right?: React.ReactNode }) {
  return (
    <li className="flex items-center">
      <button onClick={onClick} className="flex min-w-0 flex-1 items-center gap-3 px-1 py-2.5 text-left hover:bg-elevated/50">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-semibold">{food.name}</span>
            {food.favorite === 1 && <Star size={12} className="shrink-0 fill-warn text-warn" />}
          </div>
          <div className="truncate text-[11.5px] text-muted">
            {[food.brand, food.per100.kcal != null ? `${fmtNumber(food.per100.kcal, 0)} kcal/100 ${food.unit}` : 'kcal unbekannt'].filter(Boolean).join(' · ')}
          </div>
          <SourceBadge food={food} />
        </div>
      </button>
      {right}
    </li>
  );
}

export function RecipeLogSheet({ recipe, date, meal: initialMeal, onClose }: { recipe: Recipe | null; date: string; meal: MealSlot; onClose: () => void }) {
  const { toast } = useFeedback();
  const [portions, setPortions] = useState('1');
  const [meal, setMeal] = useState<MealSlot>(initialMeal);
  const [err, setErr] = useState<string | null>(null);
  const p = parseDecimal(portions);
  const pp = recipe ? recipePerPortion(recipe) : null;
  return (
    <Sheet
      open={!!recipe}
      onClose={onClose}
      title={recipe?.name}
      footer={
        <Button
          variant="primary"
          size="lg"
          block
          disabled={!p}
          onClick={async () => {
            if (!recipe || !p) return;
            try {
              await logRecipe(date, meal, recipe, p);
              toast(`${recipe.name} hinzugefügt`, 'success');
              setPortions('1');
              onClose();
            } catch (e) {
              setErr((e as Error).message);
            }
          }}
        >
          Hinzufügen
        </Button>
      }
    >
      {recipe && pp && (
        <div className="space-y-4">
          <p className="text-[13px] text-muted">
            {recipe.items.length} Zutaten · Rezept ergibt {recipe.portions} {recipe.portions === 1 ? 'Portion' : 'Portionen'}
          </p>
          <label className="block">
            <span className="label mb-1.5 block">Portionen</span>
            <input className="field num text-center text-[18px] font-bold" inputMode="decimal" value={portions} onChange={(e) => setPortions(e.target.value.replace(/[^\d.,]/g, ''))} />
          </label>
          <div className="grid grid-cols-4 gap-1.5">
            {MEALS.map((m) => (
              <button key={m.key} onClick={() => setMeal(m.key)} className={clsx('rounded-lg py-2 text-[11.5px] font-semibold', meal === m.key ? 'bg-fg text-bg' : 'bg-elevated text-muted')}>
                {m.label}
              </button>
            ))}
          </div>
          <div className="num rounded-xl bg-elevated/60 p-3 text-[13px]">
            <b>{fmtNumber((pp.kcal ?? 0) * (p ?? 0), 0)} kcal</b> · <MacroLine n={{ ...pp, protein: pp.protein != null ? pp.protein * (p ?? 0) : null, carbs: pp.carbs != null ? pp.carbs * (p ?? 0) : null, fat: pp.fat != null ? pp.fat * (p ?? 0) : null }} />
          </div>
          {err && <p className="text-[13px] text-bad">{err}</p>}
        </div>
      )}
    </Sheet>
  );
}
