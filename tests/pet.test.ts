import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/db';
import { initDatabase } from '@/db/init';
import { ITEMS, canBuy, levelInfo, moodOf, nextStreak, questStatus, stageOf, streakBonus, xpForNext } from '@/pet/model';
import { buyItem, claimQuest, equipItem, getPet, renamePet } from '@/pet/repo';

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-26T12:00:00'));
  await db.delete();
  await db.open();
  await initDatabase();
});

describe('Kettli model', () => {
  it('levels: 100 XP to level 2, then +20 per level; stages by level', () => {
    expect(xpForNext(1)).toBe(100);
    expect(levelInfo(0)).toMatchObject({ level: 1, into: 0, needed: 100 });
    expect(levelInfo(99).level).toBe(1);
    expect(levelInfo(100)).toMatchObject({ level: 2, into: 0, needed: 120 });
    expect(levelInfo(100 + 120 + 140).level).toBe(4);
    expect([1, 4, 5, 9, 10, 19, 20, 40].map(stageOf)).toEqual(['baby', 'baby', 'junior', 'junior', 'athlete', 'athlete', 'legend', 'legend']);
  });

  it('quest progress from steps, workouts and calories', () => {
    const q = questStatus({ steps: 10_500, stepGoal: 10_000, workoutsToday: 0, kcal: 1800, kcalTarget: 2000, claimed: [] });
    expect(q.map((x) => [x.id, x.done])).toEqual([
      ['steps', true],
      ['workout', false],
      ['kcal', true], // 90 % of 2000
      ['bonus', false],
    ]);
    const over = questStatus({ steps: null, stepGoal: 8000, workoutsToday: 1, kcal: 2200, kcalTarget: 2000, claimed: ['steps', 'workout', 'kcal'] });
    expect(over[2].done).toBe(false); // 110 % → not kept
    expect(over[2].detail).toMatch(/über dem Ziel/);
    expect(over[3].done).toBe(true); // bonus needs the three claims, not the current state
    expect(questStatus({ steps: 0, stepGoal: 1, workoutsToday: 0, kcal: 0, kcalTarget: null, claimed: [] })[2].detail).toMatch(/Ernährungsprofil/);
  });

  it('streak and mood', () => {
    expect(nextStreak(3, '2026-11-25', '2026-11-26', '2026-11-25')).toBe(4);
    expect(nextStreak(3, '2026-11-26', '2026-11-26', '2026-11-25')).toBe(3);
    expect(nextStreak(9, '2026-11-20', '2026-11-26', '2026-11-25')).toBe(1);
    expect(streakBonus(25)).toBe(10);
    expect(moodOf({ claimedToday: 3, daysSinceActive: 0, hour: 12 })).toBe('ecstatic');
    expect(moodOf({ claimedToday: 0, daysSinceActive: 5, hour: 12 })).toBe('sad');
    expect(moodOf({ claimedToday: 0, daysSinceActive: 0, hour: 23 })).toBe('sleepy');
  });

  it('shop rules', () => {
    const gold = ITEMS.find((i) => i.id === 'skin-gold')!;
    expect(canBuy(gold, 1000, 3, [])).toEqual({ ok: false, reason: 'Ab Level 10' });
    expect(canBuy(gold, 10, 12, [])).toEqual({ ok: false, reason: 'Dir fehlen 390 Gains' });
    expect(canBuy(gold, 400, 12, [])).toEqual({ ok: true });
    expect(canBuy(gold, 400, 12, ['skin-gold']).ok).toBe(false);
  });
});

describe('Kettli repo', () => {
  it('claim pays once per quest and day (double tap safe), streak bonus, bonus needs all three', async () => {
    const [a, b] = await Promise.all([claimQuest('workout'), claimQuest('workout')]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    let pet = await getPet();
    expect(pet).toMatchObject({ xp: 30, coins: 15 + 1, streak: 1, lastActiveDay: '2026-11-26' }); // +1 streak bonus on first claim
    expect(await claimQuest('bonus')).toBeNull(); // only 1 of 3 claimed
    await claimQuest('steps');
    await claimQuest('kcal');
    expect(await claimQuest('bonus')).not.toBeNull();
    pet = await getPet();
    expect(pet.xp).toBe(30 + 20 + 20 + 15);
  });

  it('streak grows over consecutive days and levels pay Gains', async () => {
    await claimQuest('workout', '2026-11-24');
    await claimQuest('workout', '2026-11-25');
    const r = await claimQuest('workout', '2026-11-26');
    expect(r!.streak).toBe(3);
    expect(r!.levelBefore).toBe(1); // 90 XP
    const r2 = await claimQuest('steps', '2026-11-26');
    expect(r2).toMatchObject({ levelBefore: 1, levelAfter: 2 });
    expect(r2!.coins).toBe(10 + 20); // quest + level-up reward, no second streak bonus that day
  });

  it('buy, equip, rename', async () => {
    await expect(buyItem('skin-ocean')).rejects.toThrow(/fehlen/);
    await db.pet.put({ ...(await getPet()), coins: 100 });
    await buyItem('skin-ocean');
    let pet = await getPet();
    expect(pet.coins).toBe(20);
    expect(pet.equipped.skin).toBe('skin-ocean');
    await equipItem('skin-classic'); // free items are always owned
    expect((await getPet()).equipped.skin).toBe('skin-classic');
    await expect(equipItem('skin-lava')).rejects.toThrow(/Noch nicht gekauft/);
    await renamePet('  Bruno  ');
    pet = await getPet();
    expect(pet.name).toBe('Bruno');
  });
});

describe('migration v7', () => {
  it('adds the Kettli widget on top of a customised home screen, keeps the rest', async () => {
    const { ForgeDB } = await import('@/db/db');
    const name = 'forge-mig-pet';
    await new Promise<void>((res, rej) => {
      const r = indexedDB.open(name, 60);
      r.onupgradeneeded = () => r.result.createObjectStore('settings', { keyPath: 'id' }).put({ id: 'settings', homeWidgets: ['records', 'start'] });
      r.onsuccess = () => (r.result.close(), res());
      r.onerror = () => rej(r.error);
    });
    const d = new ForgeDB(name);
    await d.open();
    expect((await d.settings.get('settings'))?.homeWidgets).toEqual(['pet', 'records', 'start']);
    d.close();
  });
});
