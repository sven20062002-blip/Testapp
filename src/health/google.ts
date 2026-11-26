/**
 * Google Health API (successor of the Fitbit Web API, which Google shut down in 2026).
 * Fitbit devices – including the Fitbit Air – sync to the Google Health app; this API
 * exposes that cloud data via REST: https://health.googleapis.com/v4/users/me/dataTypes/{type}/dataPoints
 *
 * Auth: Google OAuth 2.0 in the browser via Google Identity Services (token model).
 *  - The user creates a Google Cloud project, enables the Google Health API and creates an
 *    OAuth client of type "Web application" with this app's URL as authorised JavaScript origin.
 *  - Only the public client id is stored; there is no client secret in the app.
 *  - Access tokens live ~1 h. Browsers cannot hold refresh tokens safely → after expiry the
 *    user taps "Synchronisieren" again (Google usually re-issues the token without a new consent).
 *
 * Response formats were implemented from Google's published reference; parsing is defensive
 * and raw samples are stored as diagnostics so mismatches are visible instead of silently wrong.
 */
import type { HealthCategory, MetricKey } from '@/db/types';
import { addDays, dayKey, parseDay } from '@/lib/day';

export const API = 'https://health.googleapis.com/v4';
const SCOPE_BASE = 'https://www.googleapis.com/auth/googlehealth.';

export const CATEGORY_SCOPES: Record<HealthCategory, string> = {
  activity: `${SCOPE_BASE}activity_and_fitness.readonly`,
  body: `${SCOPE_BASE}health_metrics_and_measurements.readonly`,
};

export function scopesFor(categories: HealthCategory[]): string[] {
  return [...new Set(categories.map((c) => CATEGORY_SCOPES[c]))];
}

/* ---------------- OAuth (Google Identity Services) ---------------- */

interface TokenResponse {
  access_token?: string;
  expires_in?: number | string;
  scope?: string;
  error?: string;
  error_description?: string;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(cfg: {
            client_id: string;
            scope: string;
            include_granted_scopes?: boolean;
            prompt?: string;
            callback: (r: TokenResponse) => void;
            error_callback?: (e: { type: string; message?: string }) => void;
          }): { requestAccessToken(o?: { prompt?: string }): void };
          revoke(token: string, done?: () => void): void;
        };
      };
    };
  }
}

let gisPromise: Promise<void> | null = null;
export function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      gisPromise = null;
      reject(new Error('Google-Anmeldung konnte nicht geladen werden (offline oder blockiert).'));
    };
    document.head.appendChild(s);
  });
  return gisPromise;
}

/** Must be called from a user gesture (opens Google's consent popup). */
export async function requestToken(clientId: string, scopes: string[], prompt: '' | 'consent' = ''): Promise<{ token: string; expiresAt: number; granted: string[] }> {
  await loadGis();
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: scopes.join(' '),
      include_granted_scopes: false,
      callback: (r) => {
        if (r.error || !r.access_token) reject(new Error(r.error_description || r.error || 'Anmeldung abgebrochen'));
        else
          resolve({
            token: r.access_token,
            expiresAt: Date.now() + (Number(r.expires_in ?? 3600) - 60) * 1000,
            granted: (r.scope ?? '').split(' ').filter(Boolean),
          });
      },
      error_callback: (e) => reject(new Error(e.type === 'popup_closed' ? 'Anmeldefenster geschlossen' : e.message || e.type)),
    });
    client.requestAccessToken({ prompt });
  });
}

export function revokeToken(token: string): void {
  try {
    window.google?.accounts.oauth2.revoke(token);
  } catch {
    /* best effort */
  }
}

/* ---------------- REST helpers ---------------- */

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: string,
  ) {
    super(message);
  }
}

export type Fetcher = (path: string, init?: RequestInit) => Promise<any>;

