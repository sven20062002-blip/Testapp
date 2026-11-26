// E2E: Apple Health import (generated export.zip), activity/body pages, manual entries,
// nutrition profile → targets, custom food → diary maths, barcode fallback, offline lookup.
// Usage: node tests/e2e/health-nutrition.mjs [baseUrl] [screenshotDir]
import { createRequire } from 'node:module';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zipSync, strToU8 } from 'fflate';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright'); }
const { chromium, devices } = pw;

const BASE = process.argv[2] ?? 'http://localhost:4173';
const SHOTS = process.argv[3] ?? null;
const log = (...a) => console.log('✓', ...a);
const fail = (m) => { throw new Error(m); };
const until = async (fn, msg, timeout = 8000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await fn()) return; await new Promise((r) => setTimeout(r, 150)); }
  fail(msg);
};

// ---------- build a realistic Apple Health export (30 days) ----------
const pad = (n) => String(n).padStart(2, '0');
const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00 +0100`;
let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<HealthData locale="de_DE">\n';
const R = (type, unit, value, a, b, src = 'iPhone') => `<Record type="${type}" sourceName="${src}" unit="${unit}" creationDate="${fmt(b)}" startDate="${fmt(a)}" endDate="${fmt(b)}" value="${value}"/>\n`;
const S = (v, a, b) => `<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Apple Watch" startDate="${fmt(a)}" endDate="${fmt(b)}" value="HKCategoryValueSleepAnalysis${v}"/>\n`;
const today = new Date(); today.setHours(0, 0, 0, 0);
for (let i = 30; i >= 0; i--) {
  const d = new Date(today); d.setDate(d.getDate() - i);
  const at = (h, m = 0) => { const x = new Date(d); x.setHours(h, m); return x; };
  for (const [h, n] of [[8, 1800], [12, 2600], [18, 3100 + (i % 5) * 300]]) {
    xml += R('HKQuantityTypeIdentifierStepCount', 'count', n, at(h), at(h, 30), 'iPhone');
    xml += R('HKQuantityTypeIdentifierStepCount', 'count', Math.round(n * 0.9), at(h), at(h, 30), 'Apple Watch'); // must not double count
  }
  xml += R('HKQuantityTypeIdentifierRestingHeartRate', 'count/min', 56 + (i % 4), at(9), at(9));
  xml += R('HKQuantityTypeIdentifierHeartRateVariabilitySDNN', 'ms', 48 + (i % 6), at(6), at(6));
  xml += R('HKQuantityTypeIdentifierActiveEnergyBurned', 'kcal', 420, at(20), at(20));
  if (i % 3 === 0) xml += R('HKQuantityTypeIdentifierBodyMass', 'kg', (82 - (30 - i) * 0.05).toFixed(1), at(7), at(7), 'Waage');
  // night ending on day d
  const n0 = at(0); n0.setDate(n0.getDate() - 1); n0.setHours(23, 0);
  const t = (min) => new Date(n0.getTime() + min * 60000);
  xml += S('AsleepCore', t(0), t(120)) + S('AsleepDeep', t(120), t(200)) + S('Awake', t(200), t(210)) + S('AsleepREM', t(210), t(300)) + S('AsleepCore', t(300), t(450));
}
xml += '</HealthData>\n';
const dir = mkdtempSync(join(tmpdir(), 'forge-e2e-'));
const zipPath = join(dir, 'Export.zip');
writeFileSync(zipPath, zipSync({ 'apple_health_export/export.xml': strToU8(xml), 'apple_health_export/export_cda.xml': strToU8('<x/>') }));

// ---------- run ----------
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
page.setDefaultTimeout(10000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|openfoodfacts|ERR_/.test(m.text()) && errors.push(m.text()));
const shot = (n) => SHOTS && page.screenshot({ path: `${SHOTS}/${n}.png` });

await page.goto(BASE + '/health/sources');
await page.getByRole('button', { name: /Export\.zip auswählen/ }).click();
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Zustimmen & Datei wählen' }).click()]);
await chooser.setFiles(zipPath);
await page.getByText(/Import abgeschlossen/).waitFor({ timeout: 30000 });
log('Apple Health export.zip imported via UI');

// Google: client-id validation (no network calls needed)
await page.getByLabel('OAuth-Client-ID').fill('not-a-client-id');
await page.getByRole('button', { name: 'Verbinden …' }).click();
await page.getByRole('button', { name: /Zustimmen & bei Google anmelden/ }).click();
await page.getByText(/keine gültige OAuth-Client-ID/).waitFor();
await page.keyboard.press('Escape');
log('Google Health: invalid client id rejected before any request');

await page.goto(BASE + '/activity');
await until(async () => /9\.[0-9]{3}|8\.[0-9]{3}|10\.[0-9]{3}/.test(await page.locator('.card').first().innerText()), 'steps not shown');
const stepsText = await page.locator('.card').first().innerText();
// today: 1800+2600+3100 = 7500 (iPhone) – Watch must not be added (would be 14 250)
if (!stepsText.includes('7.500')) fail('wrong steps (double counting?): ' + stepsText.slice(0, 120));
log('activity: steps de-duplicated (7.500, not iPhone+Watch)');
await page.getByText('Aktivität im Tagesverlauf').waitFor();
await shot('h-activity');

