/**
 * All timers are derived from timestamps, never from interval counters.
 * This keeps them correct when the OS suspends the page (iOS background), after reloads
 * and while navigating.
 */

export interface PausableClock {
  startedAt: number;
  endedAt?: number | null;
  pausedAt: number | null;
  pausedMs: number;
}

/** Elapsed active milliseconds of a pausable clock. */
export function clockElapsedMs(c: PausableClock, now = Date.now()): number {
  const end = c.endedAt ?? c.pausedAt ?? now;
  return Math.max(0, end - c.startedAt - c.pausedMs);
}

/** Elapsed ms of a set timer. While the workout is paused, the set timer is frozen too. */
export function setTimerElapsedMs(
  set: { timerStartedAt: number | null; timerPausedMs: number },
  workoutPausedAt: number | null,
  now = Date.now(),
): number {
  if (!set.timerStartedAt) return 0;
  const end = workoutPausedAt && workoutPausedAt > set.timerStartedAt ? workoutPausedAt : now;
  return Math.max(0, end - set.timerStartedAt - set.timerPausedMs);
}

export function restRemainingMs(
  t: { status: string; endsAt: number | null; remainingMs: number | null },
  now = Date.now(),
): number {
  if (t.status === 'running' && t.endsAt) return Math.max(0, t.endsAt - now);
  if (t.status === 'paused' && t.remainingMs != null) return Math.max(0, t.remainingMs);
  return 0;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** HH:MM:SS */
export function formatHMS(ms: number): string {
  const s = Math.floor(Math.max(0, ms) / 1000);
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** M:SS (or H:MM:SS when ≥ 1h) */
export function formatClock(ms: number, ceil = false): string {
  const total = ceil ? Math.ceil(Math.max(0, ms) / 1000) : Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Human duration like "1 Std 12 Min" / "45 Min" / "38 Sek" */
export function formatDuration(sec: number): string {
  sec = Math.max(0, Math.round(sec));
  if (sec === 0) return '0 Min';
  if (sec < 60) return `${sec} Sek`;
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h === 0) return `${m} Min`;
  return m ? `${h} Std ${m} Min` : `${h} Std`;
}

export function formatSeconds(sec: number | null | undefined): string {
  if (sec == null) return '–';
  return formatClock(sec * 1000);
}

const dateFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
const dateShort = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'short' });
const timeFmt = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
const longFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });

export const fmtDate = (t: number) => dateFmt.format(t);
export const fmtDateShort = (t: number) => dateShort.format(t);
export const fmtTime = (t: number) => timeFmt.format(t);
export const fmtLong = (t: number) => longFmt.format(t);

export function relativeDay(t: number, now = Date.now()): string {
  const d0 = startOfDay(now);
  const d1 = startOfDay(t);
  const diff = Math.round((d0 - d1) / 86400000);
  if (diff === 0) return 'Heute';
  if (diff === 1) return 'Gestern';
  if (diff < 7) return `vor ${diff} Tagen`;
  if (diff < 14) return 'vor 1 Woche';
  if (diff < 31) return `vor ${Math.floor(diff / 7)} Wochen`;
  return fmtDateShort(t);
}

export function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Monday-based week start */
export function startOfWeek(t: number): number {
  const d = new Date(startOfDay(t));
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d.getTime();
}

export function startOfMonth(t: number): number {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 5) return 'Gute Nacht';
  if (h < 11) return 'Guten Morgen';
  if (h < 17) return 'Guten Tag';
  if (h < 22) return 'Guten Abend';
  return 'Gute Nacht';
}

export function defaultWorkoutName(now = new Date()): string {
  const h = now.getHours();
  if (h < 11) return 'Morgen-Training';
  if (h < 14) return 'Mittags-Training';
  if (h < 18) return 'Nachmittags-Training';
  return 'Abend-Training';
}
