import { updateSettings } from '@/db/repo/settings';
import { clearDraft, readDraft, writeDraft } from '@/lib/leave';
import { TOUR } from './steps';

export const TOUR_KEY = 'forge-tour';
const RETURN_KEY = 'forge-tour-return';

/** Where the tour was opened (e.g. an invite link) – the app returns there afterwards. Kept across app restarts. */
export function rememberTourOrigin(url: string): string {
  const saved = readDraft<string>(RETURN_KEY);
  if (typeof saved === 'string' && saved.startsWith('/')) return saved;
  writeDraft(RETURN_KEY, url);
  return url;
}

/** Station to resume at (the tour may have been left mid-way). */
export function loadTourStep(): number {
  const n = readDraft<number>(TOUR_KEY);
  return typeof n === 'number' && Number.isInteger(n) ? Math.min(Math.max(0, n), TOUR.length - 1) : 0;
}
export function saveTourStep(i: number): void {
  writeDraft(TOUR_KEY, i);
}

/** Finished or closed → never shown automatically again. */
export function tourOrigin(): string {
  const back = readDraft<string>(RETURN_KEY);
  return typeof back === 'string' && back.startsWith('/') ? back : '/';
}

export async function finishTour(): Promise<void> {
  await updateSettings({ tourSeenAt: Date.now() });
  clearDraft(TOUR_KEY);
  clearDraft(RETURN_KEY);
}

/** Settings → "App-Tour starten" */
export async function restartTour(): Promise<void> {
  clearDraft(TOUR_KEY);
  clearDraft(RETURN_KEY);
  await updateSettings({ tourSeenAt: null });
}
