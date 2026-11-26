// E2E for the online features against a mocked Supabase (REST/RPC/auth intercepted by Playwright).
// Verifies UI flows and the exact requests the app sends. Usage: node tests/e2e/social.mjs [baseUrl] [shotDir]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright'); }
const { chromium, devices } = pw;

const BASE = process.argv[2] ?? 'http://localhost:4173';
const SHOTS = process.argv[3] ?? null;
const SB = 'https://demo-forge.supabase.co';
const log = (...a) => console.log('✓', ...a);
const fail = (m) => { throw new Error(m); };
const until = async (fn, msg, timeout = 8000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await fn()) return; await new Promise((r) => setTimeout(r, 120)); }
  fail(msg);
};
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const ANON = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ role: 'anon', iss: 'supabase' })}.c2ln`;
const now = Math.floor(Date.now() / 1000);
const ACCESS = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'me-1', role: 'authenticated', exp: now + 3600, aud: 'authenticated' })}.c2ln`;
const USER = { id: 'me-1', aud: 'authenticated', role: 'authenticated', email: 'ich@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };

// ---------- mock state ----------
let profile = null;
const calls = [];
const inOneHour = new Date(Date.now() + 25 * 60000).toISOString();
const friend = { user_id: 'fr-1', username: 'lena', display_name: 'Lena', color: '#3DD6F5' };
const rpcs = {
  list_friends: () => [{ friendship_id: 'f1', ...friend, status: 'accepted', direction: 'friend', created_at: new Date().toISOString() }],
  feed: () => [{
    workout_id: 'w-lena', user_id: 'fr-1', username: 'lena', display_name: 'Lena', color: '#3DD6F5', name: 'Push Day',
    started_at: new Date(Date.now() - 7200e3).toISOString(), ended_at: new Date(Date.now() - 3600e3).toISOString(), duration_sec: 3600,
    total_volume: 8450, total_sets: 18, pr_count: 2, top_exercises: [{ name: 'Bankdrücken', top_weight: 70, top_weight_reps: 6, volume: 2400 }],
    reactions: { '💪': 1 }, my_reaction: null, is_me: false,
  }],
  my_duels: () => [{
    id: 'duel-1', challenger: 'fr-1', opponent: 'me-1', opponent_username: 'lena', opponent_display_name: 'Lena', opponent_color: '#3DD6F5',
    exercise_key: 'ex-bench-press', exercise_name: 'Bankdrücken', metric: 'volume', duration_min: 30, status: 'active',
    started_at: new Date().toISOString(), ends_at: inOneHour, created_at: new Date().toISOString(), i_am_challenger: false, my_score: 0, opponent_score: 1200,
  }],
  duel_scores: () => [
    { user_id: 'me-1', username: 'ich', display_name: 'Ich', color: '#FF5C9A', score: duelSetsVolume(), sets: duelSets.length, last_set_at: null, is_me: true },
    { user_id: 'fr-1', username: 'lena', display_name: 'Lena', color: '#3DD6F5', score: 1200, sets: 3, last_set_at: null, is_me: false },
  ],
  my_challenges: () => [],
  volume_leaderboard: () => [
    { user_id: 'fr-1', username: 'lena', display_name: 'Lena', color: '#3DD6F5', volume: 8450, workouts: 1, sets: 18, is_me: false },
    { user_id: 'me-1', username: 'ich', display_name: 'Ich', color: '#FF5C9A', volume: 0, workouts: 0, sets: 0, is_me: true },
  ],
  send_friend_request: () => 'f2',
  create_challenge: () => 'ch-1',
};
const duelSets = [];
const duelSetsVolume = () => duelSets.reduce((a, s) => a + s.weight * s.reps, 0);

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
page.setDefaultTimeout(10000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !/realtime|websocket|WebSocket|Failed to load resource/i.test(m.text()) && errors.push(m.text()));
const shot = (n) => SHOTS && page.screenshot({ path: `${SHOTS}/${n}.png` });

await ctx.route(`${SB}/**`, async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  const body = req.postData() ? (() => { try { return JSON.parse(req.postData()); } catch { return req.postData(); } })() : null;
  const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(data) });
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  const p = url.pathname;
  calls.push({ method: req.method(), path: p, search: url.search, body, auth: req.headers()['authorization'] });
  if (p === '/auth/v1/token') return json({ access_token: ACCESS, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: 'refresh', user: USER });
  if (p === '/auth/v1/user') return json(USER);
  if (p === '/auth/v1/logout') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
  if (p === '/rest/v1/profiles') {
    if (req.method() === 'GET') return json(profile ? [profile] : []);
    profile = { ...(Array.isArray(body) ? body[0] : body), created_at: new Date().toISOString() };
    return json([], 201);
  }
  if (p.startsWith('/rest/v1/rpc/')) {
    const fn = p.slice('/rest/v1/rpc/'.length);
    if (!rpcs[fn]) return json({ message: `unknown rpc ${fn}`, code: 'PGRST202' }, 404);
    return json(rpcs[fn](body));
  }
  if (p === '/rest/v1/duel_sets' && req.method() === 'POST') { duelSets.push(Array.isArray(body) ? body[0] : body); return json([], 201); }
  if (p.startsWith('/rest/v1/')) return json([], req.method() === 'POST' ? 201 : 200);
  return json({}, 404);
});

