import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import type { PetState } from '@/db/types';
import { useHealthContext, useProfile } from '@/hooks/useHealth';
import { valueOn } from '@/health/merge';
import { dayKey, parseDay } from '@/lib/day';
import { dayTotals, useDayEntries, useTargets } from '@/components/nutrition/shared';
import { levelInfo, moodOf, questStatus, stageOf, type QuestId } from './model';
import { DEFAULT_PET } from './repo';

/** Kettli's stored state (undefined while loading). */
export function usePet(): PetState | undefined {
  const p = useLiveQuery(async () => (await db.pet.get('pet')) ?? null, []);
  return useMemo(() => (p === undefined ? undefined : (p ?? DEFAULT_PET())), [p]);
}

/** Today's quests with live progress from steps, workouts and the food diary. */
export function useTodayQuests() {
  const today = dayKey();
  const profile = useProfile();
  const ctx = useHealthContext(3);
  const entries = useDayEntries(today);
  const targets = useTargets(today);
  const start = parseDay(today).getTime();
  const workoutsToday = useLiveQuery(
    () => db.workouts.where('status').equals('completed').filter((w) => (w.endedAt ?? w.startedAt) >= start && w.totalSets > 0).count(),
    [start],
  );
  const claims = useLiveQuery(() => db.questClaims.where('date').equals(today).toArray(), [today]);
  const loaded = ctx.loaded && workoutsToday !== undefined && claims !== undefined && entries !== undefined;
  const quests = useMemo(() => {
    if (!loaded) return null;
    return questStatus({
      steps: valueOn(ctx.merged, 'steps', today)?.value ?? null,
      stepGoal: profile.stepGoal,
      workoutsToday: workoutsToday ?? 0,
      kcal: dayTotals(entries ?? []).kcal,
      kcalTarget: targets.kcal,
      claimed: (claims ?? []).map((c) => c.quest as QuestId),
    });
  }, [loaded, ctx, today, profile.stepGoal, workoutsToday, entries, targets.kcal, claims]);
  return { quests, today };
}

/** Level, stage and mood derived from the state + today's claims. */
export function usePetView(pet: PetState | undefined, claimedToday: number) {
  return useMemo(() => {
    if (!pet) return null;
    const info = levelInfo(pet.xp);
    const today = dayKey();
    const days = pet.lastActiveDay ? Math.round((parseDay(today).getTime() - parseDay(pet.lastActiveDay).getTime()) / 86_400_000) : null;
    return { ...info, stage: stageOf(info.level), mood: moodOf({ claimedToday, daysSinceActive: days, hour: new Date().getHours() }) };
  }, [pet, claimedToday]);
}
