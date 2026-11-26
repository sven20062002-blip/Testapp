// E2E: Kettli replaces Freunde; quests from a real workout + manual steps; claim, level, shop.
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
const page = await ctx.newPage();
page.setDefaultTimeout(8000);
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const shot = (n) => SHOTS && page.screenshot({ path: `${SHOTS}/${n}.png` });
const coins = async () => Number((await page.getByTestId('coins').first().getAttribute('aria-label')).split(' ')[0]);

await page.goto(BASE);
await page.getByRole('button', { name: 'Überspringen' }).click();
await page.getByRole('button', { name: 'Tour beenden' }).click();
await page.getByTestId('app-tour').waitFor({ state: 'detached' });
const nav = page.getByRole('navigation', { name: 'Hauptnavigation' }).last();
if (await nav.getByText('Freunde').count()) fail('Freunde still in the navigation');
await nav.getByRole('link', { name: 'Kettli' }).waitFor();
await page.locator('[data-widget="pet"]').waitFor();
log('Freunde hidden, Kettli in the bottom bar and on the home screen');

await page.goto(BASE + '/social');
await page.waitForURL('**/pet');
log('old /social links lead to Kettli');

// adopt
await page.getByRole('heading', { name: 'Das ist dein Kettli' }).waitFor();
await page.getByLabel('Name').fill('Bruno');
await page.getByRole('button', { name: "Los geht's" }).click();
await page.getByRole('heading', { name: 'Bruno' }).waitFor();
if ((await coins()) !== 0) fail('starts with coins');
const wq = page.getByTestId('quest-workout');
if (await wq.getByRole('button', { name: /abholen/ }).count()) fail('workout quest claimable without workout');
await page.getByTestId('kettli').click();
await page.locator('.float-up').first().waitFor();
await shot('k1-pet');
log('adopt + name, tap Kettli → reaction, nothing claimable yet');

// do a workout from a plan
await page.goto(BASE + '/workout');
await page.getByRole('button', { name: 'Push Day starten' }).click();
const ex = page.locator('section[aria-label]').first();
await ex.getByLabel('Gewicht Satz 1 in kg').fill('50');
await ex.getByLabel('Wiederholungen Satz 1').fill('10');
await ex.getByLabel('Satz 1 abschließen').click();
await page.getByRole('button', { name: 'Beenden' }).first().click();
await page.getByRole('button', { name: 'Speichern' }).click();
await page.waitForURL('**/history/**');
log('finished a workout');

// manual steps
await page.goto(BASE + '/activity');
await page.getByRole('button', { name: 'Eintragen' }).click();
await page.locator('#me-val').fill('10500');
await page.getByRole('button', { name: 'Speichern' }).click();
await page.waitForTimeout(400);

await page.goto(BASE + '/pet');
await page.getByRole('heading', { name: 'Bruno' }).waitFor();
await wq.getByRole('button', { name: 'Ein Workout absolvieren abholen' }).click();
await page.getByText('+30 XP').first().waitFor();
await page.getByTestId('quest-steps').getByRole('button', { name: /abholen/ }).click();
await page.waitForTimeout(700);
// workout 15 + streak 1 + steps 10 = 26
const c1 = await coins();
if (c1 !== 26) fail('expected 26 Gains, got ' + c1);
if (await wq.getByRole('button', { name: /abholen/ }).count()) fail('quest claimable twice');
await wq.getByText('Abgeholt').waitFor();
await page.getByText('50 / 100 XP').waitFor();
await shot('k2-claimed');
log('workout + steps quests claimed: 26 Gains, 50 XP, no double claim');

// persists over reload
await page.reload();
await page.getByText('50 / 100 XP').waitFor();
if ((await coins()) !== 26) fail('coins not persisted');
log('progress persisted');

// shop: too expensive vs. affordable
await page.getByRole('button', { name: 'Ozean kaufen' }).click();
await page.getByText('Dir fehlen 54 Gains').waitFor();
await page.getByRole('button', { name: 'Kaufen & anlegen' }).isDisabled().then((d) => d || fail('could buy without enough Gains'));
await page.keyboard.press('Escape');
await page.getByRole('radio', { name: 'Accessoires' }).click();
await page.getByRole('button', { name: 'Stirnband kaufen' }).waitFor();
log('shop shows prices, blocks purchases without enough Gains');

if (errors.length) fail(errors.join('\n'));
await b.close();
console.log('PET E2E PASSED');
