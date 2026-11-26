import type { Nutrients } from '@/db/types';

/**
 * Open Food Facts (https://world.openfoodfacts.org) – open, crowd-sourced product database
 * with strong coverage of Germany/Europe. Free, no API key. Data quality varies per product,
 * so incomplete records are flagged and missing values are NEVER filled with guesses.
 * Requests send only the barcode / search term – no personal data.
 */

const BASE = 'https://world.openfoodfacts.org';
const FIELDS = 'code,product_name,product_name_de,generic_name,brands,nutriments,serving_quantity,quantity,completeness,states_tags,nutrition_data_per';

export interface OffProduct {
  barcode: string;
  name: string;
  brand: string;
  per100: Nutrients;
  unit: 'g' | 'ml';
  servingSize: number | null;
  incomplete: boolean;
  missing: (keyof Nutrients)[];
  url: string;
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** Map an OFF product object to our model. Exported for tests. */
export function mapOffProduct(p: Record<string, any>): OffProduct | null {
  if (!p) return null;
  const n = (p.nutriments ?? {}) as Record<string, unknown>;
  let kcal = num(n['energy-kcal_100g']);
  // some products only carry kJ – converting is exact (1 kcal = 4.184 kJ), not a guess
  if (kcal == null && num(n['energy-kj_100g']) != null) kcal = num(n['energy-kj_100g'])! / 4.184;
  const per100: Nutrients = {
    kcal,
    protein: num(n['proteins_100g']),
    carbs: num(n['carbohydrates_100g']),
    fat: num(n['fat_100g']),
    fiber: num(n['fiber_100g']),
    sugar: num(n['sugars_100g']),
    satFat: num(n['saturated-fat_100g']),
    salt: num(n['salt_100g']),
  };
  const core: (keyof Nutrients)[] = ['kcal', 'protein', 'carbs', 'fat'];
  const missing = (Object.keys(per100) as (keyof Nutrients)[]).filter((k) => per100[k] == null);
  const name = String(p.product_name_de || p.product_name || p.generic_name || '').trim();
  const qty = String(p.quantity ?? '').toLowerCase();
  return {
    barcode: String(p.code ?? ''),
    name: name || 'Unbenanntes Produkt',
    brand: String(p.brands ?? '').split(',')[0].trim(),
    per100,
    unit: /\bml\b|\bl\b|cl\b/.test(qty) ? 'ml' : 'g',
    servingSize: num(p.serving_quantity),
    incomplete: core.some((k) => per100[k] == null) || !name,
    missing,
    url: `${BASE}/product/${encodeURIComponent(String(p.code ?? ''))}`,
  };
}

export class OffError extends Error {
  constructor(
    message: string,
    public kind: 'offline' | 'notfound' | 'network',
  ) {
    super(message);
  }
}

export function normalizeBarcode(raw: string): string | null {
  const s = raw.replace(/\D/g, '');
  return s.length >= 8 && s.length <= 14 ? s : null;
}

export async function fetchProduct(barcode: string, signal?: AbortSignal): Promise<OffProduct> {
  if (!navigator.onLine) throw new OffError('Keine Internetverbindung – die Produktdatenbank ist nur online erreichbar.', 'offline');
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${FIELDS}`, { signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new OffError('Open Food Facts ist gerade nicht erreichbar.', 'network');
  }
  if (res.status === 404) throw new OffError('Produkt nicht in Open Food Facts gefunden.', 'notfound');
  if (!res.ok) throw new OffError(`Open Food Facts antwortet mit Fehler ${res.status}.`, 'network');
  const json = await res.json();
  if (json.status === 0 || !json.product) throw new OffError('Produkt nicht in Open Food Facts gefunden.', 'notfound');
  const p = mapOffProduct(json.product);
  if (!p) throw new OffError('Produkt nicht in Open Food Facts gefunden.', 'notfound');
  return { ...p, barcode: p.barcode || barcode };
}

/** Full-text search (legacy endpoint – the only OFF endpoint with full-text search). Use sparingly (rate limit). */
export async function searchProducts(q: string, signal?: AbortSignal): Promise<OffProduct[]> {
  if (!navigator.onLine) throw new OffError('Keine Internetverbindung – Online-Suche nicht verfügbar.', 'offline');
  const url = `${BASE}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=25&fields=${FIELDS}&lc=de&cc=de`;
  let res: Response;
  try {
    res = await fetch(url, { signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new OffError('Open Food Facts ist gerade nicht erreichbar.', 'network');
  }
  if (!res.ok) throw new OffError(`Suche fehlgeschlagen (${res.status}).`, 'network');
  const json = await res.json();
  return ((json.products ?? []) as Record<string, any>[])
    .map(mapOffProduct)
    .filter((p): p is OffProduct => !!p && p.per100.kcal != null);
}