export function makeFetcher(token: string, onRaw?: (path: string, text: string) => void): Fetcher {
  return async (path, init) => {
    const res = await fetch(`${API}/${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
    const text = await res.text();
    onRaw?.(path, text);
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        msg = JSON.parse(text).error?.message ?? msg;
      } catch {
        /* not json */
      }
      throw new ApiError(msg, res.status, text);
    }
    return text ? JSON.parse(text) : {};
  };
}

/** GET all pages of a dataPoints list (bounded). */
export async function listAll(f: Fetcher, dataType: string, filter?: string, maxPages = 20): Promise<any[]> {
  const out: any[] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < maxPages; i++) {
    const q = new URLSearchParams({ pageSize: '1000' });
    if (filter) q.set('filter', filter);
    if (pageToken) q.set('pageToken', pageToken);
    const json = await f(`users/me/dataTypes/${dataType}/dataPoints?${q}`);
    out.push(...(json.dataPoints ?? []));
    pageToken = json.nextPageToken;
    if (!pageToken) break;
  }
  return out;
}

/* ---------------- defensive parsing ---------------- */

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);

/** The type-specific payload of a data point (e.g. dp.steps, dp.weight). */
export function payloadOf(dp: Record<string, any>): Record<string, any> {
  const skip = ['name', 'dataSource', 'dataType', 'metadata', 'interval', 'civilStartTime', 'civilEndTime', 'date', 'sampleTime', 'startTime', 'endTime'];
  for (const [k, v] of Object.entries(dp)) if (!skip.includes(k) && isObj(v)) return v;
  return dp;
}

function civilToDate(c: any): Date | null {
  const d = isObj(c?.date) ? c.date : c;
  if (isObj(d) && d.year && d.month && d.day) {
    const t = isObj(c?.time) ? c.time : {};
    return new Date(d.year, d.month - 1, d.day, t.hours ?? 0, t.minutes ?? 0, t.seconds ?? 0);
  }
  return null;
}

/** Find the local day a data point belongs to. */
export function extractDay(p: Record<string, any>): string | null {
  const candidates = [p.date, p.civilDate, p.interval?.civilStartTime, p.civilStartTime, p.sampleTime?.civilTime];
  for (const c of candidates) {
    const d = civilToDate(c);
    if (d) return dayKey(d);
  }
  const iso = p.interval?.startTime ?? p.startTime ?? p.sampleTime?.physicalTime ?? p.time ?? p.physicalTime;
  if (typeof iso === 'string' && !Number.isNaN(Date.parse(iso))) return dayKey(Date.parse(iso));
  return null;
}

/** All numeric leaves (numbers or numeric strings) with their key path. */
export function numericLeaves(o: unknown, path = ''): { key: string; value: number }[] {
  const out: { key: string; value: number }[] = [];
  if (isObj(o))
    for (const [k, v] of Object.entries(o)) {
      if (['date', 'interval', 'sampleTime', 'civilStartTime', 'civilEndTime', 'time'].includes(k)) continue;
      out.push(...numericLeaves(v, path ? `${path}.${k}` : k));
    }
  else if (typeof o === 'number' && Number.isFinite(o)) out.push({ key: path, value: o });
  else if (typeof o === 'string' && /^-?\d+(\.\d+)?$/.test(o)) out.push({ key: path, value: Number(o) });
  return out;
}

/** Convert a value to our unit based on the field name the API used. */
export function normalizeUnit(metric: MetricKey, key: string, v: number): number {
  const k = key.toLowerCase();
  if (metric === 'distance_m') {
    if (k.includes('millimeter')) return v / 1000;
    if (k.includes('kilometer')) return v * 1000;
    return v;
  }
  if (metric === 'weight_kg') {
    if (k.includes('kilogram')) return v;
    if (k.includes('gram')) return v / 1000;
    if (k.includes('pound')) return v / 2.2046226218;
    return v > 1000 ? v / 1000 : v;
  }
  if (metric === 'active_min' && (k.includes('second') || k.includes('duration'))) return v / 60;
  if (metric === 'active_min' && k.includes('millis')) return v / 60000;
  if (metric === 'body_fat_pct') return v <= 1 ? v * 100 : v;
  return v;
}

/** Pick the most plausible numeric field for a metric. */
export function pickValue(metric: MetricKey, p: Record<string, any>): { value: number; key: string } | null {
  const leaves = numericLeaves(p);
  if (!leaves.length) return null;
  const prefs: Partial<Record<MetricKey, RegExp[]>> = {
    steps: [/countsum/i, /count/i],
    distance_m: [/millimeterssum/i, /sum/i, /meter/i],
    floors: [/countsum/i, /sum/i, /count/i],
    active_min: [/sum/i, /minutes/i, /duration/i],
    active_kcal: [/kcalsum/i, /sum/i, /kcal|calorie/i],
    total_kcal: [/kcalsum/i, /sum/i, /kcal|calorie/i],
    weight_kg: [/kilogram/i, /gram/i, /weight/i],
    body_fat_pct: [/percent/i, /fat/i],
  };
  for (const re of prefs[metric] ?? []) {
    const hit = leaves.find((l) => re.test(l.key.split('.').pop() ?? l.key));
    if (hit) return { value: normalizeUnit(metric, hit.key, hit.value), key: hit.key };
  }
  return { value: normalizeUnit(metric, leaves[0].key, leaves[0].value), key: leaves[0].key };
}

/** Aggregate parsed points to one value per day. */
export function aggregateDaily(points: { day: string; value: number }[], agg: 'sum' | 'avg' | 'max' | 'last'): Map<string, number> {
  const by = new Map<string, number[]>();
  for (const p of points) by.set(p.day, [...(by.get(p.day) ?? []), p.value]);
  const out = new Map<string, number>();
  for (const [d, vs] of by) {
    if (agg === 'sum') out.set(d, vs.reduce((a, b) => a + b, 0));
    else if (agg === 'avg') out.set(d, vs.reduce((a, b) => a + b, 0) / vs.length);
    else if (agg === 'max') out.set(d, Math.max(...vs));
    else out.set(d, vs[vs.length - 1]);
  }
  return out;
}

/* ---------------- what to sync ---------------- */

export interface DailySpec {
  dataType: string;
  metric: MetricKey;
  category: HealthCategory;
  /** 'rollup' = server-side daily aggregation; 'list' = raw/daily points aggregated locally */
  mode: 'rollup' | 'list';
  agg: 'sum' | 'avg' | 'max' | 'last';
  /** maximum range per rollup request (days) */
  maxRangeDays?: number;
}

export const DAILY_SPECS: DailySpec[] = [
  { dataType: 'steps', metric: 'steps', category: 'activity', mode: 'rollup', agg: 'sum' },
  { dataType: 'distance', metric: 'distance_m', category: 'activity', mode: 'rollup', agg: 'sum' },
  { dataType: 'floors', metric: 'floors', category: 'activity', mode: 'rollup', agg: 'sum' },
  { dataType: 'active-minutes', metric: 'active_min', category: 'activity', mode: 'rollup', agg: 'sum', maxRangeDays: 14 },
  { dataType: 'active-energy-burned', metric: 'active_kcal', category: 'activity', mode: 'rollup', agg: 'sum' },
  { dataType: 'total-calories', metric: 'total_kcal', category: 'activity', mode: 'rollup', agg: 'sum', maxRangeDays: 14 },
  { dataType: 'weight', metric: 'weight_kg', category: 'body', mode: 'list', agg: 'last' },
  { dataType: 'body-fat', metric: 'body_fat_pct', category: 'body', mode: 'list', agg: 'last' },
];


function civil(key: string) {
  const d = parseDay(key);
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

/** Split [from,to] into chunks of n days. */
export function chunks(from: string, to: string, n: number): [string, string][] {
  const out: [string, string][] = [];
  for (let a = from; a <= to; a = addDays(a, n)) {
    const b = addDays(a, n - 1);
    out.push([a, b < to ? b : to]);
  }
  return out;
}

/**
 * Daily rollup. Tries the documented dailyRollUp (civil dates); falls back to rollUp with
 * 24 h windows starting at local midnight. Returns raw rollup points.
 */
export async function dailyRollup(f: Fetcher, dataType: string, from: string, to: string): Promise<any[]> {
  const endExclusive = addDays(to, 1);
  const bodies = [
    { range: { start: { date: civil(from) }, end: { date: civil(endExclusive) } }, windowSizeDays: 1 },
    { range: { startDate: civil(from), endDate: civil(endExclusive) }, windowSizeDays: 1 },
  ];
  let lastErr: unknown;
  for (const body of bodies) {
    try {
      const json = await f(`users/me/dataTypes/${dataType}/dataPoints:dailyRollUp`, { method: 'POST', body: JSON.stringify(body) });
      return json.rollupDataPoints ?? json.dataPoints ?? [];
    } catch (e) {
      lastErr = e;
      if (!(e instanceof ApiError) || e.status !== 400) throw e;
    }
  }
  try {
    const json = await f(`users/me/dataTypes/${dataType}/dataPoints:rollUp`, {
      method: 'POST',
      body: JSON.stringify({
        range: { startTime: parseDay(from).toISOString(), endTime: parseDay(endExclusive).toISOString() },
        windowSize: '86400s',
      }),
    });
    return json.rollupDataPoints ?? json.dataPoints ?? [];
  } catch (e) {
    throw lastErr instanceof ApiError && !(e instanceof ApiError) ? lastErr : e;
  }
}