// 1) connect server
await page.goto(BASE + '/social');
await page.getByRole('button', { name: 'Überspringen' }).click(); await page.getByRole('button', { name: 'Tour beenden' }).click(); // onboarding has its own test
await page.getByText('Online-Server verbinden').waitFor();
await shot('s1-setup');
await page.getByLabel('Project URL').fill(SB);
await page.getByLabel(/Öffentlicher Schlüssel/).fill(ANON);
await page.getByRole('button', { name: 'Verbinden' }).click();
await page.getByRole('heading', { name: 'Anmelden' }).waitFor();
log('server configured via UI');

// 2) sign in
await page.getByLabel('E-Mail').fill('ich@example.com');
await page.getByLabel('Passwort').fill('geheim123');
await page.locator('form').getByRole('button', { name: 'Anmelden' }).click();
await page.getByText('Dein Profil').waitFor();
log('signed in → profile onboarding');

// 3) profile
await page.getByLabel(/Benutzername/).fill('Ich_Bin!');
if ((await page.getByLabel(/Benutzername/).inputValue()) !== 'ich_bin') fail('username sanitising failed');
await page.getByLabel('Anzeigename').fill('Ich');
await shot('s2-profile');
await page.getByRole('button', { name: 'Loslegen' }).click();
await page.getByText('Push Day').waitFor();
const up = calls.find((c) => c.path === '/rest/v1/profiles' && c.method === 'POST');
if (!up || up.body.username !== 'ich_bin' || up.auth !== `Bearer ${ACCESS}`) fail('profile upsert wrong: ' + JSON.stringify(up));
log('profile saved with user token, feed visible');
await shot('s3-feed');

// 4) reaction
await page.getByRole('button', { name: /Reaktion 🔥/ }).click();
await until(() => calls.some((c) => c.path === '/rest/v1/reactions' && c.method === 'POST' && c.body.emoji === '🔥' && c.body.workout_id === 'w-lena'), 'reaction not sent');
log('reaction sent');

// 5) friends
await page.getByRole('radio', { name: 'Freunde' }).click();
await page.getByLabel('Benutzername eines Freundes').fill('@Max');
await page.getByRole('button', { name: 'Hinzufügen' }).click();
await until(() => calls.some((c) => c.path === '/rest/v1/rpc/send_friend_request' && c.body.target_username === 'max'), 'friend request not sent');
log('friend request rpc with normalised username');
await shot('s4-friends');

// 6) ranking
await page.getByRole('radio', { name: 'Rangliste' }).click();
await page.getByText('8.450 kg').waitFor();
log('volume leaderboard rendered');
await shot('s5-ranks');

