import type { PersonalRecord, RecordType, TrackingType, WorkoutSet } from '@/db/types';

/** Minimal shape needed for metric calculations */
export type SetLike = Pick<WorkoutSet, 'weight' | 'reps' | 'holdSec' | 'completed' | 'kind'> & {
  id?: string;
};

/** A set only counts when completed and has meaningful data. */
export function isCountable(s: SetLike): boolean {
  return s.completed === 1 && ((s.reps ?? 0) > 0 || (s.holdSec ?? 0) > 0);
}

/**
 * Volume of a single set = weight × reps (kg). Sets without weight (pure bodyweight,
 * planks) produce 0 kg – we never invent kilograms.
 */
export function setVolume(s: SetLike): number {
  if (s.completed !== 1) return 0;
  const w = s.weight ?? 0;
  const r = s.reps ?? 0;
  if (w <= 0 || r <= 0) return 0;
  return w * r;
}

export function sumVolume(sets: SetLike[]): number {
  return sets.reduce((a, s) => a + setVolume(s), 0);
}

export function sumReps(sets: SetLike[]): number {
  return sets.reduce((a, s) => a + (s.completed === 1 ? s.reps ?? 0 : 0), 0);
}

export function countCompleted(sets: SetLike[]): number {
  return sets.filter(isCountable).length;
}

/** Max reps for which the 1RM estimate is considered meaningful. */
export const E1RM_MAX_REPS = 12;

