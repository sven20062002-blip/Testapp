import { db } from '@/db/db';
import type { PetState, QuestClaim } from '@/db/types';
import { addDays, dayKey } from '@/lib/day';
import { DEFAULT_EQUIPPED, DEFAULT_PET_NAME, FREE_ITEMS, LEVEL_UP_COINS, canBuy, itemById, levelInfo, nextStreak, questDef, streakBonus, type QuestId } from './model';

export const DEFAULT_PET = (): PetState => ({
  id: 'pet',
  name: DEFAULT_PET_NAME,
  xp: 0,
  coins: 0,
  owned: [...FREE_ITEMS],
  equipped: { ...DEFAULT_EQUIPPED },
  streak: 0,
  lastActiveDay: null,
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

export async function getPet(): Promise<PetState> {
  return (await db.pet.get('pet')) ?? DEFAULT_PET();
}

export interface ClaimResult {
  xp: number;
  coins: number;
  /** extra Gains for the streak (first claim of a day) */
  streakCoins: number;
  levelBefore: number;
  levelAfter: number;
  streak: number;
}

/**
 * Claims a quest reward for `date` (default today). The caller checks that the quest is done –
 * here we guarantee "once per quest and day" atomically, so double taps never pay twice.
 */
export async function claimQuest(quest: QuestId, date = dayKey()): Promise<ClaimResult | null> {
  return db.transaction('rw', db.pet, db.questClaims, async () => {
    const id = `${date}:${quest}`;
    if (await db.questClaims.get(id)) return null;
    if (quest === 'bonus') {
      const mains = await db.questClaims.where('date').equals(date).filter((c) => c.quest !== 'bonus').count();
      if (mains < 3) return null;
    }
    const pet = await getPet();
    const def = questDef(quest);
    const firstToday = pet.lastActiveDay !== date;
    const streak = nextStreak(pet.streak, pet.lastActiveDay, date, addDays(date, -1));
    const streakCoins = firstToday ? streakBonus(streak) : 0;
    const levelBefore = levelInfo(pet.xp).level;
    const xp = pet.xp + def.xp;
    const levelAfter = levelInfo(xp).level;
    const coins = def.coins + streakCoins + (levelAfter - levelBefore) * LEVEL_UP_COINS;
    const claim: QuestClaim = { id, date, quest, xp: def.xp, coins, claimedAt: Date.now() };
    await db.questClaims.put(claim);
    await db.pet.put({ ...pet, xp, coins: pet.coins + coins, streak, lastActiveDay: date, updatedAt: Date.now() });
    return { xp: def.xp, coins, streakCoins, levelBefore, levelAfter, streak };
  });
}

export async function buyItem(itemId: string): Promise<void> {
  await db.transaction('rw', db.pet, async () => {
    const pet = await getPet();
    const item = itemById(itemId);
    if (!item) throw new Error('Unbekannter Artikel');
    const check = canBuy(item, pet.coins, levelInfo(pet.xp).level, pet.owned);
    if (!check.ok) throw new Error(check.reason);
    const equipped = { ...pet.equipped, [item.kind]: item.id };
    await db.pet.put({ ...pet, coins: pet.coins - item.price, owned: [...pet.owned, item.id], equipped, updatedAt: Date.now() });
  });
}

export async function equipItem(itemId: string): Promise<void> {
  await db.transaction('rw', db.pet, async () => {
    const pet = await getPet();
    const item = itemById(itemId);
    if (!item || !(pet.owned.includes(itemId) || item.price === 0)) throw new Error('Noch nicht gekauft');
    await db.pet.put({ ...pet, equipped: { ...pet.equipped, [item.kind]: item.id }, updatedAt: Date.now() });
  });
}
