/**
 * Customisable home screen: which widgets are shown and in which order.
 * Stored as an ordered id list in settings.homeWidgets (null = default layout).
 */
export type WidgetSize = 'full' | 'half';
export type WidgetId = 'pet' | 'start' | 'shortcuts' | 'training' | 'nutrition' | 'activity' | 'body' | 'progress' | 'lastWorkout' | 'records';

export interface WidgetMeta {
  id: WidgetId;
  title: string;
  description: string;
  /** default size – the user can switch every widget between full width and a small half tile */
  size: WidgetSize;
  area: 'train' | 'food' | 'move' | 'body' | 'pet' | 'neutral';
}

export const WIDGETS: WidgetMeta[] = [
  { id: 'pet', title: 'Kettli', description: 'Dein Begleiter und die heutigen Aufgaben', size: 'full', area: 'pet' },
  { id: 'start', title: 'Workout starten', description: 'Großer Start-Knopf bzw. laufendes Workout', size: 'full', area: 'train' },
  { id: 'shortcuts', title: 'Schnellzugriffe', description: 'Pläne, neuer Plan, Verlauf, Statistik', size: 'full', area: 'neutral' },
  { id: 'training', title: 'Training', description: 'Letztes Workout und diese Woche', size: 'full', area: 'train' },
  { id: 'nutrition', title: 'Ernährung', description: 'Kalorien und Makros von heute', size: 'full', area: 'food' },
  { id: 'activity', title: 'Aktivität', description: 'Schritte heute und Schrittziel', size: 'half', area: 'move' },
  { id: 'body', title: 'Körper', description: 'Aktuelles Gewicht und Ziel', size: 'half', area: 'body' },
  { id: 'progress', title: 'Trainingsfortschritt', description: 'Gesamtwerte und die letzten 8 Wochen', size: 'full', area: 'train' },
  { id: 'lastWorkout', title: 'Letztes Workout', description: 'Direkt zum letzten Training', size: 'full', area: 'train' },
  { id: 'records', title: 'Bestleistungen', description: 'Deine neuesten Rekorde', size: 'full', area: 'train' },
];

export const DEFAULT_LAYOUT: WidgetId[] = ['pet', 'start', 'shortcuts', 'training', 'nutrition', 'activity', 'body', 'progress', 'records'];

const KNOWN = new Set<string>(WIDGETS.map((w) => w.id));

/** Stored list → valid, de-duplicated ids (unknown ids from older/newer versions are dropped). */
export function normalizeLayout(stored: string[] | null | undefined): WidgetId[] {
  if (!stored) return [...DEFAULT_LAYOUT];
  const out: WidgetId[] = [];
  for (const id of stored) if (KNOWN.has(id) && !out.includes(id as WidgetId)) out.push(id as WidgetId);
  return out;
}

export function moveWidget(list: WidgetId[], id: WidgetId, to: number): WidgetId[] {
  const from = list.indexOf(id);
  if (from < 0) return list;
  const next = [...list];
  next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, id);
  return next;
}

export const removeWidget = (list: WidgetId[], id: WidgetId): WidgetId[] => list.filter((x) => x !== id);

/** Added widgets go to the end – the user can move them afterwards. */
export const addWidget = (list: WidgetId[], id: WidgetId): WidgetId[] => (list.includes(id) ? list : [...list, id]);

export const hiddenWidgets = (list: WidgetId[]): WidgetMeta[] => WIDGETS.filter((w) => !list.includes(w.id));

export const widgetMeta = (id: WidgetId): WidgetMeta => WIDGETS.find((w) => w.id === id)!;

export function widgetSize(id: WidgetId, sizes: Record<string, string> | null | undefined): WidgetSize {
  const s = sizes?.[id];
  return s === 'full' || s === 'half' ? s : widgetMeta(id).size;
}

/** Returns the new size map; sizes equal to the default are not stored. */
export function setWidgetSize(sizes: Record<string, WidgetSize> | null | undefined, id: WidgetId, size: WidgetSize): Record<string, WidgetSize> {
  const next = { ...(sizes ?? {}) };
  if (size === widgetMeta(id).size) delete next[id];
  else next[id] = size;
  return next;
}
