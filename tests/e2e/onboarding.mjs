// E2E: onboarding flow, resume after leaving the app, data stored, plan-editor draft restore.
// Usage: node tests/e2e/onboarding.mjs [baseUrl] [screenshotDir]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright'); }
const { chromium, devices } = pw;

const BASE = process.argv[2] ?? 'http://localhost:4173';
const SHOTS = process.argv[3] ?? null;
const errors = [];
const log = (...a) => console.log('✓', ...a);
const fail = (m) => { throw new Error(m); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
page.setDefaultTimeout(8000);
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
const shot = (n) => SHOTS && page.screenshot({ path: `${SHOTS}/${n}.png` });
const hide = () => page.evaluate(() => {
  // simulate the app being sent to the background
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
});
const valueIs = async (label, v, msg) => {
  const end = Date.now() + 10000;
  while (Date.now() < end) {
    if ((await page.getByLabel(label).first().inputValue().catch(() => null)) === v) return;
    await page.waitForTimeout(100);
  }
  fail(msg + ` (got "${await page.getByLabel(label).first().inputValue().catch(() => '?')}")`);
};
const next = () => page.getByRole('button', { name: /^(Los geht's|Weiter)/ }).click();

await page.goto(BASE);
await page.getByRole('heading', { name: 'Willkommen bei Forge' }).waitFor();
await shot('o1-welcome');
await page.getByLabel('Name').fill('Sven');
await next();
await page.getByRole('heading', { name: 'Über dich' }).waitFor();
log('welcome → body step');

// required fields block "Weiter"
await next();
await page.getByText('Bitte ergänze die markierten Angaben.').waitFor();
await page.getByRole('radio', { name: 'Männlich' }).click();
await page.getByLabel('Alter').fill('24');
await page.getByLabel('Größe').fill('182');
await page.getByLabel('Aktuelles Körpergewicht').fill('80,5');
await shot('o2-body');
log('validation blocks incomplete body data');

// leave the app with the focus still in the field, then "kill" it (reload)
await hide();
await page.waitForTimeout(300);
await page.reload();
await page.getByRole('heading', { name: 'Über dich' }).waitFor();
await valueIs('Aktuelles Körpergewicht', '80,5', 'draft not restored after leaving the app');
if ((await page.getByRole('radio', { name: 'Männlich' }).getAttribute('aria-checked')) !== 'true') fail('sex not restored');
const stored = await page.evaluate(() => new Promise((res) => {
  const r = indexedDB.open('forge');
  r.onsuccess = () => { const g = r.result.transaction('profile').objectStore('profile').get('profile'); g.onsuccess = () => res(g.result); };
}));
if (stored?.age !== 24 || stored?.heightCm !== 182) fail('valid answers not written to the database on leave: ' + JSON.stringify(stored));
log('leaving the app keeps the draft (same step) and writes valid answers to the DB');

await next();
await page.getByRole('heading', { name: 'Dein Ziel' }).waitFor();
await page.getByRole('radio', { name: /Muskelaufbau/ }).click();
await page.getByLabel('Zielgewicht').fill('84');
await shot('o3-goal');
await next();
await page.getByRole('heading', { name: 'Training' }).waitFor();
await page.getByRole('button', { name: 'Mehr' }).click();
await page.getByRole('radio', { name: /2:00/ }).click();
await shot('o4-training');
await next();
await page.getByRole('heading', { name: 'Alltag & Darstellung' }).waitFor();
await page.getByRole('radio', { name: '8.000' }).click();
await shot('o5-daily');
await next();
await page.getByRole('heading', { name: 'Alles bereit' }).waitFor();
await page.getByText('Kalorienziel pro Tag').waitFor();
const kcal = await page.locator('text=Kalorienziel pro Tag').locator('..').textContent();
if (!/\d\.\d{3}/.test(kcal)) fail('no kcal target in summary: ' + kcal);
await shot('o6-summary');
log('summary shows calculated target', kcal.replace(/\s+/g, ' ').slice(0, 60));

await page.getByRole('button', { name: 'Training starten' }).click();

if (await page.evaluate(() => document.documentElement.classList.contains('dark'))) fail('app did not start in light mode');
log('app starts in light mode');

// ---------- app tour starts right after the onboarding ----------
const tour = page.getByTestId('app-tour');
const tourTitle = () => tour.getByRole('heading').textContent();
const tourAt = async (title, path) => {
  await tour.getByRole('heading', { name: title }).waitFor();
  if (path) await page.waitForURL((u) => u.pathname === path);
};
await tourAt('Kurze Tour durch Forge', '/');
await shot('t1-intro');
await tour.getByRole('button', { name: 'Tour starten' }).click();
await tourAt('Heute', '/');
await shot('t2-today');
await tour.getByRole('button', { name: 'Weiter' }).click();
await tourAt('Training', '/workout');
await shot('t3-training');
await tour.getByRole('button', { name: 'Weiter' }).click();
await tourAt('Pläne & mehr', '/plans');
log('tour walks through the areas and shows the matching pages');

await hide();
await page.reload();
await tourAt('Pläne & mehr', '/plans');
log('leaving the app mid-tour resumes at the same station');

for (const [t, p] of [['Ernährung', '/nutrition'], ['Freunde', '/social'], ['Aktivität & Körper', '/activity'], ['Alles wird gespeichert', '/']]) {
  await tour.getByRole('button', { name: 'Weiter' }).click();
  await tourAt(t, p);
  if (t === 'Ernährung') await shot('t4-nutrition');
}
await tour.getByRole('button', { name: "Los geht's" }).click();
await tour.waitFor({ state: 'detached' });
await page.reload();
await page.getByRole('button', { name: /Workout starten/ }).waitFor();
await page.waitForTimeout(400);
if (await tour.count()) fail('tour shown again after finishing');
log('tour finished → not shown again');

await page.getByText(/Sven/).first().waitFor();
await shot('o7-dashboard');
log('dashboard greets by name');

// stored values visible in the app
await page.goto(BASE + '/nutrition/profile');
await valueIs('Größe', '182', 'height not in nutrition profile');
await valueIs('Zielgewicht', '84', 'goal weight not stored');
await page.goto(BASE + '/settings');
await page.getByText('Wochenziel').waitFor();
{
  const end = Date.now() + 4000;
  let txt = '';
  while (Date.now() < end && !/−4\+/.test(txt)) {
    txt = await page.locator('main, body').first().textContent();
    await page.waitForTimeout(100);
  }
  if (!/Wochenziel.*−4\+/.test(txt)) fail('weekly goal not 4');
}
await page.goto(BASE + '/body');
await page.getByText('80,5 kg').first().waitFor();
log('profile, weekly goal and first weight entry stored');

// any field that saves on blur: typed value is saved when the app is left without leaving the field
await page.goto(BASE + '/nutrition/profile');
await valueIs('Alter', '24', 'age missing');
await page.getByLabel('Alter').fill('31');
await hide();
await page.waitForTimeout(300);
await page.reload();
await valueIs('Alter', '31', 'value typed before leaving the app was lost');
log('a value still being typed is saved when the app is left');

// reload → no onboarding again
await page.goto(BASE);
await page.waitForTimeout(400);
if (await page.getByRole('heading', { name: 'Willkommen bei Forge' }).count()) fail('onboarding shown again');
log('onboarding not shown again');

// plan editor: unsaved plan survives leaving the app
await page.goto(BASE + '/plans/new');
await page.getByLabel('Name').fill('Push Day');
await hide();
await page.reload();
await page.getByText('Ungespeicherte Änderungen wiederhergestellt.').waitFor();
await valueIs('Name', 'Push Day', 'plan draft not restored');
await page.getByRole('button', { name: 'Verwerfen' }).click();
await valueIs('Name', '', 'discard did not reset');
log('plan editor restores an unsaved plan after leaving the app');

// restart from settings: prefilled
await page.goto(BASE + '/settings');
await page.getByRole('button', { name: 'Starten', exact: true }).click();
await page.getByRole('heading', { name: 'Willkommen bei Forge' }).waitFor();
await valueIs('Name', 'Sven', 'restart not prefilled');
await page.getByRole('button', { name: 'Überspringen' }).click();
await page.getByRole('heading', { name: 'Einstellungen' }).waitFor();
log('restart from settings is prefilled; skip returns to the app');

// tour can be restarted from settings and returns to the start page when closed
await page.goto(BASE + '/settings');
await page.getByRole('button', { name: 'Tour starten' }).click();
await tourAt('Kurze Tour durch Forge', '/');
await tour.getByRole('button', { name: 'Tour beenden' }).click();
await tour.waitFor({ state: 'detached' });
log('tour restartable from settings, closable at any time');

// finish and leave the app in the same moment → onboarding must stay completed
await page.goto(BASE + '/settings');
await page.getByRole('button', { name: 'Starten', exact: true }).click();
await page.getByRole('heading', { name: 'Willkommen bei Forge' }).waitFor();
for (const h of ['Über dich', 'Dein Ziel', 'Training', 'Alltag & Darstellung', 'Alles bereit']) {
  await next();
  await page.getByRole('heading', { name: h }).waitFor();
}
await page.getByRole('button', { name: 'Training starten' }).click();
await hide(); // leave events right after finishing must not re-create the draft
await page.getByRole('heading', { name: 'Einstellungen' }).waitFor();
await page.reload();
await page.getByRole('heading', { name: 'Einstellungen' }).waitFor();
if (await page.evaluate(() => localStorage.getItem('forge-onboarding'))) fail('draft re-created after finishing');
log('leaving the app right after finishing keeps the onboarding completed');

if (errors.length) fail('console errors:\n' + errors.join('\n'));
await browser.close();
console.log('ONBOARDING E2E PASSED');
