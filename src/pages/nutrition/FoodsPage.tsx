import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChefHat, MoreHorizontal, Pencil, Plus, ScanBarcode, Search, Star, Trash2, Utensils, X, CalendarPlus } from 'lucide-react';
import { db } from '@/db/db';
import type { Food, Recipe, RecipeItem } from '@/db/types';
import { PageHeader } from '@/components/ui/PageHeader';
import { Segmented } from '@/components/ui/Segmented';
import { Sheet } from '@/components/ui/Sheet';
import { Button, IconButton } from '@/components/ui/Button';
import { Empty } from '@/components/ui/Empty';
import { useFeedback } from '@/components/ui/Feedback';
import { MenuItem, MenuList } from '@/components/workout/ExerciseCard';
import { FoodForm } from '@/components/nutrition/FoodForm';
import { FoodRow, RecipeLogSheet } from '@/components/nutrition/AddFoodSheet';
import { BarcodeScanner } from '@/components/nutrition/BarcodeScanner';
import { MacroLine, NutrientTable } from '@/components/nutrition/shared';
import { defaultMeal, deleteFood, deleteRecipe, recipePerPortion, saveRecipe, toggleFavorite } from '@/nutrition/repo';
import { scale, sumNutrients } from '@/nutrition/calc';
import { fmtNumber, parseDecimal } from '@/lib/units';
import { dayKey } from '@/lib/day';

