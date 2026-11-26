/**
 * Kettli – the app's companion. A small kettlebell creature that grows when you complete
 * daily quests (steps, workout, calories). Its level is shown on its belly like the weight
 * marking of a kettlebell. Pure logic only (no DB) – easy to test.
 */

/* ---------------- currency & levels ---------------- */

export const CURRENCY = 'Gains';

/** XP needed to go from `level` to `level + 1` – grows slowly so early levels come quickly. */
export const xpForNext = (level: number) => 80 + 20 * level;

export function levelInfo(totalXp: number): { level: number; into: number; needed: number; pct: number } {
  let level = 1;
  let rest = Math.max(0, Math.floor(totalXp));
  while (rest >= xpForNext(level)) {
    rest -= xpForNext(level);
    level++;
  }
  const needed = xpForNext(level);
  return { level, into: rest, needed, pct: rest / needed };
}

export type Stage = 'baby' | 'junior' | 'athlete' | 'legend';
export const STAGES: { id: Stage; from: number; label: string }[] = [
  { id: 'baby', from: 1, label: 'Baby' },
  { id: 'junior', from: 5, label: 'Junior' },
  { id: 'athlete', from: 10, label: 'Athlet' },
  { id: 'legend', from: 20, label: 'Legende' },
];
export const stageOf = (level: number): Stage => [...STAGES].reverse().find((s) => level >= s.from)!.id;
export const nextStage = (level: number) => STAGES.find((s) => s.from > level) ?? null;

/** Reward for every level reached. */
export const LEVEL_UP_COINS = 20;

/* ---------------- daily quests ---------------- */

export type QuestId = 'steps' | 'workout' | 'kcal' | 'bonus';

export interface QuestDef {
  id: QuestId;
  title: string;
  xp: number;
  coins: number;
}

export const QUESTS: QuestDef[] = [
  { id: 'steps', title: 'Schrittziel erreichen', xp: 20, coins: 10 },
  { id: 'workout', title: 'Ein Workout absolvieren', xp: 30, coins: 15 },
  { id: 'kcal', title: 'Kalorienziel einhalten', xp: 20, coins: 10 },
  { id: 'bonus', title: 'Alle drei geschafft', xp: 15, coins: 25 },
];
export const questDef = (id: QuestId) => QUESTS.find((q) => q.id === id)!;

/** Calories count as "kept" within 90–105 % of the target. */
export const KCAL_MIN = 0.9;
export const KCAL_MAX = 1.05;

export interface QuestInputs {
  steps: number | null;
  stepGoal: number;
  workoutsToday: number;
  kcal: number;
  kcalTarget: number | null;
  claimed: QuestId[];
}

export interface QuestStatus {
  id: QuestId;
  title: string;
  /** 0..1 */
  progress: number;
  done: boolean;
  claimed: boolean;
  detail: string;
  xp: number;
  coins: number;
}

const fmt = (n: number) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(n);

export function questStatus(i: QuestInputs): QuestStatus[] {
  const base = (id: QuestId) => ({ ...questDef(id), claimed: i.claimed.includes(id) });
  const steps = i.steps ?? 0;
  const s = { ...base('steps'), progress: Math.min(1, steps / Math.max(1, i.stepGoal)), done: steps >= i.stepGoal, detail: `${fmt(steps)} / ${fmt(i.stepGoal)} Schritte` };
  const w = { ...base('workout'), progress: i.workoutsToday > 0 ? 1 : 0, done: i.workoutsToday > 0, detail: i.workoutsToday > 0 ? 'Erledigt – stark!' : 'Noch kein Workout heute' };
  let k: QuestStatus;
  if (i.kcalTarget == null) k = { ...base('kcal'), progress: 0, done: false, detail: 'Ernährungsprofil ausfüllen, um ein Ziel zu bekommen' };
  else {
    const r = i.kcal / i.kcalTarget;
    const done = r >= KCAL_MIN && r <= KCAL_MAX;
    const detail = r > KCAL_MAX ? `${fmt(i.kcal)} kcal – über dem Ziel` : `${fmt(i.kcal)} / ${fmt(i.kcalTarget)} kcal${done ? '' : ` (ab ${fmt(i.kcalTarget * KCAL_MIN)})`}`;
    k = { ...base('kcal'), progress: Math.min(1, r / KCAL_MIN), done, detail };
  }
  const mains = [s, w, k];
  const claimedMains = mains.filter((q) => q.claimed).length;
  const bonus = { ...base('bonus'), progress: claimedMains / 3, done: claimedMains === 3, detail: `${claimedMains} / 3 Aufgaben abgeholt` };
  return [s, w, k, bonus];
}

/* ---------------- streak & mood ---------------- */

/** New streak after the first claim on `today` (yesterday active → +1, gap → restart at 1). */
export function nextStreak(streak: number, lastActiveDay: string | null, today: string, yesterday: string): number {
  if (lastActiveDay === today) return streak;
  if (lastActiveDay === yesterday) return streak + 1;
  return 1;
}

/** Extra Gains for the first claim of a day: one per streak day, capped. */
export const streakBonus = (streak: number) => Math.min(10, Math.max(0, streak));

