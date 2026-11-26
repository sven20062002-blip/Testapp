import { db } from '@/db/db';
import type { Food, FoodLogEntry, MealSlot, Nutrients, Recipe, RecipeItem } from '@/db/types';
import { uid } from '@/lib/id';
import { EMPTY_NUTRIENTS, NUTRIENT_KEYS, scale, sumNutrients } from './calc';
import type { OffProduct } from './off';

export const MEALS: { key: MealSlot; label: string }[] = [
  { key: 'breakfast', label: 'Frühstück' },
  { key: 'lunch', label: 'Mittagessen' },
  { key: 'dinner', label: 'Abendessen' },
  { key: 'snack', label: 'Snacks' },
];

export function defaultMeal(now = new Date()): MealSlot {
  const h = now.getHours();
  if (h < 11) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 21) return 'dinner';
  return 'snack';
}

export function validateNutrients(n: Nutrients): string | null {
  for (const k of NUTRIENT_KEYS) {
    const v = n[k];
    if (v == null) continue;
    if (!Number.isFinite(v) || v < 0) return 'Nährwerte dürfen nicht negativ sein.';
    if (k === 'kcal' ? v > 900 : v > 100) return k === 'kcal' ? 'Mehr als 900 kcal pro 100 g ist nicht möglich.' : 'Mehr als 100 g pro 100 g ist nicht möglich.';
  }
  if (n.kcal == null) return 'Bitte mindestens die Kalorien pro 100 g angeben.';
  const macros = (n.protein ?? 0) + (n.carbs ?? 0) + (n.fat ?? 0);
  if (macros > 100.5) return 'Protein + Kohlenhydrate + Fett ergeben mehr als 100 g pro 100 g.';
  return null;
}

