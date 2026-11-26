import type { HealthCategory, HealthSourceId, MetricKey } from '@/db/types';
import { addDays, dayKey } from '@/lib/day';
import { METRIC_META } from './meta';
import { getSource, updateSource, upsertHourly, upsertMetrics } from './repo';
import * as G from './google';
import type { AppleImportResult } from './apple';
import { getBridge } from './bridge';

export class NeedsAuthError extends Error {
  constructor() {
    super('Die Google-Anmeldung ist abgelaufen. Bitte erneut verbinden/synchronisieren.');
  }
}

const enabledCats = (c: Record<HealthCategory, boolean>) => (Object.keys(c) as HealthCategory[]).filter((k) => c[k]);
const INITIAL_DAYS = 90;

function syncFrom(lastSyncAt: number | null): string {
  return lastSyncAt ? addDays(dayKey(lastSyncAt), -3) : addDays(dayKey(), -INITIAL_DAYS);
}

/* ======================= Google Health API ======================= */

export async function connectGoogle(clientId: string, categories: HealthCategory[]): Promise<void> {
  const id = clientId.trim();
  if (!/\.apps\.googleusercontent\.com$/.test(id)) throw new Error('Das ist keine gültige OAuth-Client-ID (endet auf .apps.googleusercontent.com).');
  if (!categories.length) throw new Error('Bitte mindestens eine Datenkategorie freigeben.');
  const t = await G.requestToken(id, G.scopesFor(categories), 'consent');
  // keep only categories whose scope Google actually granted
  const granted = Object.fromEntries(
    (['activity', 'body'] as HealthCategory[]).map((c) => [c, categories.includes(c) && t.granted.includes(G.CATEGORY_SCOPES[c])]),
  ) as Record<HealthCategory, boolean>;
  await updateSource('google', {
    connected: true,
    clientId: id,
    accessToken: t.token,
    tokenExpiresAt: t.expiresAt,
    grantedScopes: t.granted,
    categories: granted,
    consentAt: Date.now(),
    lastError: null,
  });
}

/** Interactive = triggered by a tap → may open the Google popup to refresh the token. */
export async function syncGoogle(interactive: boolean): Promise<string> {
  let src = await getSource('google');
  if (!src.connected || !src.clientId) throw new Error('Google Health ist nicht verbunden.');
  const cats = enabledCats(src.categories);
  if (!cats.length) throw new Error('Keine Datenkategorie freigegeben.');
  if (!src.accessToken || !src.tokenExpiresAt || src.tokenExpiresAt < Date.now()) {
    if (!interactive) throw new NeedsAuthError();
    const t = await G.requestToken(src.clientId, G.scopesFor(cats), '');
    src = await updateSource('google', { accessToken: t.token, tokenExpiresAt: t.expiresAt, grantedScopes: t.granted });
  }

  await updateSource('google', { lastStatus: 'syncing', lastError: null });
  const diagnostics: Record<string, string> = { ...(src.diagnostics ?? {}) };
  const f = G.makeFetcher(src.accessToken!, (path, text) => {
    const key = path.split('/dataTypes/')[1]?.split('/')[0] ?? path;
    diagnostics[key] = text.slice(0, 2500);
  });
  const from = syncFrom(src.lastSyncAt);
  const to = dayKey();
  const report: string[] = [];
  const errors: string[] = [];

  try {
    for (const spec of G.DAILY_SPECS) {
      if (!cats.includes(spec.category)) continue;
      try {
        const rows: { metric: MetricKey; date: string; value: number }[] = [];
        if (spec.mode === 'rollup') {
          for (const [a, b] of G.chunks(from, to, spec.maxRangeDays ?? 90)) {
            for (const p of await G.dailyRollup(f, spec.dataType, a, b)) {
              const day = G.extractDay(p) ?? G.extractDay(G.payloadOf(p));
              const v = G.pickValue(spec.metric, G.payloadOf(p));
              if (day && v && day >= from) rows.push({ metric: spec.metric, date: day, value: v.value });
            }
          }
        } else {
          const points = await G.listAll(f, spec.dataType, undefined, 5);
          const parsed = points
            .map((dp) => {
              const p = G.payloadOf(dp);
              const day = G.extractDay(p);
              const v = G.pickValue(spec.metric, p);
              return day && v ? { day, value: v.value } : null;
            })
            .filter((x): x is { day: string; value: number } => !!x && x.day >= from);
          for (const [date, value] of G.aggregateDaily(parsed, spec.agg)) rows.push({ metric: spec.metric, date, value });
        }
        const n = await upsertMetrics('google', rows.map((r) => ({ ...r, kind: 'measured' as const, origin: 'Google Health' })));
        report.push(`${METRIC_META[spec.metric].label}: ${n}`);
      } catch (e) {
        if (e instanceof G.ApiError && e.status === 401) throw new NeedsAuthError();
        errors.push(`${METRIC_META[spec.metric].label}: ${(e as Error).message}`);
      }
    }

    if (cats.includes('activity')) {
      // intraday distribution (today + yesterday) for "Aktivität im Tagesverlauf"
      try {
        const days: { date: string; steps: number[] }[] = [];
        for (const d of [addDays(to, -1), to]) {
          const startT = new Date(`${d}T00:00:00`).getTime();
          const json = await f('users/me/dataTypes/steps/dataPoints:rollUp', {
            method: 'POST',
            body: JSON.stringify({ range: { startTime: new Date(startT).toISOString(), endTime: new Date(startT + 86400000).toISOString() }, windowSize: '3600s' }),
          });
          const steps = new Array(24).fill(0);
          for (const p of json.rollupDataPoints ?? []) {
            const t = Date.parse(p.startTime ?? p.interval?.startTime ?? '');
            const v = G.pickValue('steps', G.payloadOf(p));
            if (!Number.isNaN(t) && v) steps[new Date(t).getHours()] += v.value;
          }
          days.push({ date: d, steps });
        }
        await upsertHourly('google', days);
      } catch (e) {
        if (e instanceof G.ApiError && e.status === 401) throw new NeedsAuthError();
        errors.push(`Tagesverlauf: ${(e as Error).message}`);
      }
    }

  } catch (e) {
    await updateSource('google', {
      lastStatus: 'error',
      lastError: (e as Error).message,
      diagnostics,
      ...(e instanceof NeedsAuthError ? { accessToken: null, tokenExpiresAt: null } : {}),
    });
    throw e;
  }

  const summary = report.join(' · ');
  await updateSource('google', {
    lastSyncAt: Date.now(),
    lastStatus: errors.length && !report.length ? 'error' : 'ok',
    lastError: errors.length ? errors.join('\n') : null,
    lastSummary: summary,
    diagnostics,
  });
  return summary;
}