export type Mood = 'ecstatic' | 'happy' | 'neutral' | 'sleepy' | 'sad';

export function moodOf(o: { claimedToday: number; daysSinceActive: number | null; hour: number }): Mood {
  if (o.claimedToday >= 3) return 'ecstatic';
  if (o.claimedToday >= 1) return 'happy';
  if (o.hour >= 22 || o.hour < 6) return 'sleepy';
  if (o.daysSinceActive == null || o.daysSinceActive <= 1) return 'neutral';
  if (o.daysSinceActive <= 3) return 'sleepy';
  return 'sad';
}

export const MOOD_LINES: Record<Mood, string[]> = {
  ecstatic: ['Alles geschafft – du bist eine Maschine! 💪', 'Heute sind wir unaufhaltsam!', 'Ich fühl mich 10 kg stärker!'],
  happy: ['Läuft bei uns! Weiter so.', 'Noch eine Aufgabe? Ich glaub an dich!', 'Das hat Spaß gemacht!'],
  neutral: ['Na, heben wir heute was?', 'Ich bin bereit, wenn du es bist!', 'Ein paar Schritte würden mir guttun …'],
  sleepy: ['Zzz … weck mich mit einem Workout.', 'Ich bin ein bisschen eingerostet …', '*gähn* Morgen wieder?'],
  sad: ['Ich vermisse unser Training …', 'Lass uns wieder anfangen – ganz locker.', 'Ein kleiner Spaziergang? Bitte?'],
};

/* ---------------- shop ---------------- */

export type ItemKind = 'skin' | 'accessory' | 'background';

export interface ShopItem {
  id: string;
  kind: ItemKind;
  name: string;
  price: number;
  /** minimum Kettli level to buy */
  minLevel?: number;
  /** skin colours: light, dark, belly */
  colors?: [string, string, string];
}

export const ITEMS: ShopItem[] = [
  // skins
  { id: 'skin-classic', kind: 'skin', name: 'Klassik', price: 0, colors: ['#D8FF4A', '#8FD11A', '#F4FFD0'] },
  { id: 'skin-ocean', kind: 'skin', name: 'Ozean', price: 80, colors: ['#6FD6FF', '#2C86E0', '#E2F6FF'] },
  { id: 'skin-lava', kind: 'skin', name: 'Lava', price: 120, colors: ['#FFA04D', '#E5432B', '#FFE8D2'] },
  { id: 'skin-bubblegum', kind: 'skin', name: 'Kaugummi', price: 120, colors: ['#FF9ED0', '#E6559F', '#FFE6F3'] },
  { id: 'skin-ghost', kind: 'skin', name: 'Nebel', price: 150, colors: ['#F2F5FA', '#B5C1D1', '#FFFFFF'] },
  { id: 'skin-night', kind: 'skin', name: 'Mitternacht', price: 180, colors: ['#8D8FF0', '#3B3C9A', '#E3E4FF'] },
  { id: 'skin-gold', kind: 'skin', name: 'Gold', price: 400, minLevel: 10, colors: ['#FFE16A', '#D99A12', '#FFF6D0'] },
  // accessories
  { id: 'acc-none', kind: 'accessory', name: 'Ohne', price: 0 },
  { id: 'acc-headband', kind: 'accessory', name: 'Stirnband', price: 60 },
  { id: 'acc-cap', kind: 'accessory', name: 'Cap', price: 100 },
  { id: 'acc-shades', kind: 'accessory', name: 'Sonnenbrille', price: 120 },
  { id: 'acc-headphones', kind: 'accessory', name: 'Kopfhörer', price: 150 },
  { id: 'acc-medal', kind: 'accessory', name: 'Medaille', price: 200, minLevel: 5 },
  { id: 'acc-crown', kind: 'accessory', name: 'Krone', price: 500, minLevel: 15 },
  // backgrounds
  { id: 'bg-none', kind: 'background', name: 'Schlicht', price: 0 },
  { id: 'bg-gym', kind: 'background', name: 'Gym', price: 100 },
  { id: 'bg-beach', kind: 'background', name: 'Strand', price: 150 },
  { id: 'bg-sunset', kind: 'background', name: 'Sonnenuntergang', price: 150 },
  { id: 'bg-space', kind: 'background', name: 'Weltall', price: 200, minLevel: 5 },
];

export const itemById = (id: string) => ITEMS.find((i) => i.id === id);
export const FREE_ITEMS = ITEMS.filter((i) => i.price === 0).map((i) => i.id);
export const DEFAULT_EQUIPPED = { skin: 'skin-classic', accessory: 'acc-none', background: 'bg-none' } as const;

export type BuyCheck = { ok: true } | { ok: false; reason: string };

export function canBuy(item: ShopItem, coins: number, level: number, owned: string[]): BuyCheck {
  if (owned.includes(item.id)) return { ok: false, reason: 'Schon gekauft' };
  if (item.minLevel && level < item.minLevel) return { ok: false, reason: `Ab Level ${item.minLevel}` };
  if (coins < item.price) return { ok: false, reason: `Dir fehlen ${item.price - coins} ${CURRENCY}` };
  return { ok: true };
}

export const DEFAULT_PET_NAME = 'Kettli';
