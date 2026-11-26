// E2E: native-app flow with a simulated Apple Health bridge (as the iOS/Android app injects it).
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright'); }
const BASE = process.argv[2] ?? 'http://localhost:4173';
const SHOTS = process.argv[3] ?? null;
const log = (...a) => console.log('✓', ...a);
const fail = (m) => { throw new Error(m); };
const errors = [];
const b = await pw.chromium.launch();
const ctx = await b.newContext({ ...pw.devices['iPhone 13'] });
await ctx.addInitScript(() => {
  const today = new Date();
  const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  window.__asked = [];
  window.ForgeHealthBridge = {
    platform: 'healthkit',
    version: 'Apple Health',
    isAvailable: async () => true,
    requestPermissions: async (c) => (window.__asked.push(c), c),
    read: async () => ({ metrics: [
      { metric: 'steps', date: key(today), value: 9876, origin: 'iPhone' },
      { metric: 'weight_kg', date: key(today), value: 80.4, origin: 'Waage' },
    ] }),
  };
});
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(BASE);
await page.getByLabel('Name').fill('Test');
await page.getByRole('button', { name: "Los geht's" }).click();
await page.getByRole('radio', { name: 'Männlich' }).click();
await page.getByLabel('Alter').fill('30');
await page.getByLabel('Größe').fill('180');
await page.getByLabel('Aktuelles Körpergewicht').fill('80');
for (let i = 0; i < 3; i++) await page.getByRole('button', { name: /^Weiter/ }).click();
await page.getByRole('heading', { name: 'Alltag & Darstellung' }).waitFor();
await page.getByRole('button', { name: 'Mit Apple Health verbinden' }).click();
await page.getByText(/Verbunden – 2 Tageswerte/).waitFor();
if (SHOTS) await page.screenshot({ path: `${SHOTS}/n1-connect.png` });
const asked = await page.evaluate(() => window.__asked);
if (JSON.stringify(asked) !== JSON.stringify([['activity', 'body']])) fail('unexpected permission request: ' + JSON.stringify(asked));
log('onboarding offers Apple Health in the native app and imports data');
await page.getByRole('button', { name: /^Weiter/ }).click();
await page.getByRole('button', { name: 'Training starten' }).click();
await page.getByRole('button', { name: 'Tour beenden' }).click();
await page.getByTestId('app-tour').waitFor({ state: 'detached' });
await page.locator('[data-widget="activity"]').getByText('9.876').waitFor();
await page.locator('[data-widget="body"]').getByText('80,4').waitFor();
log('steps and weight from Apple Health appear on the home screen');
if (errors.length) fail(errors.join('\n'));
await b.close();
console.log('NATIVE E2E PASSED');
