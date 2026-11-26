import { db } from '../db';
import type { Settings } from '../types';

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  theme: 'light',
  unit: 'kg',
  exerciseLang: 'de',
  defaultRestSec: 90,
  autoRest: true,
  autoStartSetTimer: true,
  sound: true,
  vibration: true,
  prAlerts: true,
  confirmDeletes: true,
  keepAwake: true,
  weightStepKg: 2.5,
  userName: '',
  weeklyGoal: 3,
  onboardedAt: null,
  tourSeenAt: null,
  homeWidgets: null,
  homeWidgetSizes: null,
  updatedAt: 0,
};

export async function getSettings(): Promise<Settings> {
  const s = await db.settings.get('settings');
  return { ...DEFAULT_SETTINGS, ...(s ?? {}) };
}

export async function updateSettings(patch: Partial<Omit<Settings, 'id'>>): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const cur = await getSettings();
    await db.settings.put({ ...cur, ...patch, id: 'settings', updatedAt: Date.now() });
  });
}

/** Read-modify-write in one transaction: safe when the user taps faster than the UI re-renders. */
export async function updateSettingsWith(fn: (cur: Settings) => Partial<Omit<Settings, 'id'>>): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const cur = await getSettings();
    await db.settings.put({ ...cur, ...fn(cur), id: 'settings', updatedAt: Date.now() });
  });
}
