import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/db';
import { initDatabase } from '@/db/init';
import { bmrMifflin, dailyTargets, energyPlan, entryNutrients, expectedWeeklyChange, scale, sumNutrients, EMPTY_NUTRIENTS } from '@/nutrition/calc';
import { mapOffProduct, normalizeBarcode } from '@/nutrition/off';
import {
  copyMeal,
  findByBarcode,
  logFood,
  logRecipe,
  recipeFromMeal,
  recipePerPortion,
  saveCustomFood,
  saveOffProduct,
  updateEntryAmount,
  validateNutrients,
} from '@/nutrition/repo';
import { DEFAULT_PROFILE } from '@/health/repo';
import type { Profile } from '@/db/types';

const N = (kcal: number | null, protein: number | null, carbs: number | null, fat: number | null) => ({ ...EMPTY_NUTRIENTS, kcal, protein, carbs, fat });

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-03-10T12:00:00'));
  await db.delete();
  await db.open();
  await initDatabase();
});

describe('amount calculation', () => {
  it('150 kcal/100 g × 200 g = 300 kcal, 20 P, 30 C, 10 F', () => {
    const r = scale(N(150, 10, 15, 5), 200);
    expect(r).toMatchObject({ kcal: 300, protein: 20, carbs: 30, fat: 10 });
    expect(r.fiber).toBeNull(); // unknown stays unknown
  });
  it('totals flag unknown values instead of counting 0', () => {
    const t = sumNutrients([N(100, 5, null, 1), N(200, 10, 20, 2)]);
    expect(t.kcal).toBe(300);
    expect(t.carbs).toBe(20);
    expect(t.incomplete).toContain('carbs');
  });
  it('recipe entry multiplies per-portion basis', () => {
    expect(entryNutrients({ kind: 'recipe', amount: 2, basis: N(400, 30, 40, 10) }).kcal).toBe(800);
  });
});

describe('energy requirement (estimates)', () => {
  it('Mifflin-St Jeor', () => {
    expect(bmrMifflin('male', 80, 180, 30)).toBe(1780);
    expect(bmrMifflin('female', 60, 165, 30)).toBeCloseTo(1320.25, 2);
  });
  const p: Profile = { ...DEFAULT_PROFILE, age: 30, sex: 'male', heightCm: 180, activityLevel: 1.55, goal: 'muscle' };
  it('plan with surplus and macros', () => {
    const plan = energyPlan(p, 80)!;
    expect(plan.tdee).toBeCloseTo(2759, 0);
    expect(plan.adjustment).toBe(276);
    expect(plan.protein).toBe(160);
    expect(plan.protein * 4 + plan.carbs * 4 + plan.fat * 9).toBeCloseTo(plan.target, -1);
  });
  it('fat loss deficit never goes below safe floor', () => {
    const plan = energyPlan({ ...p, goal: 'fatloss' }, 80)!;
    expect(plan.adjustment).toBeLessThan(0);
    expect(plan.target).toBeGreaterThanOrEqual(Math.round(plan.bmr * 1.1 / 10) * 10 - 10);
  });
  it('returns null with incomplete profile', () => {
    expect(energyPlan({ ...p, age: null }, 80)).toBeNull();
  });
  it('dynamic budget = BMR×1.2 + adjustment + measured active kcal; manual overrides win', () => {
    const t = dailyTargets({ ...p, budgetMode: 'dynamic' }, 80, 500);
    expect(t.kcal).toBe(Math.round(1780 * 1.2 + 276 + 500));
    expect(t.activeBonus).toBe(500);
    const m = dailyTargets({ ...p, kcalTarget: 2500, proteinTarget: 180 }, 80, null);
    expect(m.kcal).toBe(2500);
    expect(m.protein).toBe(180);
    expect(m.manual.kcal).toBe(true);
  });
  it('expected weekly change', () => {
    expect(expectedWeeklyChange(-550)).toBeCloseTo(-0.5, 2);
  });
});

