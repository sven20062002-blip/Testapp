// End-to-end smoke test against `vite preview` (production build with service worker).
// Usage: node tests/e2e/smoke.mjs [baseUrl] [screenshotDir]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright'); }
const { chromium, devices } = pw;

const BASE = process.argv[2] ?? 'http://localhost:4173';
const SHOTS = process.argv[3] ?? null;
const errors = [];
const log = (...a) => console.log('✓', ...a);
const fail = (m) => {
  throw new Error(m);
};
const expect = async (cond, msg) => {
  if (!(await cond)) fail(msg);
};
/** poll until fn() is truthy (UI updates come through live queries) */
const until = async (fn, msg, timeout = 4000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  fail(msg);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'allow' });
const page = await ctx.newPage();
page.setDefaultTimeout(8000);
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
const shot = async (n) => SHOTS && page.screenshot({ path: `${SHOTS}/${n}.png` });

await page.goto(BASE);
await page.getByRole('heading', { level: 1 }).waitFor();
await shot('01-dashboard');
log('dashboard renders');

// --- start empty workout
await page.getByRole('button', { name: /Workout starten/ }).click();
await page.waitForURL('**/workout');
const clock = page.getByTestId('workout-clock');
await clock.waitFor();
const t1 = await clock.textContent();
await page.waitForTimeout(2100);
const t2 = await clock.textContent();
await expect(t1 !== t2 && /^\d\d:\d\d:\d\d$/.test(t2), `workout clock not ticking: ${t1} → ${t2}`);
log('workout clock ticks', t2);

// --- add exercises
await page.getByRole('button', { name: 'Übung hinzufügen' }).click();
await page.getByLabel('Übung suchen').fill('bank');
await page.getByRole('button', { name: /^BR?\w*\s*Bankdrücken/ }).first().click().catch(async () => {
  await page.locator('li button', { hasText: 'Bankdrücken' }).first().click();
});
await page.getByLabel('Übung suchen').fill('plank');
await page.locator('li button', { hasText: 'Plank' }).click();
await page.getByRole('button', { name: /2 Übungen hinzufügen/ }).click();
await page.locator('section[aria-label="Bankdrücken"]').waitFor();
log('exercises added via picker');

const bench = page.locator('section[aria-label="Bankdrücken"]');
await until(async () => (await bench.getByTestId('set-row').count()) === 3, 'expected 3 default sets');

// set timer: start next set
await page.getByRole('button', { name: 'Satz starten' }).click();
await page.waitForTimeout(1200);
await expect(page.getByRole('button', { name: 'Satz fertig' }).isVisible(), 'set timer not running');
log('set timer started');

const vals = [[60, 12], [70, 10], [75, 8]];
for (let i = 0; i < 3; i++) {
  await bench.getByLabel(`Gewicht Satz ${i + 1} in kg`).fill(String(vals[i][0]));
  await bench.getByLabel(`Wiederholungen Satz ${i + 1}`).fill(String(vals[i][1]));
}
await bench.getByLabel('Satz 1 abschließen').click();
await page.waitForTimeout(300);
// rest timer should be running
await expect(page.getByRole('button', { name: 'Pause überspringen' }).isVisible(), 'rest timer did not auto-start');
log('rest timer auto-started after set');
await page.getByRole('button', { name: '15 Sekunden mehr' }).click();
await page.getByRole('button', { name: 'Pause überspringen' }).click();
await bench.getByLabel('Satz 2 abschließen').click();
await bench.getByLabel('Satz 3 abschließen').click();
await page.waitForTimeout(200);
await until(async () => (await bench.textContent()).includes('2.020 kg'), 'volume 2.020 kg not shown');
log('sets completed, volume 2.020 kg');

// set durations recorded for set 1
const firstRow = bench.getByTestId('set-row').first();
await expect(/\d:\d\d/.test(await firstRow.textContent()), 'set duration not shown');

// add + delete a set
await bench.getByRole('button', { name: 'Satz hinzufügen' }).click();
await until(async () => (await bench.getByTestId('set-row').count()) === 4, 'set not added');
await bench.getByLabel('Satz 4 – Optionen').click();
await page.getByRole('button', { name: 'Satz löschen' }).click();
await page.waitForTimeout(200);
await until(async () => (await bench.getByTestId('set-row').count()) === 3, 'set not deleted');
log('set add/delete');

// permanent note
await bench.getByRole('button', { name: /Dauerhafte Notiz hinzufügen/ }).click();
await bench.getByLabel('Dauerhafte Notiz').fill('Griff etwas enger wählen');
await page.waitForTimeout(700);

// plank (duration)
const plank = page.locator('section[aria-label="Plank"]');
await plank.getByLabel('Haltezeit Satz 1 in Sekunden').fill('60');
await plank.getByLabel('Satz 1 abschließen').click();
log('duration exercise completed');