// 7) challenge creation
await page.getByRole('radio', { name: 'Challenges' }).click();
await page.getByRole('button', { name: 'Challenge erstellen' }).click();
await page.getByRole('button', { name: /Lena/ }).click();
await page.getByRole('button', { name: 'Challenge starten' }).click();
await until(() => calls.some((c) => c.path === '/rest/v1/rpc/create_challenge' && c.body.p_metric === 'volume' && c.body.p_invitees[0] === 'fr-1'), 'challenge rpc missing');
const ch = calls.find((c) => c.path === '/rest/v1/rpc/create_challenge').body;
if (Date.parse(ch.p_ends_at) - Date.parse(ch.p_starts_at) !== 7 * 86400000) fail('challenge period wrong');
log('challenge created (7 days, friend invited)');

// 8) live duel: open, then train – sets must be posted
await page.getByRole('radio', { name: 'Duelle' }).click();
await page.getByText('vs. Lena').click();
await page.getByText(/LIVE/).waitFor();
await shot('s6-duel');
await page.getByRole('button', { name: /Workout starten & mitmachen/ }).click();
await page.getByTestId('workout-clock').waitFor();
await page.getByText(/Duell vs\. Lena/).waitFor();
log('duel banner shown in active workout');
await page.getByRole('button', { name: 'Übung hinzufügen' }).click();
await page.getByLabel('Übung suchen').fill('Bankdrücken');
await page.locator('li button', { hasText: 'Bankdrücken' }).first().click();
await page.getByRole('button', { name: /1 Übung hinzufügen/ }).click();
const bench = page.locator('section[aria-label="Bankdrücken"]');
await bench.getByLabel('Gewicht Satz 1 in kg').fill('80');
await bench.getByLabel('Wiederholungen Satz 1').fill('5');
await bench.getByLabel('Satz 1 abschließen').click();
await until(() => duelSets.some((s) => s.duel_id === 'duel-1' && s.weight === 80 && s.reps === 5 && s.exercise_key === 'ex-bench-press'), 'duel set not posted');
await page.getByText('Du 400 kg').waitFor();
log('completed set posted to the duel, live score updated (400 kg)');
await shot('s7-workout-duel');

// 9) finish → summary upload
await page.getByRole('button', { name: 'Beenden' }).first().click();
await page.getByRole('dialog').getByRole('button', { name: 'Speichern' }).click();
await page.waitForURL('**/history/**');
await until(() => calls.some((c) => c.path === '/rest/v1/workout_summaries' && c.method === 'POST'), 'workout summary not uploaded');
await until(() => calls.some((c) => c.path === '/rest/v1/exercise_summaries' && c.method === 'POST'), 'exercise summary not uploaded');
const ws = calls.find((c) => c.path === '/rest/v1/workout_summaries' && c.method === 'POST').body;
const es = calls.find((c) => c.path === '/rest/v1/exercise_summaries' && c.method === 'POST').body;
if ((Array.isArray(ws) ? ws[0] : ws).total_volume !== 400 || es[0].best_e1rm !== 93.3 || 'note' in (Array.isArray(ws) ? ws[0] : ws)) fail('summary payload wrong ' + JSON.stringify({ ws, es }));
log('finished workout uploaded as summary (no notes, e1RM 93,3)');

// 10) invite link on a fresh device: server config comes from the link
const ctx2 = await browser.newContext({ ...devices['iPhone 13'] });
await ctx2.route(`${SB}/**`, (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '[]' }));
const p2 = await ctx2.newPage();
await p2.goto(`${BASE}/social?sb=${encodeURIComponent(SB)}&key=${ANON}&from=ich_bin`);
await p2.getByRole('button', { name: 'Überspringen' }).click(); await p2.getByRole('button', { name: 'Tour beenden' }).click(); // invite link survives the onboarding
await p2.getByRole('heading', { name: 'Anmelden' }).waitFor();
await p2.getByText(/@ich_bin.*hat dich eingeladen/).waitFor();
if (p2.url().includes('key=')) fail('invite params not removed from URL');
await ctx2.close();
log('invite link configures the server and shows who invited');

await browser.close();
if (errors.length) { console.error('Console errors:\n' + errors.join('\n')); process.exit(1); }
console.log('\nSOCIAL E2E PASSED');
