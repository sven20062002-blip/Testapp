import type { WeightUnit } from '@/db/types';

export const LB_PER_KG = 2.2046226218;

export function kgToUnit(kg: number, unit: WeightUnit): number {
  return unit === 'kg' ? kg : kg * LB_PER_KG;
}

export function unitToKg(v: number, unit: WeightUnit): number {
  return unit === 'kg' ? v : v / LB_PER_KG;
}

/** Round for display: kg to 0.25 steps, lb to 0.5 */
export function roundDisplay(v: number, unit: WeightUnit): number {
  const step = unit === 'kg' ? 0.25 : 0.5;
  return Math.round(v / step) * step;
}

const nf1 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });

export function fmtNumber(v: number, digits = 0): string {
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: digits }).format(v);
}

/** Weight for display (input stored kg). */
export function fmtWeight(kg: number | null | undefined, unit: WeightUnit, withUnit = true): string {
  if (kg == null) return '–';
  const v = roundDisplay(kgToUnit(kg, unit), unit);
  return withUnit ? `${nf1.format(v)} ${unit}` : nf1.format(v);
}

/** Large totals (volume) – compact for big numbers */
export function fmtVolume(kg: number, unit: WeightUnit, compact = false): string {
  const v = kgToUnit(kg, unit);
  if (compact && v >= 10000) {
    const k = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(v / 1000);
    return unit === 'kg' ? `${k} t` : `${k}k lb`;
  }
  return `${nf0.format(Math.round(v))} ${unit}`;
}

/** Numeric value of a weight in display unit (for inputs) */
export function weightInputValue(kg: number | null, unit: WeightUnit): string {
  if (kg == null) return '';
  return String(roundDisplay(kgToUnit(kg, unit), unit)).replace('.', ',');
}

/** Parse user input (accepts "72,5" and "72.5"). Returns null for empty/invalid. */
export function parseDecimal(input: string): number | null {
  const s = input.trim().replace(',', '.');
  if (s === '') return null;
  const v = Number(s);
  if (!Number.isFinite(v) || v < 0) return null;
  return v;
}
