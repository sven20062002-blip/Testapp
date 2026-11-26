import { db } from './db';
import { buildSeedExercises } from './seed';
import { DEFAULT_SETTINGS } from './repo/settings';
import { STARTER_PLANS, newPlanExercise } from './repo/plans';
import { uid } from '@/lib/id';

/**
 * First-start initialisation. Idempotent: seeds the 20 starter exercises (by stable id)
 * and three starter plans only once.
 */
export async function initDatabase(): Promise<void> {
  await db.transaction('rw', db.exercises, db.settings, db.plans, async () => {
    const settings = await db.settings.get('settings');
    if (settings) return;
    const seed = buildSeedExercises();
    const existing = new Set((await db.exercises.toCollection().primaryKeys()) as string[]);
    await db.exercises.bulkAdd(seed.filter((e) => !existing.has(e.id)));
    const now = Date.now();
    for (const p of STARTER_PLANS) {
      await db.plans.add({
        id: uid(),
        name: p.name,
        description: p.description,
        color: p.color,
        exercises: p.ex.map(([exerciseId, sets, reps]) => ({ ...newPlanExercise(exerciseId, sets), targetReps: reps })),
        lastUsedAt: null,
        createdAt: now,
        updatedAt: now,
      });
    }
    await db.settings.put({ ...DEFAULT_SETTINGS, updatedAt: now });
  });
}

/** Re-adds any missing / deleted standard exercises */
export async function restoreStandardExercises(): Promise<number> {
  const seed = buildSeedExercises();
  let n = 0;
  await db.transaction('rw', db.exercises, async () => {
    for (const e of seed) {
      const cur = await db.exercises.get(e.id);
      if (!cur) {
        await db.exercises.add(e);
        n++;
      } else if (cur.deletedAt) {
        await db.exercises.update(e.id, { deletedAt: null });
        n++;
      }
    }
  });
  return n;
}

/** Ask the browser to not evict our IndexedDB data under storage pressure. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch {
    /* ignore */
  }
  return false;
}
