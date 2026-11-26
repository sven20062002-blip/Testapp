import type { HealthCategory, HealthSourceId } from '@/db/types';
import { addDays, dayKey } from '@/lib/day';
import { METRIC_META } from './meta';
import { getSource, updateSource, upsertHourly, upsertMetrics } from './repo';
import type { AppleImportResult } from './apple';
import { getBridge } from './bridge';

const enabledCats = (c: Record<HealthCategory, boolean>) => (Object.keys(c) as HealthCategory[]).filter((k) => c[k]);
const INITIAL_DAYS = 90;

function syncFrom(lastSyncAt: number | null): string {
  return lastSyncAt ? addDays(dayKey(lastSyncAt), -3) : addDays(dayKey(), -INITIAL_DAYS);
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

export async function syncSource(id: HealthSourceId, _interactive = false): Promise<string> {
  if (id === 'bridge') return syncBridge();
  throw new Error('Diese Quelle wird per Datei-Import aktualisiert.');
}

let running = false;
/** Background sync (app start / app back in foreground). Never opens popups. */
export async function autoSync(minIntervalMs = 30 * 60_000): Promise<void> {
  if (running || !navigator.onLine) return;
  running = true;
  try {
    for (const id of ['bridge'] as const) {
      const s = await getSource(id);
      if (!s.connected || s.lastStatus === 'syncing') continue;
      if (s.lastSyncAt && Date.now() - s.lastSyncAt < minIntervalMs) continue;
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