// --- BUG 27 regression: add an exercise via the picker while the workout clock runs ---
{
  const clockBefore = await clock.textContent();
  const restBefore = await page.locator('[role="timer"]').nth(1).textContent().catch(() => null);
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Übung hinzufügen' }).click();
  const search = page.getByLabel('Übung suchen');
  await search.click();
  await page.keyboard.type('Seit', { delay: 180 }); // real typing while timers tick
  await until(async () => (await search.inputValue()) === 'Seit', 'search input lost focus/characters while timer runs');
  await page.getByRole('button', { name: 'Schultern', exact: true }).click(); // muscle filter works too
  await page.locator('li button', { hasText: 'Seitheben' }).click();
  await page.getByRole('button', { name: /1 Übung hinzufügen/ }).click();
  await page.locator('section[aria-label="Seitheben"]').waitFor();
  const clockAfter = await clock.textContent();
  if (!(clockAfter > clockBefore)) fail(`clock did not keep running: ${clockBefore} → ${clockAfter}`);
  // previous data untouched
  for (const [i, [w, r]] of [[60, 12], [70, 10], [75, 8]].entries()) {
    if ((await bench.getByLabel(`Gewicht Satz ${i + 1} in kg`).inputValue()) !== String(w)) fail('bench weight changed');
    if ((await bench.getByLabel(`Wiederholungen Satz ${i + 1}`).inputValue()) !== String(r)) fail('bench reps changed');
    if ((await bench.getByLabel(`Satz ${i + 1} wieder öffnen`).count()) !== 1) fail('bench set no longer completed');
  }
  // rest timer was not reset by adding an exercise
  if (restBefore) {
    const restAfter = await page.locator('[role="timer"]').nth(1).textContent();
    if (restAfter === '1:30' && restBefore !== '1:30') fail('rest timer was reset');
  }
  // new exercise is immediately editable
  const lat = page.locator('section[aria-label="Seitheben"]');
  await lat.getByLabel('Gewicht Satz 1 in kg').fill('10');
  await lat.getByLabel('Wiederholungen Satz 1').fill('15');
  await lat.getByLabel('Satz 1 abschließen').click();
  await until(async () => (await lat.getByLabel('Satz 1 wieder öffnen').count()) === 1, 'new exercise set not completable');
  log('BUG 27: exercise added during running workout (clock', clockBefore, '→', clockAfter + ', data intact)');
}
await shot('02-workout');

// pause / resume and reload persistence
await page.getByRole('button', { name: 'Workout pausieren' }).click();
const p1 = await clock.textContent();
await page.waitForTimeout(1500);
await expect((await clock.textContent()) === p1, 'clock not paused');
await page.getByRole('button', { name: 'Workout fortsetzen' }).first().click();
log('pause/resume works');

await page.reload();
await clock.waitFor();
const afterReload = await clock.textContent();
await expect(afterReload >= p1, `clock reset after reload: ${afterReload}`);
await until(async () => (await page.locator('section[aria-label="Bankdrücken"]').getByLabel('Satz 1 wieder öffnen').count()) === 1, 'completed set lost after reload');
log('workout survives reload', afterReload);

// navigate away: mini bar
await page.getByRole('button', { name: 'Weitere Bereiche' }).click();
await page.getByRole('dialog').getByRole('button', { name: 'Verlauf' }).click();
await page.getByRole('link', { name: 'Zum laufenden Workout' }).waitFor();
log('active workout bar visible on other pages');
await page.getByRole('link', { name: 'Zum laufenden Workout' }).click();

// finish
await page.getByRole('button', { name: 'Beenden' }).first().click();
await page.getByRole('button', { name: 'Speichern' }).click();
await page.waitForURL('**/history/**');
await page.getByText('Workout abgeschlossen').waitFor();
await shot('03-summary');
log('workout finished → summary');

// --- second workout: repeat, heavier → PR
await page.getByRole('button', { name: 'Wiederholen' }).click();
await page.waitForURL('**/workout');
const bench2 = page.locator('section[aria-label="Bankdrücken"]');
await bench2.waitFor();
await until(async () => (await bench2.textContent()).includes('Letztes Training'), 'last workout comparison missing');
await until(async () => (await bench2.textContent()).includes('Griff etwas enger'), 'permanent note not shown in next workout');
log('last-training box + permanent note shown');
await bench2.getByLabel('Gewicht Satz 1 in kg').fill('80');
await bench2.getByLabel('Satz 1 abschließen').click(); // reps from suggestion (12)
await page.getByText('Neuer Rekord!').waitFor({ timeout: 3000 });
await shot('04-pr');
log('PR celebration shown');
await page.getByRole('alert').click(); // tap to dismiss
await page.getByText('Neuer Rekord!').waitFor({ state: 'detached' });
// empty set completes with suggestion from last time
await bench2.getByLabel('Satz 2 abschließen').click();
await page.waitForTimeout(200);
await until(async () => (await bench2.getByLabel('Gewicht Satz 2 in kg').inputValue()) === '70', 'suggestion not applied');
log('ghost values applied on completion');
await page.getByRole('button', { name: 'Beenden' }).first().click();
await page.getByRole('button', { name: 'Speichern' }).click();
await page.waitForURL('**/history/**');
await page.getByText(/neue Bestleistung/).waitFor();
log('PR stored for workout');