// toggles: knob must stay inside the track
await page.goto(BASE + '/settings');
const sw = page.getByRole('switch').first();
const [track, knob] = await Promise.all([sw.boundingBox(), sw.locator('span').boundingBox()]);
if (knob.x < track.x - 0.5 || knob.x + knob.width > track.x + track.width + 0.5) fail(`toggle knob outside track: ${JSON.stringify({ track, knob })}`);
await sw.click();
const knob2 = await sw.locator('span').boundingBox();
if (knob2.x < track.x - 0.5 || knob2.x + knob2.width > track.x + track.width + 0.5) fail('toggle knob outside track after switching');
await sw.click();
log('toggle knob stays inside the track (on and off)');
await shot('s-settings');

// sleep & vitals were removed from the app: the old routes must be gone and the import must not store them
await page.goto(BASE + '/health');
await page.waitForURL('**/activity');
if (/Schlaf|Readiness|Recovery|Ruhepuls|HRV/.test(await page.locator('main').innerText())) fail('sleep/vitals still visible');
log('/health redirects to Aktivität, no sleep/vital/readiness UI');
const stored = await page.evaluate(() => new Promise((res) => {
  const r = indexedDB.open('forge');
  r.onsuccess = () => {
    const d = r.result;
    const tx = d.transaction('healthMetrics');
    const q = tx.objectStore('healthMetrics').getAll();
    q.onsuccess = () => res({ tables: [...d.objectStoreNames], metrics: [...new Set(q.result.map((m) => m.metric))] });
  };
}));
if (stored.tables.includes('sleepSessions')) fail('sleepSessions table still exists');
if (stored.metrics.some((m) => ['rhr', 'hrv_sdnn', 'hr_avg', 'resp_rate'].includes(m))) fail('vital values imported: ' + stored.metrics);
log('import stored only', stored.metrics.join(', '));

// manual weight entry + body page
await page.goto(BASE + '/body');
await page.getByRole('button', { name: 'Wiegen' }).click();
await page.getByLabel('Wert (kg)').fill('80,4');
await page.getByRole('dialog').getByRole('button', { name: 'Speichern' }).click();
await page.getByText('80,4 kg').first().waitFor();
log('manual weight entry shown');
await shot('h-body');

// ---------- nutrition ----------
await page.goto(BASE + '/nutrition/profile');
for (const [label, v] of [['Alter', '30'], ['Größe', '180'], ['Zielgewicht', '78']]) {
  await page.getByLabel(label, { exact: true }).fill(v);
  await page.getByLabel(label, { exact: true }).press('Enter');
}
await page.getByRole('radio', { name: /Männlich|männlich/ }).first().click().catch(async () => page.getByText('Männlich').first().click());
await page.waitForTimeout(400);
await until(async () => /Grundumsatz/.test(await page.locator('body').innerText()), 'BMR not calculated');
// Mifflin: 10*80.4 + 6.25*180 − 5*30 + 5 = 1784
await until(async () => /1\.78[45]/.test(await page.locator('body').innerText()), 'BMR value wrong (expected ~1.785 kcal)');
log('profile → BMR from Mifflin-St Jeor with tracked weight');
await shot('n-profile');

await page.goto(BASE + '/nutrition');
await page.getByRole('button', { name: /Erstes Lebensmittel erfassen/ }).click();
await page.getByRole('button', { name: 'Eigenes' }).click();
await page.locator('#food-name').fill('Testjoghurt');
await page.getByLabel(/Kalorien pro 100 g/).fill('150');
await page.getByLabel(/Protein pro 100 g/).fill('10');
await page.getByLabel(/Kohlenhydrate pro 100 g/).fill('15');
await page.getByLabel(/^Fett pro 100 g/).fill('5');
await page.getByRole('dialog').getByRole('button', { name: 'Speichern' }).click();
await page.locator('#amount').waitFor();
await page.locator('#amount').fill('200');
await page.getByRole('dialog').getByRole('button', { name: 'Hinzufügen', exact: true }).click();
await until(async () => /300/.test(await page.locator('.card').first().innerText()), 'calories not 300');
const day = await page.locator('main').innerText();
if (!/Testjoghurt/.test(day)) fail('entry missing');
log('diary: 200 g × (150 kcal/10 P/15 C/5 F per 100 g) = 300 kcal');
await shot('n-diary');

// barcode: manual entry, offline → local lookup / not found → create form with barcode
await ctx.setOffline(true);
if (!(await page.getByRole('button', { name: 'Barcode scannen' }).isVisible())) await page.getByRole('button', { name: 'Zu Snacks hinzufügen' }).click(); // add-sheet stays open for the next item
await page.getByRole('button', { name: 'Barcode scannen' }).click();
await page.getByLabel('Barcode manuell eingeben').fill('4006381333931');
await page.getByLabel('Barcode manuell eingeben').press('Enter');
await until(async () => /offline|Internetverbindung|nicht gefunden|anlegen/i.test(await page.locator('body').innerText()), 'barcode fallback missing');
log('barcode offline: clear message / create-product fallback');
await ctx.setOffline(false);
await shot('n-barcode');

await page.goto(BASE + '/');
await page.getByRole('heading', { name: 'Heute' }).waitFor();
await page.waitForTimeout(500);
await shot('d-dashboard');

await browser.close();
if (errors.length) { console.error('Console errors:\n' + errors.join('\n')); process.exit(1); }
console.log('\nHEALTH + NUTRITION E2E PASSED');
