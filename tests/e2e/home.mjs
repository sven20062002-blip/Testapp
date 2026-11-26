// E2E: customisable home screen + plans on the training page.
// Usage: node tests/e2e/home.mjs [baseUrl] [screenshotDir]
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
const order = () => page.locator('[data-widget]').evaluateAll((els) => els.map((e) => e.getAttribute('data-widget')));
/** wait until no animation is running any more (tiles glide to their new place) */
const settled = () => page.waitForFunction(() => document.getAnimations().filter((a) => a.playState === 'running' && !/^(drift|kettli)/.test(a.animationName || '')).length === 0, null, { timeout: 5000 });
const until = async (fn, msg, timeout = 4000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await fn()) return; await page.waitForTimeout(100); }
  fail(msg);
};

await page.goto(BASE);
await page.getByRole('button', { name: 'Überspringen' }).click();
await page.getByRole('button', { name: 'Tour beenden' }).click();
await page.getByTestId('app-tour').waitFor({ state: 'detached' });
await page.locator('[data-widget="start"]').waitFor();
const initial = await order();
if (initial.join() !== 'pet,start,shortcuts,training,nutrition,activity,body,progress,records') fail('unexpected default layout: ' + initial);
if (await page.getByText('Trainingspläne').count()) fail('plans still on the home screen');
log('default home screen without training plans', initial.join(' · '));

// training page lists the plans
await page.getByRole('link', { name: 'Training' }).first().click();
await page.getByRole('heading', { name: 'Trainingspläne' }).waitFor();
await page.getByRole('button', { name: 'Push Day starten' }).waitFor();
await page.getByRole('link', { name: /Neuer Plan/ }).waitFor();
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
if (overflow > 1) fail(`training page overflows horizontally by ${overflow}px`);
await shot('h0-training');
log('training page shows the plans (start, new plan, manage)');

// edit mode
await page.goto(BASE);
await page.getByRole('button', { name: 'Startseite anpassen' }).click();
await page.getByRole('heading', { name: 'Startseite anpassen' }).waitFor();
await shot('h1-edit');
await page.getByRole('button', { name: 'Trainingsfortschritt entfernen' }).click();
await page.getByRole('button', { name: 'Ernährung nach oben' }).click();
await page.getByRole('button', { name: 'Ernährung nach oben' }).click();
await page.getByRole('button', { name: 'Widget hinzufügen' }).click();
for (const t of ['Trainingsfortschritt', 'Letztes Workout']) await page.getByRole('button', { name: `${t} hinzufügen` }).waitFor();
await page.getByRole('button', { name: 'Letztes Workout hinzufügen' }).click();
log('remove, move up, add via sheet');

// drag & drop: records (last before lastWorkout) onto the start widget
const handle = page.getByRole('button', { name: 'Bestleistungen verschieben' });
const target = page.getByTestId('edit-pet');
await handle.scrollIntoViewIfNeeded();
const hb = await handle.boundingBox();
await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
await page.mouse.down();
await page.mouse.move(hb.x + 20, hb.y - 40, { steps: 5 });
await target.scrollIntoViewIfNeeded().catch(() => {});
const tb = await target.boundingBox();
await page.mouse.move(tb.x + tb.width / 2, tb.y + 30, { steps: 15 });
await page.mouse.up();
await page.waitForTimeout(400);
await page.getByRole('button', { name: 'Fertig' }).click();
await page.locator('[data-widget="start"]').waitFor();
const edited = await order();
const expectEnd = ['training', 'activity', 'body', 'lastWorkout'];
if (edited[0] !== 'records') fail('drag & drop did not move records to the top: ' + edited);
if (edited.indexOf('nutrition') > edited.indexOf('training')) fail('nutrition not moved up: ' + edited);
if (edited.includes('progress')) fail('progress not removed: ' + edited);
if (!edited.includes('lastWorkout')) fail('lastWorkout not added: ' + edited);
await shot('h2-custom');
log('drag & drop works', edited.join(' · '));

// persisted
await page.reload();
await page.locator('[data-widget="records"]').waitFor();
if ((await order()).join() !== edited.join()) fail('layout not persisted after reload');
log('layout is saved and survives a reload');

// make tiles smaller / bigger
const sizeOf = (id) => page.locator(`[data-widget="${id}"]`).getAttribute('data-size');
await page.getByRole('button', { name: 'Startseite anpassen' }).click();
await page.getByRole('button', { name: 'Workout starten verkleinern' }).click();
await page.getByRole('button', { name: 'Training verkleinern' }).click();
await page.getByRole('button', { name: 'Aktivität vergrößern' }).click();
await page.waitForTimeout(500);
await shot('h3-sizes-edit');
await page.getByRole('button', { name: 'Fertig' }).click();
await page.locator('[data-widget="start"]').waitFor();
if ((await sizeOf('start')) !== 'half' || (await sizeOf('training')) !== 'half' || (await sizeOf('activity')) !== 'full') fail('sizes not applied');
// the small start tile still starts nothing by accident and shows its label
await page.locator('[data-widget="start"]').getByText('Workout starten').waitFor();
await settled();
const [a, b] = await Promise.all([page.locator('[data-widget="start"]').boundingBox(), page.locator('[data-widget="training"]').boundingBox()]);
if (a.width > 220 || b.width > 220) fail('small tiles are not half width: ' + JSON.stringify({ a, b }));
await page.waitForTimeout(900);
await shot('h4-sizes');
await page.reload();
await page.locator('[data-widget="start"]').waitFor();
if ((await sizeOf('start')) !== 'half' || (await sizeOf('activity')) !== 'full') fail('sizes not persisted: ' + JSON.stringify([await sizeOf('start'), await sizeOf('training'), await sizeOf('activity')]) + await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('forge'); r.onsuccess = () => { const g = r.result.transaction('settings').objectStore('settings').get('settings'); g.onsuccess = () => res(JSON.stringify(g.result.homeWidgetSizes)); }; })));
log('tiles can be made smaller/bigger and the sizes are saved');

// reset to default
await page.getByRole('button', { name: 'Startseite anpassen' }).click();
await page.getByRole('button', { name: 'Standard wiederherstellen' }).click();
await page.getByRole('button', { name: 'Fertig' }).click();
await until(async () => (await order()).join() === initial.join(), 'reset to default failed');
if ((await sizeOf('start')) !== 'full') fail('reset did not restore sizes');
log('restore default layout');

// remove everything → empty state
await page.getByRole('button', { name: 'Startseite anpassen' }).click();
for (const id of initial) await page.getByTestId(`edit-${id}`).getByRole('button', { name: /entfernen$/ }).click();
await page.getByRole('button', { name: 'Fertig' }).click();
await page.getByText('Deine Startseite ist leer.').waitFor();
log('empty home screen shows a hint to add widgets');

if (errors.length) fail('console errors:\n' + errors.join('\n'));
await browser.close();
console.log('HOME E2E PASSED');
