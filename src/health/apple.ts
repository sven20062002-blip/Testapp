/**
 * Apple Health import.
 *
 * Apple HealthKit is only accessible from native iOS apps – a web app/PWA has no API access.
 * Official alternative: Health app → profile picture → "Alle Gesundheitsdaten exportieren".
 * iOS writes export.zip (containing apple_health_export/export.xml), which can be imported here.
 * The XML can be hundreds of MB, so it is parsed as a stream (chunk by chunk) in a Web Worker.
 */
import type { HealthCategory, MetricKey } from '@/db/types';
import { dayKey } from '@/lib/day';
import { METRIC_META } from './meta';

type Unit = string;

interface QuantitySpec {
  metric: MetricKey;
  /** sum: summed per source/day and the source with the largest total wins (avoids iPhone+Watch double counting) */
  agg: 'sum' | 'avg' | 'max' | 'last';
  convert: (v: number, unit: Unit) => number | null;
}

const kcal = (v: number, u: Unit) => (u === 'kJ' ? v / 4.184 : u === 'kcal' || u === 'Cal' ? v : null);
const meters = (v: number, u: Unit) => ({ km: v * 1000, m: v, mi: v * 1609.344, ft: v * 0.3048, cm: v / 100 })[u as 'km'] ?? null;
const kg = (v: number, u: Unit) => ({ kg: v, lb: v / 2.2046226218, g: v / 1000 })[u as 'kg'] ?? null;
const pct = (v: number, u: Unit) => (u === '%' ? (v <= 1 ? v * 100 : v) : null);
const same = (v: number) => v;

export const APPLE_TYPES: Record<string, QuantitySpec> = {
  HKQuantityTypeIdentifierStepCount: { metric: 'steps', agg: 'sum', convert: same },
  HKQuantityTypeIdentifierDistanceWalkingRunning: { metric: 'distance_m', agg: 'sum', convert: meters },
  HKQuantityTypeIdentifierFlightsClimbed: { metric: 'floors', agg: 'sum', convert: same },
  HKQuantityTypeIdentifierAppleExerciseTime: { metric: 'active_min', agg: 'sum', convert: (v, u) => (u === 'min' ? v : u === 's' ? v / 60 : null) },
  HKQuantityTypeIdentifierActiveEnergyBurned: { metric: 'active_kcal', agg: 'sum', convert: kcal },
  HKQuantityTypeIdentifierBasalEnergyBurned: { metric: 'basal_kcal', agg: 'sum', convert: kcal },
  HKQuantityTypeIdentifierBodyMass: { metric: 'weight_kg', agg: 'last', convert: kg },
  HKQuantityTypeIdentifierBodyFatPercentage: { metric: 'body_fat_pct', agg: 'last', convert: pct },
};
/** "2024-03-01 07:12:44 +0100" → epoch ms */
export function parseAppleDate(s: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2})(\d{2})$/.exec(s);
  if (!m) return Date.parse(s);
  const [, y, mo, d, h, mi, se, sign, oh, om] = m;
  const utc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +se);
  const off = (+oh * 60 + +om) * 60000 * (sign === '+' ? 1 : -1);
  return utc - off;
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /(\w+)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag))) out[m[1]] = m[2].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  return out;
}

export interface AppleImportResult {
  metrics: { metric: MetricKey; date: string; value: number; origin?: string }[];
  hourly: { date: string; steps: number[] }[];
  records: number;
  usedRecords: number;
  from: string | null;
  to: string | null;
}

/**
 * Streaming parser: feed text chunks with push(), call finish() at the end.
 * Only categories the user consented to are collected.
 */
export class AppleHealthParser {
  private buf = '';
  records = 0;
  used = 0;
  // metric → day → source → values
  private q = new Map<MetricKey, Map<string, Map<string, number[]>>>();
  // day → source → 24 hourly step sums
  private hourly = new Map<string, Map<string, number[]>>();
  private minDay: string | null = null;
  private maxDay: string | null = null;