describe('Open Food Facts mapping', () => {
  it('maps a complete product', () => {
    const p = mapOffProduct({
      code: '4000417025005',
      product_name: 'Ritter Sport Marzipan',
      brands: 'Ritter Sport, Alfred Ritter',
      quantity: '100 g',
      serving_quantity: 16.7,
      nutriments: {
        'energy-kcal_100g': 497,
        proteins_100g: 6.6,
        carbohydrates_100g: 51,
        fat_100g: 28,
        fiber_100g: 3.5,
        sugars_100g: 47,
        'saturated-fat_100g': 13,
        salt_100g: 0.03,
      },
    })!;
    expect(p).toMatchObject({ barcode: '4000417025005', brand: 'Ritter Sport', unit: 'g', servingSize: 16.7, incomplete: false, missing: [] });
    expect(p.per100.kcal).toBe(497);
  });
  it('kJ only, missing values stay null and product is flagged', () => {
    const p = mapOffProduct({ code: '123', product_name_de: 'Milch', quantity: '1 l', nutriments: { 'energy-kj_100g': 268, fat_100g: '3,5' } })!;
    expect(p.per100.kcal).toBeCloseTo(64.05, 1);
    expect(p.per100.fat).toBe(3.5);
    expect(p.per100.protein).toBeNull();
    expect(p.incomplete).toBe(true);
    expect(p.missing).toContain('protein');
    expect(p.unit).toBe('ml');
  });
  it('normalizes barcodes', () => {
    expect(normalizeBarcode(' 4000-4170 25005 ')).toBe('4000417025005');
    expect(normalizeBarcode('123')).toBeNull();
  });
});

describe('validation', () => {
  it('rejects impossible values', () => {
    expect(validateNutrients(N(null, 1, 1, 1))).toMatch(/Kalorien/);
    expect(validateNutrients(N(950, 1, 1, 1))).toMatch(/900/);
    expect(validateNutrients(N(400, 60, 50, 10))).toMatch(/100 g/);
    expect(validateNutrients(N(-1, 1, 1, 1))).toMatch(/negativ/);
    expect(validateNutrients(N(150, 10, 15, 5))).toBeNull();
  });
});

describe('diary', () => {
  const off = () =>
    mapOffProduct({ code: '4001234567890', product_name: 'Skyr', brands: 'Test', nutriments: { 'energy-kcal_100g': 63, proteins_100g: 11, carbohydrates_100g: 4, fat_100g: 0.2 } })!;

  it('saves OFF products once (dedupe by barcode) and finds them offline', async () => {
    const a = await saveOffProduct(off());
    const b = await saveOffProduct(off());
    expect(a.id).toBe(b.id);
    expect(await db.foods.count()).toBe(1);
    expect((await findByBarcode('4001234567890'))!.name).toBe('Skyr');
  });

  it('custom product with barcode takes precedence', async () => {
    await saveOffProduct(off());
    await saveCustomFood({ name: 'Mein Skyr', brand: '', barcode: '4001234567890', per100: N(60, 10, 4, 0), unit: 'g', servingSize: null });
    expect((await findByBarcode('4001234567890'))!.name).toBe('Mein Skyr');
  });

  it('logs food, edits amount, keeps snapshot, copies meals, builds recipes', async () => {
    const food = await saveOffProduct(off());
    const id = await logFood('2026-03-10', 'breakfast', food, 200);
    let e = (await db.foodLog.get(id))!;
    expect(entryNutrients(e)).toMatchObject({ kcal: 126, protein: 22 });
    await updateEntryAmount(id, 300);
    e = (await db.foodLog.get(id))!;
    expect(entryNutrients(e).kcal).toBeCloseTo(189);
    expect((await db.foods.get(food.id))!.useCount).toBe(1);
    await expect(updateEntryAmount(id, 0)).rejects.toThrow();

    // snapshot: changing the food later does not alter history
    await db.foods.update(food.id, { per100: N(999, 0, 0, 0) });
    expect(entryNutrients((await db.foodLog.get(id))!).kcal).toBeCloseTo(189);

    const oats = await saveCustomFood({ name: 'Haferflocken', brand: '', barcode: null, per100: N(370, 13, 59, 7), unit: 'g', servingSize: 50 });
    await logFood('2026-03-10', 'breakfast', oats, 50);
    expect(await copyMeal('2026-03-10', 'breakfast', '2026-03-11', 'lunch')).toBe(2);
    expect(await db.foodLog.where('[date+meal]').equals(['2026-03-11', 'lunch']).count()).toBe(2);

    const rid = await recipeFromMeal('2026-03-10', 'breakfast', 'Skyr-Bowl');
    const r = (await db.recipes.get(rid))!;
    const pp = recipePerPortion(r);
    expect(pp.kcal).toBeCloseTo(189 + 185);
    expect(pp.protein).toBeCloseTo(33 + 6.5);
    await logRecipe('2026-03-12', 'dinner', r, 2);
    const re = (await db.foodLog.where('date').equals('2026-03-12').first())!;
    expect(entryNutrients(re).kcal).toBeCloseTo((189 + 185) * 2);
  });

  it('recipe per portion divides by portions', () => {
    const pp = recipePerPortion({ portions: 4, items: [{ foodId: 'x', name: 'Reis', amount: 400, per100: N(350, 7, 77, 1), unit: 'g' }] });
    expect(pp.kcal).toBe(350);
    expect(pp.fiber).toBeNull();
  });
});