/** Epley formula. Returns null when not meaningfully estimable. */
export function estimate1RM(weight: number | null, reps: number | null): number | null {
  if (!weight || !reps || weight <= 0 || reps <= 0 || reps > E1RM_MAX_REPS) return null;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

/** Which record types make sense for which tracking type */
export function recordTypesFor(t: TrackingType): RecordType[] {
  switch (t) {
    case 'weight_reps':
      return ['weight', 'e1rm', 'reps', 'volume'];
    case 'bodyweight_reps':
      return ['reps', 'weight', 'volume'];
    case 'duration':
      return ['duration'];
  }
}

/** Set eligible for records: completed, not warm-up, with data */
function eligible(s: SetLike): boolean {
  return s.completed === 1 && s.kind !== 'warmup' && isCountable(s);
}

export interface SetCandidate {
  value: number;
  weight: number | null;
  reps: number | null;
  setId: string | null;
}

/** Value of a single set for a given record type (null if not applicable) */
export function setRecordValue(type: RecordType, s: SetLike): number | null {
  switch (type) {
    case 'weight':
      return (s.weight ?? 0) > 0 && (s.reps ?? 0) > 0 ? s.weight! : null;
    case 'e1rm':
      return estimate1RM(s.weight, s.reps);
    case 'reps':
      return (s.reps ?? 0) > 0 ? s.reps! : null;
    case 'duration':
      return (s.holdSec ?? 0) > 0 ? s.holdSec! : null;
    default:
      return null;
  }
}

/** Compare two candidates of the same type. Tie-break: more reps (for weight) / heavier (for reps). */
function better(type: RecordType, a: SetCandidate, b: SetCandidate | null): boolean {
  if (!b) return true;
  if (a.value !== b.value) return a.value > b.value;
  if (type === 'weight') return (a.reps ?? 0) > (b.reps ?? 0);
  if (type === 'reps') return (a.weight ?? 0) > (b.weight ?? 0);
  return false;
}

/** Best set of a list for a set-level record type */
export function bestSet(type: RecordType, sets: SetLike[]): SetCandidate | null {
  let best: SetCandidate | null = null;
  for (const s of sets) {
    if (!eligible(s)) continue;
    const v = setRecordValue(type, s);
    if (v == null) continue;
    const c: SetCandidate = { value: v, weight: s.weight, reps: s.reps, setId: s.id ?? null };
    if (better(type, c, best)) best = c;
  }
  return best;
}

/**
 * Rep record ("meiste Wiederholungen") is only meaningful at comparable load:
 * a set is a rep PR when it has more reps than any previous set with the SAME OR
 * HIGHER weight. Returns the previous best it beat, or undefined when no comparison exists.
 */
export function repRecordAgainst(
  s: SetLike,
  previous: SetLike[],
): { prev: SetCandidate } | null {
  if (!eligible(s) || !(s.reps && s.reps > 0)) return null;
  const w = s.weight ?? 0;
  let prev: SetCandidate | null = null;
  for (const p of previous) {
    if (!eligible(p) || !(p.reps && p.reps > 0)) continue;
    if ((p.weight ?? 0) < w) continue;
    if (!prev || p.reps > prev.value || (p.reps === prev.value && (p.weight ?? 0) < (prev.weight ?? 0)))
      prev = { value: p.reps, weight: p.weight, reps: p.reps, setId: p.id ?? null };
  }
  if (!prev) return null; // nothing comparable yet → not a "record", just a first entry
  return s.reps > prev.value ? { prev } : null;
}

export interface Session {
  workoutId: string;
  at: number;
  sets: (SetLike & { id: string })[];
}

type RecordDraft = Omit<PersonalRecord, 'id'>;

/**
 * Builds the complete record timeline for one exercise from its chronological sessions.
 * First appearance creates a baseline entry (prev = null). Later entries only when beaten.
 */
export function buildRecordTimeline(exerciseId: string, tracking: TrackingType, sessions: Session[]): RecordDraft[] {
  const sorted = [...sessions].sort((a, b) => a.at - b.at);
  const types = recordTypesFor(tracking);
  const out: RecordDraft[] = [];
  const bestByType = new Map<RecordType, SetCandidate>();
  const allPrev: SetLike[] = [];

  for (const ses of sorted) {
    for (const type of types) {
      if (type === 'volume') {
        const vol = sumVolume(ses.sets.filter((s) => s.kind !== 'warmup'));
        if (vol <= 0) continue;
        const prev = bestByType.get('volume') ?? null;
        if (!prev || vol > prev.value) {
          out.push(draft(exerciseId, 'volume', { value: vol, weight: null, reps: null, setId: null }, prev, ses));
          bestByType.set('volume', { value: vol, weight: null, reps: null, setId: null });
        }
        continue;
      }
      if (type === 'reps') {
        // first ever session: baseline = most reps set
        const cand = bestSet('reps', ses.sets);
        if (!cand) continue;
        if (!bestByType.has('reps')) {
          out.push(draft(exerciseId, 'reps', cand, null, ses));
          bestByType.set('reps', cand);
          continue;
        }
        // one rep-PR per session: heaviest set that beats comparable history
        let chosen: { c: SetCandidate; prev: SetCandidate } | null = null;
        const prior: SetLike[] = [...allPrev];
        for (const s of ses.sets) {
          const r = repRecordAgainst(s, prior);
          if (r) {
            const c = { value: s.reps!, weight: s.weight, reps: s.reps, setId: s.id };
            if (!chosen || (c.weight ?? 0) > (chosen.c.weight ?? 0) || ((c.weight ?? 0) === (chosen.c.weight ?? 0) && c.value > chosen.c.value))
              chosen = { c, prev: r.prev };
          }
          prior.push(s);
        }
        if (chosen) {
          out.push(draft(exerciseId, 'reps', chosen.c, chosen.prev, ses));
          const cur = bestByType.get('reps')!;
          if (better('reps', chosen.c, cur)) bestByType.set('reps', chosen.c);
        }
        continue;
      }
      const cand = bestSet(type, ses.sets);
      if (!cand) continue;
      const prev = bestByType.get(type) ?? null;
      if (better(type, cand, prev) && (!prev || cand.value > prev.value || type === 'weight')) {
        // for 'weight', same weight with more reps also counts as an improvement
        out.push(draft(exerciseId, type, cand, prev, ses));
        bestByType.set(type, cand);
      }
    }
    allPrev.push(...ses.sets);
  }
  return out;
}

function draft(
  exerciseId: string,
  type: RecordType,
  c: SetCandidate,
  prev: SetCandidate | null,
  ses: Session,
): RecordDraft {
  return {
    exerciseId,
    type,
    value: c.value,
    weight: c.weight,
    reps: c.reps,
    prevValue: prev?.value ?? null,
    prevWeight: prev?.weight ?? null,
    prevReps: prev?.reps ?? null,
    workoutId: ses.workoutId,
    setId: c.setId,
    achievedAt: ses.at,
  };
}

/** Live PR check for a set that was just completed. */
export interface LivePR {
  type: RecordType;
  value: number;
  weight: number | null;
  reps: number | null;
  prevValue: number;
  prevWeight: number | null;
  prevReps: number | null;
}

export function detectLivePRs(
  tracking: TrackingType,
  set: SetLike & { id: string },
  history: SetLike[],
  earlierThisWorkout: SetLike[],
): LivePR[] {
  if (!eligible(set)) return [];
  // Without any previous workout of this exercise, everything is a baseline – no PR spam
  // in the very first session (matches buildRecordTimeline).
  if (!history.some(eligible)) return [];
  const prior = [...history, ...earlierThisWorkout];
  const out: LivePR[] = [];
  for (const type of recordTypesFor(tracking)) {
    if (type === 'volume') continue; // session-level, evaluated on finish
    if (type === 'reps') {
      const r = repRecordAgainst(set, prior);
      if (r)
        out.push({
          type,
          value: set.reps!,
          weight: set.weight,
          reps: set.reps,
          prevValue: r.prev.value,
          prevWeight: r.prev.weight,
          prevReps: r.prev.reps,
        });
      continue;
    }
    const v = setRecordValue(type, set);
    if (v == null) continue;
    const prev = bestSet(type, prior);
    if (!prev) continue; // no comparable history → baseline, not a PR
    const cand: SetCandidate = { value: v, weight: set.weight, reps: set.reps, setId: set.id };
    const improved = type === 'weight' ? better(type, cand, prev) : v > prev.value + 1e-9;
    if (improved)
      out.push({ type, value: v, weight: set.weight, reps: set.reps, prevValue: prev.value, prevWeight: prev.weight, prevReps: prev.reps });
  }
  // Prefer the most meaningful: if weight PR exists, an e1rm PR is redundant noise
  const hasWeight = out.some((p) => p.type === 'weight');
  return hasWeight ? out.filter((p) => p.type !== 'e1rm') : out;
}

/** Comparison of a current value vs a previous value (for "last workout" view) */
export type Trend = 'up' | 'same' | 'down' | 'none';

export function compareSet(
  cur: { weight: number | null; reps: number | null; holdSec: number | null },
  prev: { weight: number | null; reps: number | null; holdSec: number | null } | undefined,
): { weight: Trend; reps: Trend; hold: Trend } {
  const t = (a: number | null, b: number | null | undefined): Trend => {
    if (a == null || b == null) return 'none';
    if (a > b + 1e-9) return 'up';
    if (a < b - 1e-9) return 'down';
    return 'same';
  };
  return {
    weight: t(cur.weight, prev?.weight),
    reps: t(cur.reps, prev?.reps),
    hold: t(cur.holdSec, prev?.holdSec),
  };
}