  constructor(
    private categories: HealthCategory[],
    private fromDay: string | null = null,
  ) {}

  push(chunk: string): void {
    this.buf += chunk;
    // keep everything from the last '<' whose tag is not closed yet (may be a split "<Rec…")
    const lastOpen = this.buf.lastIndexOf('<');
    const end = lastOpen >= 0 && this.buf.indexOf('>', lastOpen) < 0 ? lastOpen : this.buf.length;
    this.scan(this.buf.slice(0, end));
    this.buf = this.buf.slice(end);
    if (this.buf.length > 1_000_000 && this.buf.indexOf('<Record ') < 0) this.buf = this.buf.slice(-200);
  }

  private scan(text: string): void {
    const re = /<Record\s([^>]*)>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      this.records++;
      this.handle(attrs(m[1]));
    }
  }

  private handle(a: Record<string, string>): void {
    const type = a.type;
    if (!type) return;
    const start = parseAppleDate(a.startDate ?? '');
    if (!Number.isFinite(start)) return;
    const day = dayKey(start);
    if (this.fromDay && day < this.fromDay) return;
    const source = a.sourceName ?? 'unknown';

    const spec = APPLE_TYPES[type];
    if (!spec || !this.categories.includes(METRIC_META[spec.metric].category)) return;
    const v = spec.convert(Number(a.value), a.unit ?? '');
    if (v == null || !Number.isFinite(v)) return;
    if (spec.metric === 'steps') {
      const h = this.hourly.get(day) ?? new Map<string, number[]>();
      const arr = h.get(source) ?? new Array(24).fill(0);
      arr[new Date(start).getHours()] += v;
      h.set(source, arr);
      this.hourly.set(day, h);
    }
    const byDay = this.q.get(spec.metric) ?? new Map();
    const bySrc = byDay.get(day) ?? new Map();
    bySrc.set(source, [...(bySrc.get(source) ?? []), v]);
    byDay.set(day, bySrc);
    this.q.set(spec.metric, byDay);
    this.used++;
    this.track(day);
  }

  private track(day: string) {
    if (!this.minDay || day < this.minDay) this.minDay = day;
    if (!this.maxDay || day > this.maxDay) this.maxDay = day;
  }

  finish(): AppleImportResult {
    if (this.buf) this.scan(this.buf + '>');
    this.buf = '';
    const metrics: AppleImportResult['metrics'] = [];
    for (const [metric, byDay] of this.q) {
      const spec = Object.values(APPLE_TYPES).find((s) => s.metric === metric)!;
      for (const [date, bySrc] of byDay) {
        let best: { v: number; src: string } | null = null;
        for (const [src, vs] of bySrc) {
          const v =
            spec.agg === 'sum' ? vs.reduce((a, b) => a + b, 0) : spec.agg === 'avg' ? vs.reduce((a, b) => a + b, 0) / vs.length : spec.agg === 'max' ? Math.max(...vs) : vs[vs.length - 1];
          // sum: largest source total (one device, not iPhone + Watch added); others: source with most samples
          const score = spec.agg === 'sum' ? v : vs.length;
          const bestScore: number = best == null ? -Infinity : spec.agg === 'sum' ? best.v : bySrc.get(best.src)!.length;
          if (score > bestScore) best = { v, src };
        }
        if (best) metrics.push({ metric, date, value: best.v, origin: best.src });
      }
    }
    // hourly steps from the same source that won the daily total
    const hourly: AppleImportResult['hourly'] = [];
    for (const [date, bySrc] of this.hourly) {
      const winner = metrics.find((m) => m.metric === 'steps' && m.date === date)?.origin;
      const arr = (winner && bySrc.get(winner)) || [...bySrc.values()][0];
      if (arr) hourly.push({ date, steps: arr.map((x) => Math.round(x)) });
    }
    return { metrics, hourly, records: this.records, usedRecords: this.used, from: this.minDay, to: this.maxDay };
  }
}