type Tab = 'custom' | 'favorites' | 'saved' | 'recipes';
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export default function FoodsPage() {
  const foods = useLiveQuery(() => db.foods.toArray(), []);
  const recipes = useLiveQuery(() => db.recipes.orderBy('name').toArray(), []);
  const { confirm, toast } = useFeedback();
  const [tab, setTab] = useState<Tab>('custom');
  const [q, setQ] = useState('');
  const [form, setForm] = useState<{ food: Food | null; barcode?: string | null } | null>(null);
  const [menu, setMenu] = useState<Food | null>(null);
  const [detail, setDetail] = useState<Food | null>(null);
  const [recipeEdit, setRecipeEdit] = useState<Recipe | 'new' | null>(null);
  const [recipeMenu, setRecipeMenu] = useState<Recipe | null>(null);
  const [logRecipe, setLogRecipe] = useState<Recipe | null>(null);
  const [scan, setScan] = useState(false);

  const list = useMemo(() => {
    const act = (foods ?? []).filter((f) => !f.deletedAt && (!q || norm(`${f.name} ${f.brand} ${f.barcode ?? ''}`).includes(norm(q))));
    const sorted = (xs: Food[]) => xs.sort((a, b) => a.name.localeCompare(b.name, 'de'));
    if (tab === 'custom') return sorted(act.filter((f) => f.source === 'custom'));
    if (tab === 'favorites') return sorted(act.filter((f) => f.favorite));
    return sorted(act.filter((f) => f.source === 'off'));
  }, [foods, tab, q]);

  return (
    <div className="page">
      <PageHeader
        back="/nutrition"
        title="Lebensmittel"
        subtitle="Eigene Produkte, Favoriten, gespeicherte Produkte und Rezepte"
        actions={
          <Button variant="primary" onClick={() => (tab === 'recipes' ? setRecipeEdit('new') : setForm({ food: null }))} icon={<Plus size={18} />}>
            Neu
          </Button>
        }
      />
      <Segmented
        value={tab}
        onChange={setTab}
        size="sm"
        options={[
          { value: 'custom', label: 'Eigene' },
          { value: 'favorites', label: 'Favoriten' },
          { value: 'saved', label: 'Gespeichert' },
          { value: 'recipes', label: 'Rezepte' },
        ]}
        label="Kategorie"
      />
      {tab !== 'recipes' && (
        <div className="mt-3 flex gap-2">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-subtle" />
            <input className="field bg-surface pl-10" placeholder="Suchen …" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Lebensmittel suchen" />
          </div>
          <IconButton label="Barcode scannen" variant="secondary" className="h-12 w-12" onClick={() => setScan(true)}>
            <ScanBarcode size={20} />
          </IconButton>
        </div>
      )}

      {tab !== 'recipes' && (
        <>
          {list.length === 0 && foods && (
            <Empty
              icon={<Utensils size={28} />}
              title={tab === 'custom' ? 'Keine eigenen Lebensmittel' : tab === 'favorites' ? 'Keine Favoriten' : 'Keine gespeicherten Produkte'}
              text={
                tab === 'saved'
                  ? 'Gescannte oder online gefundene Produkte werden hier gespeichert und sind danach auch offline verfügbar.'
                  : tab === 'favorites'
                    ? 'Markiere Lebensmittel mit dem Stern, um sie schnell wiederzufinden.'
                    : 'Lege Lebensmittel mit eigenen Nährwerten pro 100 g an.'
              }
            />
          )}
          <ul className="card mt-3 divide-y divide-line/60 px-3 empty:hidden">
            {list.map((f) => (
              <FoodRow
                key={f.id}
                food={f}
                onClick={() => setDetail(f)}
                right={
                  <IconButton label={`Optionen für ${f.name}`} onClick={() => setMenu(f)}>
                    <MoreHorizontal size={19} />
                  </IconButton>
                }
              />
            ))}
          </ul>
        </>
      )}

      {tab === 'recipes' && (
        <>
          {recipes?.length === 0 && (
            <Empty
              icon={<ChefHat size={28} />}
              title="Noch keine Rezepte"
              text="Rezepte und eigene Mahlzeiten bestehen aus mehreren Zutaten – die Nährwerte werden automatisch berechnet."
              action={
                <Button variant="primary" onClick={() => setRecipeEdit('new')} icon={<Plus size={18} />}>
                  Rezept erstellen
                </Button>
              }
            />
          )}
          <div className="mt-3 space-y-2">
            {recipes?.map((r) => {
              const pp = recipePerPortion(r);
              return (
                <div key={r.id} className="card flex items-center gap-3 p-4">
                  <ChefHat size={20} className="text-subtle" />
                  <button className="min-w-0 flex-1 text-left" onClick={() => setRecipeEdit(r)}>
                    <div className="truncate font-bold">{r.name}</div>
                    <div className="text-[12px] text-muted">
                      {r.items.length} Zutaten · {r.portions} {r.portions === 1 ? 'Portion' : 'Portionen'} · {fmtNumber(pp.kcal ?? 0, 0)} kcal/Portion
                    </div>
                    <div className="text-[12px] text-subtle">
                      pro Portion: <MacroLine n={pp} />
                    </div>
                  </button>
                  <IconButton label={`Optionen für ${r.name}`} onClick={() => setRecipeMenu(r)}>
                    <MoreHorizontal size={19} />
                  </IconButton>
                </div>
              );
            })}
          </div>
        </>
      )}

      <FoodForm open={!!form} onClose={() => setForm(null)} food={form?.food} initialBarcode={form?.barcode} />

      <Sheet open={!!detail} onClose={() => setDetail(null)} title={detail?.name}>
        {detail && (
          <div className="space-y-3">
            <div className="text-sm text-muted">
              {[detail.brand, detail.barcode && `EAN ${detail.barcode}`, detail.source === 'off' ? 'Quelle: Open Food Facts' : 'Eigenes Lebensmittel'].filter(Boolean).join(' · ')}
            </div>
            <div className="label">Pro 100 {detail.unit}</div>
            <NutrientTable n={detail.per100} />
            {detail.incomplete && <p className="text-[12px] text-warn">Unvollständige Angaben – fehlende Werte werden nicht mitgezählt.</p>}
          </div>
        )}
      </Sheet>

      <Sheet open={!!menu} onClose={() => setMenu(null)} title={menu?.name}>
        {menu && (
          <MenuList>
            <MenuItem icon={<Star size={18} />} onClick={async () => (await toggleFavorite(menu.id), setMenu(null))}>
              {menu.favorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
            </MenuItem>
            {menu.source === 'custom' && (
              <MenuItem icon={<Pencil size={18} />} onClick={() => (setForm({ food: menu }), setMenu(null))}>
                Bearbeiten
              </MenuItem>
            )}
            {menu.source === 'off' && (
              <MenuItem icon={<Pencil size={18} />} onClick={() => (setForm({ food: { ...menu, source: 'custom', id: '' } as Food }), setMenu(null))}>
                Als eigenes Lebensmittel kopieren & korrigieren
              </MenuItem>
            )}
            <MenuItem
              icon={<Trash2 size={18} />}
              danger
              onClick={async () => {
                const f = menu;
                setMenu(null);
                if (await confirm({ title: `„${f.name}“ löschen?`, text: 'Bereits erfasste Einträge im Tagebuch bleiben unverändert erhalten.', confirmLabel: 'Löschen', danger: true })) {
                  await deleteFood(f.id);
                  toast('Lebensmittel gelöscht', 'info');
                }
              }}
            >
              Löschen
            </MenuItem>
          </MenuList>
        )}
      </Sheet>

      <Sheet open={!!recipeMenu} onClose={() => setRecipeMenu(null)} title={recipeMenu?.name}>
        {recipeMenu && (
          <MenuList>
            <MenuItem icon={<CalendarPlus size={18} />} onClick={() => (setLogRecipe(recipeMenu), setRecipeMenu(null))}>
              Heute erfassen
            </MenuItem>
            <MenuItem icon={<Pencil size={18} />} onClick={() => (setRecipeEdit(recipeMenu), setRecipeMenu(null))}>
              Bearbeiten
            </MenuItem>
            <MenuItem
              icon={<Trash2 size={18} />}
              danger
              onClick={async () => {
                const r = recipeMenu;
                setRecipeMenu(null);
                if (await confirm({ title: `„${r.name}“ löschen?`, text: 'Bereits erfasste Einträge bleiben erhalten.', confirmLabel: 'Löschen', danger: true })) await deleteRecipe(r.id);
              }}
            >
              Löschen
            </MenuItem>
          </MenuList>
        )}
      </Sheet>

      <RecipeEditor recipe={recipeEdit} onClose={() => setRecipeEdit(null)} foods={(foods ?? []).filter((f) => !f.deletedAt)} />
      <RecipeLogSheet recipe={logRecipe} date={dayKey()} meal={defaultMeal()} onClose={() => setLogRecipe(null)} />
      <BarcodeScanner
        open={scan}
        onClose={() => setScan(false)}
        onFood={(f) => {
          setScan(false);
          setTab(f.source === 'custom' ? 'custom' : 'saved');
          setDetail(f);
        }}
        onNotFound={(barcode, hint) => {
          setScan(false);
          toast(hint, 'warn');
          setForm({ food: null, barcode });
        }}
      />
    </div>
  );
}

function RecipeEditor({ recipe, onClose, foods }: { recipe: Recipe | 'new' | null; onClose: () => void; foods: Food[] }) {
  const { toast } = useFeedback();
  const [name, setName] = useState('');
  const [portions, setPortions] = useState('1');
  const [items, setItems] = useState<RecipeItem[]>([]);
  const [amounts, setAmounts] = useState<string[]>([]);
  const [picker, setPicker] = useState(false);
  const [q, setQ] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<Recipe | 'new' | null>(null);
  if (recipe !== loadedFor) {
    setLoadedFor(recipe);
    if (recipe && recipe !== 'new') {
      setName(recipe.name);
      setPortions(String(recipe.portions));
      setItems(recipe.items);
      setAmounts(recipe.items.map((i) => String(i.amount).replace('.', ',')));
    } else {
      setName('');
      setPortions('1');
      setItems([]);
      setAmounts([]);
    }
    setErr(null);
  }

  const parsed = items.map((it, i) => ({ ...it, amount: parseDecimal(amounts[i] ?? '') ?? 0 }));
  const p = parseDecimal(portions) ?? 1;
  const total = sumNutrients(parsed.map((i) => scale(i.per100, i.amount)));
  const perPortion = recipePerPortion({ items: parsed, portions: Math.max(1, p) });
  const candidates = foods.filter((f) => !q || norm(`${f.name} ${f.brand}`).includes(norm(q))).slice(0, 30);

  const save = async () => {
    try {
      await saveRecipe(name, parsed, Math.round(p), recipe && recipe !== 'new' ? recipe.id : undefined);
      toast('Rezept gespeichert', 'success');
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <>
      <Sheet
        open={!!recipe && !picker}
        onClose={onClose}
        title={recipe === 'new' ? 'Neues Rezept' : 'Rezept bearbeiten'}
        size="lg"
        tall
        footer={
          <Button variant="primary" size="lg" block onClick={save}>
            Speichern
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-[1fr_96px] gap-2">
            <label className="block">
              <span className="label mb-1.5 block">Name</span>
              <input className="field" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="z. B. Protein-Porridge" />
            </label>
            <label className="block">
              <span className="label mb-1.5 block">Portionen</span>
              <input className="field num text-center" inputMode="numeric" value={portions} onChange={(e) => setPortions(e.target.value.replace(/\D/g, ''))} />
            </label>
          </div>
          <div>
            <span className="label mb-1.5 block">Zutaten</span>
            <ul className="space-y-1.5">
              {items.map((it, i) => (
                <li key={`${it.foodId}-${i}`} className="flex items-center gap-2 rounded-xl bg-elevated/60 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-semibold">{it.name}</div>
                    <div className="num text-[11px] text-muted">{fmtNumber(scale(it.per100, parsed[i].amount).kcal ?? 0, 0)} kcal</div>
                  </div>
                  <input
                    className="num h-10 w-20 rounded-lg bg-surface text-center font-bold outline-none focus:ring-1 focus:ring-accent"
                    inputMode="decimal"
                    aria-label={`Menge ${it.name}`}
                    value={amounts[i] ?? ''}
                    onChange={(e) => setAmounts((a) => a.map((x, j) => (j === i ? e.target.value.replace(/[^\d.,]/g, '') : x)))}
                  />
                  <span className="w-6 text-[12px] text-muted">{it.unit}</span>
                  <IconButton label={`${it.name} entfernen`} variant="danger" onClick={() => (setItems((xs) => xs.filter((_, j) => j !== i)), setAmounts((xs) => xs.filter((_, j) => j !== i)))}>
                    <X size={16} />
                  </IconButton>
                </li>
              ))}
            </ul>
            <Button block className="mt-2 border border-dashed border-line" onClick={() => setPicker(true)} icon={<Plus size={17} />}>
              Zutat hinzufügen
            </Button>
            {foods.length === 0 && <p className="mt-2 text-[12px] text-subtle">Zutaten stammen aus deiner Lebensmittel-Bibliothek. Scanne oder lege zuerst Lebensmittel an.</p>}
          </div>
          {items.length > 0 && (
            <div className="rounded-2xl bg-elevated/60 p-3">
              <div className="label mb-2">Pro Portion ({fmtNumber(total.kcal, 0)} kcal gesamt)</div>
              <NutrientTable n={perPortion} keys={['kcal', 'protein', 'carbs', 'fat', 'fiber', 'sugar']} />
            </div>
          )}
          {err && <p className="text-sm text-bad">{err}</p>}
        </div>
      </Sheet>
      <Sheet open={picker} onClose={() => setPicker(false)} title="Zutat wählen" tall>
        <div className="sticky top-0 -mx-5 bg-surface px-5 pb-3">
          <input className="field" placeholder="Suchen …" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Zutat suchen" />
        </div>
        <ul className="divide-y divide-line/60">
          {candidates.map((f) => (
            <FoodRow
              key={f.id}
              food={f}
              onClick={() => {
                setItems((xs) => [...xs, { foodId: f.id, name: f.name, amount: f.servingSize ?? 100, per100: f.per100, unit: f.unit }]);
                setAmounts((xs) => [...xs, String(f.servingSize ?? 100).replace('.', ',')]);
                setPicker(false);
                setQ('');
              }}
            />
          ))}
        </ul>
        {!candidates.length && <p className="py-6 text-center text-sm text-muted">Keine Lebensmittel gefunden.</p>}
      </Sheet>
    </>
  );
}