// --- plans
await page.goto(BASE + '/plans/new');
await page.getByLabel('Name').fill('Test Plan');
await page.getByRole('button', { name: 'Übungen hinzufügen' }).click();
await page.locator('li button', { hasText: 'Kniebeugen' }).click();
await page.locator('li button', { hasText: 'Kreuzheben' }).click();
await page.getByRole('button', { name: /2 Übungen hinzufügen/ }).click();
// reorder via keyboard drag
const handle = page.getByRole('button', { name: 'Kreuzheben verschieben' });
await handle.focus();
await page.keyboard.press('Space');
await page.waitForTimeout(250);
await page.keyboard.press('ArrowUp');
await page.waitForTimeout(350);
await page.keyboard.press('Space');
await page.waitForTimeout(300);
const firstName = await page.locator('[aria-label$=" verschieben"]').first().getAttribute('aria-label');
if (!firstName.startsWith('Kreuzheben')) fail('drag & drop reorder failed: ' + firstName);
await page.getByRole('button', { name: 'Plan speichern' }).click();
await page.waitForURL('**/plans');
await page.getByText('Test Plan').waitFor();
log('plan created, first exercise after reorder:', firstName);
await page.getByRole('button', { name: 'Optionen für Test Plan' }).click();
await page.getByRole('button', { name: 'Duplizieren' }).click();
await page.getByText('Test Plan (Kopie)').waitFor();
log('plan duplicated');
await shot('05-plans');

// stats & records render
await page.goto(BASE + '/stats');
await page.getByText('Trainingsvolumen').waitFor();
await page.waitForTimeout(400);
await shot('06-stats');
await page.goto(BASE + '/records');
await page.getByText('Höchstes Workout-Volumen').waitFor();
log('stats + records render');
if (SHOTS) {
  await shot('08-records');
  await page.goto(BASE + '/exercises/ex-bench-press');
  await page.getByText('Bestleistungen').first().waitFor();
  await page.waitForTimeout(400);
  await shot('09-exercise');
  await page.goto(BASE + '/history');
  await page.locator('a[href^="/history/"]').first().click();
  await page.getByText('Leistung').first().waitFor();
  await page.mouse.wheel(0, 500);
  await page.waitForTimeout(300);
  await shot('10-workout-detail');
  await page.goto(BASE + '/plans');
  await page.getByText('Push Day').click();
  await page.waitForTimeout(300);
  await shot('11-plan-editor');
  await page.goto(BASE + '/workout');
  await page.getByRole('button', { name: /Leeres Workout starten/ }).click();
  await page.getByRole('button', { name: 'Übung hinzufügen' }).click();
  await page.waitForTimeout(400);
  await shot('12-picker');
  await page.keyboard.press('Escape');
  await page.locator('[aria-label="Workout-Optionen"]').click();
  await page.getByRole('button', { name: 'Workout verwerfen' }).click();
  await page.getByRole('button', { name: 'Verwerfen' }).last().click();
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto(BASE + '/');
  await page.waitForTimeout(500);
  await shot('13-desktop');
  await page.goto(BASE + '/stats');
  await page.waitForTimeout(600);
  await shot('14-desktop-stats');
  await page.setViewportSize({ width: 390, height: 844 });
}

// --- offline
await page.goto(BASE);
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload();
await ctx.setOffline(true);
await page.goto(BASE + '/history');
await page.getByRole('heading', { name: 'Verlauf' }).waitFor();
await page.getByRole('button', { name: /Training|Läuft/ }).count();
await page.goto(BASE + '/workout');
await page.getByRole('button', { name: /Leeres Workout starten/ }).click().catch(async (e) => { await page.screenshot({ path: '/tmp/claude-0/-home-user/1d249765-b201-5014-a2c3-053addff0934/scratchpad/offline-fail.png' }); console.log('BODY', (await page.locator('body').innerText()).slice(0, 400)); throw e; });
await page.getByTestId('workout-clock').waitFor();
log('offline: app loads and workouts can be started');
await ctx.setOffline(false);

// light theme screenshot
if (SHOTS) {
  await page.goto(BASE + '/settings');
  await page.getByRole('radio', { name: 'Hell' }).click();
  await page.goto(BASE + '/');
  await page.waitForTimeout(300);
  await shot('07-light');
}

await browser.close();
const relevant = errors.filter((e) => !/Failed to load resource|ERR_INTERNET_DISCONNECTED/.test(e));
if (relevant.length) {
  console.error('Console errors:\n' + relevant.join('\n'));
  process.exit(1);
}
console.log('\nALL E2E CHECKS PASSED');