/* ======================= Apple Health export ======================= */

export async function importAppleExport(
  file: File,
  categories: HealthCategory[],
  fromDay: string | null,
  onProgress: (p: { read: number; total: number; records: number }) => void,
): Promise<AppleImportResult> {
  if (!categories.length) throw new Error('Bitte mindestens eine Datenkategorie auswählen.');
  await updateSource('apple', { lastStatus: 'syncing', lastError: null, categories: Object.fromEntries((['activity', 'body'] as HealthCategory[]).map((c) => [c, categories.includes(c)])) as Record<HealthCategory, boolean> });
  const worker = new Worker(new URL('./appleWorker.ts', import.meta.url), { type: 'module' });
  try {
    const result = await new Promise<AppleImportResult>((resolve, reject) => {
      worker.onmessage = (e) => {
        const m = e.data;
        if (m.type === 'progress') onProgress(m);
        if (m.type === 'done') resolve(m.result);
        if (m.type === 'error') reject(new Error(m.message));
      };
      worker.onerror = (e) => reject(new Error(e.message || 'Import fehlgeschlagen'));
      worker.postMessage({ file, categories, fromDay });
    });
    const n = await upsertMetrics('apple', result.metrics.map((m) => ({ ...m, kind: 'measured' as const })));
    if (categories.includes('activity')) await upsertHourly('apple', result.hourly.filter((h) => !fromDay || h.date >= fromDay));
    const summary = `${n} Tageswerte aus ${result.usedRecords.toLocaleString('de-DE')} von ${result.records.toLocaleString('de-DE')} Einträgen${result.from ? ` (${result.from} bis ${result.to})` : ''}`;
    await updateSource('apple', { connected: true, consentAt: Date.now(), lastSyncAt: Date.now(), lastStatus: 'ok', lastSummary: summary });
    return result;
  } catch (e) {
    await updateSource('apple', { lastStatus: 'error', lastError: (e as Error).message });
    throw e;
  } finally {
    worker.terminate();
  }
}

/* ======================= Native bridge ======================= */

export async function connectBridge(categories: HealthCategory[]): Promise<void> {
  const b = getBridge();
  if (!b || !(await b.isAvailable())) throw new Error('Keine native Brücke verfügbar – nur in der nativen App-Hülle (Android/iOS) möglich.');
  const granted = await b.requestPermissions(categories);
  await updateSource('bridge', {
    connected: granted.length > 0,
    consentAt: Date.now(),
    categories: Object.fromEntries((['activity', 'body'] as HealthCategory[]).map((c) => [c, granted.includes(c)])) as Record<HealthCategory, boolean>,
  });
}

export async function syncBridge(): Promise<string> {
  const b = getBridge();
  const src = await getSource('bridge');
  if (!b || !src.connected) throw new Error('Native Brücke nicht verbunden.');
  await updateSource('bridge', { lastStatus: 'syncing', lastError: null });
  try {
    const cats = enabledCats(src.categories);
    const data = await b.read({ from: syncFrom(src.lastSyncAt), to: dayKey(), categories: cats });
    const metrics = data.metrics.filter((m) => cats.includes(METRIC_META[m.metric]?.category));
    const n = await upsertMetrics('bridge', metrics);
    const summary = `${n} Tageswerte`;
    await updateSource('bridge', { lastSyncAt: Date.now(), lastStatus: 'ok', lastSummary: summary });
    return summary;
  } catch (e) {
    await updateSource('bridge', { lastStatus: 'error', lastError: (e as Error).message });
    throw e;
  }
}

/* ======================= orchestration ======================= */

export async function syncSource(id: HealthSourceId, interactive: boolean): Promise<string> {
  if (id === 'google') return syncGoogle(interactive);
  if (id === 'bridge') return syncBridge();
  throw new Error('Diese Quelle wird per Datei-Import aktualisiert.');
}

let running = false;
/** Background sync (app start / app back in foreground). Never opens popups. */
export async function autoSync(minIntervalMs = 30 * 60_000): Promise<void> {
  if (running || !navigator.onLine) return;
  running = true;
  try {
    for (const id of ['google', 'bridge'] as const) {
      const s = await getSource(id);
      if (!s.connected || s.lastStatus === 'syncing') continue;
      if (s.lastSyncAt && Date.now() - s.lastSyncAt < minIntervalMs) continue;
      if (id === 'google' && (!s.accessToken || (s.tokenExpiresAt ?? 0) < Date.now())) continue;
      try {
        await syncSource(id, false);
      } catch {
        /* status is stored on the source */
      }
    }
  } finally {
    running = false;
  }
}
