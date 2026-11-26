/** Local calendar-day helpers (YYYY-MM-DD), independent of UTC offsets. */

const pad = (n: number) => String(n).padStart(2, '0');

export function dayKey(t: number | Date = Date.now()): string {
  const d = t instanceof Date ? t : new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDay(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: string, n: number): string {
  const d = parseDay(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

/** inclusive list of day keys from `from` to `to` */
export function dayRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let k = from; k <= to; k = addDays(k, 1)) out.push(k);
  return out;
}

export function lastNDays(n: number, end = dayKey()): string[] {
  return dayRange(addDays(end, -(n - 1)), end);
}

const fmtShort = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' });
const fmtWeekday = new Intl.DateTimeFormat('de-DE', { weekday: 'short' });
const fmtLong = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export const dayLabel = (key: string) => fmtShort.format(parseDay(key));
export const dayWeekday = (key: string) => fmtWeekday.format(parseDay(key));
export const dayLong = (key: string) => fmtLong.format(parseDay(key));

export function relativeDayKey(key: string, today = dayKey()): string {
  if (key === today) return 'Heute';
  if (key === addDays(today, -1)) return 'Gestern';
  if (key === addDays(today, 1)) return 'Morgen';
  return dayLong(key);
}