/** Save an OFF product locally (dedupe by barcode) so it is available offline afterwards. */
export async function saveOffProduct(p: OffProduct): Promise<Food> {
  const existing = p.barcode ? await db.foods.where('barcode').equals(p.barcode).first() : undefined;
  const now = Date.now();
  if (existing) {
    // keep user-made products untouched; refresh OFF data
    if (existing.source === 'off') {
      const upd = { name: p.name, brand: p.brand, per100: p.per100, unit: p.unit, servingSize: p.servingSize, incomplete: p.incomplete, sourceUrl: p.url, deletedAt: null, updatedAt: now };
      await db.foods.update(existing.id, upd);
      return { ...existing, ...upd };
    }
    return existing;
  }
  const food: Food = {
    id: uid(),
    name: p.name,
    brand: p.brand,
    barcode: p.barcode || null,
    per100: p.per100,
    unit: p.unit,
    servingSize: p.servingSize,
    source: 'off',
    sourceUrl: p.url,
    incomplete: p.incomplete,
    favorite: 0,
    useCount: 0,
    lastUsedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.foods.add(food);
  return food;
}

export interface CustomFoodInput {
  name: string;
  brand: string;
  barcode: string | null;
  per100: Nutrients;
  unit: 'g' | 'ml';
  servingSize: number | null;
}

export async function saveCustomFood(input: CustomFoodInput, id?: string): Promise<Food> {
  if (!input.name.trim()) throw new Error('Bitte einen Namen eingeben.');
  const err = validateNutrients(input.per100);
  if (err) throw new Error(err);
  const now = Date.now();
  const barcode = input.barcode?.replace(/\D/g, '') || null;
  if (barcode) {
    const dupe = await db.foods.where('barcode').equals(barcode).first();
    if (dupe && dupe.id !== id && !dupe.deletedAt && dupe.source === 'custom') throw new Error('Ein eigenes Produkt mit diesem Barcode existiert bereits.');
  }
  const core = ['kcal', 'protein', 'carbs', 'fat'] as const;
  const incomplete = core.some((k) => input.per100[k] == null);
  if (id) {
    await db.foods.update(id, { ...input, name: input.name.trim(), brand: input.brand.trim(), barcode, incomplete, updatedAt: now });
    return (await db.foods.get(id))!;
  }
  const food: Food = {
    id: uid(),
    ...input,
    name: input.name.trim(),
    brand: input.brand.trim(),
    barcode,
    source: 'custom',
    sourceUrl: null,
    incomplete,
    favorite: 0,
    useCount: 0,
    lastUsedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.foods.add(food);
  return food;
}

export async function deleteFood(id: string): Promise<void> {
  // soft delete: diary entries keep their own nutrient snapshot
  await db.foods.update(id, { deletedAt: Date.now(), favorite: 0 });
}

export async function toggleFavorite(id: string): Promise<void> {
  const f = await db.foods.get(id);
  if (f) await db.foods.update(id, { favorite: f.favorite ? 0 : 1 });
}

export async function findByBarcode(barcode: string): Promise<Food | undefined> {
  const list = await db.foods.where('barcode').equals(barcode).toArray();
  return list.find((f) => !f.deletedAt && f.source === 'custom') ?? list.find((f) => !f.deletedAt);
}

export function validateAmount(amount: number): string | null {
  if (!Number.isFinite(amount) || amount <= 0) return 'Bitte eine Menge größer 0 eingeben.';
  if (amount > 5000) return 'Die Menge ist unrealistisch hoch.';
  return null;
}

export async function logFood(date: string, meal: MealSlot, food: Food, amount: number): Promise<string> {
  const err = validateAmount(amount);
  if (err) throw new Error(err);
  const now = Date.now();
  const entry: FoodLogEntry = {
    id: uid(),
    date,
    meal,
    kind: 'food',
    refId: food.id,
    name: food.name,
    brand: food.brand,
    amount,
    basis: food.per100,
    unit: food.unit,
    source: food.source,
    incomplete: food.incomplete,
    createdAt: now,
    updatedAt: now,
  };
  await db.transaction('rw', db.foodLog, db.foods, async () => {
    await db.foodLog.add(entry);
    await db.foods.update(food.id, { useCount: (food.useCount ?? 0) + 1, lastUsedAt: now });
  });
  return entry.id;
}

export function recipePerPortion(r: Pick<Recipe, 'items' | 'portions'>): Nutrients {
  const total = sumNutrients(r.items.map((i) => scale(i.per100, i.amount)));
  const out = { ...EMPTY_NUTRIENTS };
  for (const k of NUTRIENT_KEYS) out[k] = total.incomplete.includes(k) && r.items.every((i) => i.per100[k] == null) ? null : total[k] / Math.max(1, r.portions);
  return out;
}

export async function logRecipe(date: string, meal: MealSlot, r: Recipe, portions: number): Promise<string> {
  if (!Number.isFinite(portions) || portions <= 0 || portions > 50) throw new Error('Bitte eine gültige Portionsanzahl eingeben.');
  const now = Date.now();
  const entry: FoodLogEntry = {
    id: uid(),
    date,
    meal,
    kind: 'recipe',
    refId: r.id,
    name: r.name,
    brand: `${r.items.length} Zutaten`,
    amount: portions,
    basis: recipePerPortion(r),
    unit: 'portion',
    source: 'recipe',
    incomplete: r.items.some((i) => ['kcal', 'protein', 'carbs', 'fat'].some((k) => i.per100[k as keyof Nutrients] == null)),
    createdAt: now,
    updatedAt: now,
  };
  await db.foodLog.add(entry);
  return entry.id;
}

export async function updateEntryAmount(id: string, amount: number): Promise<void> {
  const err = validateAmount(amount);
  if (err) throw new Error(err);
  await db.foodLog.update(id, { amount, updatedAt: Date.now() });
}

export async function moveEntry(id: string, meal: MealSlot): Promise<void> {
  await db.foodLog.update(id, { meal, updatedAt: Date.now() });
}

export async function deleteEntry(id: string): Promise<FoodLogEntry | undefined> {
  const e = await db.foodLog.get(id);
  await db.foodLog.delete(id);
  return e;
}

export async function restoreEntry(e: FoodLogEntry): Promise<void> {
  await db.foodLog.put(e);
}

/** Copy a meal (all entries of one slot on one day) to another day/slot – "duplicate / reuse meal" */
export async function copyMeal(fromDate: string, fromMeal: MealSlot, toDate: string, toMeal: MealSlot): Promise<number> {
  const src = await db.foodLog.where('[date+meal]').equals([fromDate, fromMeal]).toArray();
  const now = Date.now();
  await db.foodLog.bulkAdd(src.map((e) => ({ ...e, id: uid(), date: toDate, meal: toMeal, createdAt: now, updatedAt: now })));
  return src.length;
}

export async function saveRecipe(name: string, items: RecipeItem[], portions: number, id?: string): Promise<string> {
  if (!name.trim()) throw new Error('Bitte einen Namen eingeben.');
  if (!items.length) throw new Error('Füge mindestens eine Zutat hinzu.');
  if (!Number.isFinite(portions) || portions < 1 || portions > 50) throw new Error('Portionen müssen zwischen 1 und 50 liegen.');
  for (const i of items) if (validateAmount(i.amount)) throw new Error(`Ungültige Menge bei „${i.name}“.`);
  const now = Date.now();
  if (id) {
    await db.recipes.update(id, { name: name.trim(), items, portions, updatedAt: now });
    return id;
  }
  const r: Recipe = { id: uid(), name: name.trim(), items, portions, createdAt: now, updatedAt: now };
  await db.recipes.add(r);
  return r.id;
}

/** Turn a logged meal into a reusable recipe (1 portion = the logged amounts) */
export async function recipeFromMeal(date: string, meal: MealSlot, name: string): Promise<string> {
  const entries = (await db.foodLog.where('[date+meal]').equals([date, meal]).toArray()).filter((e) => e.kind === 'food');
  if (!entries.length) throw new Error('Diese Mahlzeit enthält keine einzelnen Lebensmittel.');
  return saveRecipe(
    name,
    entries.map((e) => ({ foodId: e.refId, name: e.name, amount: e.amount, per100: e.basis, unit: e.unit === 'ml' ? 'ml' : 'g' })),
    1,
  );
}

export async function deleteRecipe(id: string): Promise<void> {
  await db.recipes.delete(id);
}
