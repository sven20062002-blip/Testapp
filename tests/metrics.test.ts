import { describe, expect, it } from 'vitest';
import { buildRecordTimeline, detectLivePRs, estimate1RM, setVolume, sumVolume, compareSet } from '@/lib/metrics';
import { clockElapsedMs, formatHMS, restRemainingMs, setTimerElapsedMs } from '@/lib/time';
import { parseDecimal, fmtWeight, unitToKg } from '@/lib/units';

const S = (weight: number | null, reps: number | null, extra: Partial<{ holdSec: number; kind: 'normal' | 'warmup'; completed: 0 | 1; id: string }> = {}) => ({
  id: extra.id ?? Math.random().toString(36),
  weight,
  reps,
  holdSec: extra.holdSec ?? null,
  completed: extra.completed ?? 1,
  kind: extra.kind ?? 'normal',
});

describe('volume', () => {
  it('weight × reps, only completed sets', () => {
    expect(sumVolume([S(60, 12), S(70, 10), S(75, 8)])).toBe(2020);
    expect(setVolume(S(100, 5, { completed: 0 }))).toBe(0);
  });
  it('bodyweight and duration sets never invent kilograms', () => {
    expect(setVolume(S(null, 15))).toBe(0);
    expect(setVolume(S(null, null, { holdSec: 60 }))).toBe(0);
    expect(setVolume(S(10, 8))).toBe(80); // weighted pull-up: added weight only
  });
});

describe('1RM', () => {
  it('Epley, only up to 12 reps', () => {
    expect(estimate1RM(100, 1)).toBe(100);
    expect(estimate1RM(100, 10)).toBeCloseTo(133.33, 1);
    expect(estimate1RM(100, 15)).toBeNull();
    expect(estimate1RM(null, 5)).toBeNull();
  });
});

describe('timers (timestamp based)', () => {
  it('workout clock with pauses', () => {
    expect(clockElapsedMs({ startedAt: 0, pausedAt: null, pausedMs: 0 }, 3_661_000)).toBe(3_661_000);
    expect(formatHMS(3_661_000)).toBe('01:01:01');
    // paused at 10s, now 100s → frozen at 10s
    expect(clockElapsedMs({ startedAt: 0, pausedAt: 10_000, pausedMs: 0 }, 100_000)).toBe(10_000);
    // resumed: 30s paused total
    expect(clockElapsedMs({ startedAt: 0, pausedAt: null, pausedMs: 30_000 }, 100_000)).toBe(70_000);
    expect(clockElapsedMs({ startedAt: 0, endedAt: 50_000, pausedAt: null, pausedMs: 0 }, 999_999)).toBe(50_000);
  });
  it('set timer freezes while workout paused', () => {
    expect(setTimerElapsedMs({ timerStartedAt: 1000, timerPausedMs: 0 }, 5000, 60_000)).toBe(4000);
    expect(setTimerElapsedMs({ timerStartedAt: 1000, timerPausedMs: 2000 }, null, 10_000)).toBe(7000);
  });
  it('rest countdown', () => {
    expect(restRemainingMs({ status: 'running', endsAt: 90_000, remainingMs: null }, 30_000)).toBe(60_000);
    expect(restRemainingMs({ status: 'running', endsAt: 90_000, remainingMs: null }, 120_000)).toBe(0);
    expect(restRemainingMs({ status: 'paused', endsAt: null, remainingMs: 12_000 }, 999)).toBe(12_000);
  });
});

describe('units', () => {
  it('parses German decimals', () => {
    expect(parseDecimal('72,5')).toBe(72.5);
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('-3')).toBeNull();
    expect(parseDecimal('abc')).toBeNull();
  });
  it('lb conversion roundtrip', () => {
    expect(fmtWeight(unitToKg(225, 'lb'), 'lb')).toBe('225 lb');
    expect(fmtWeight(72.5, 'kg')).toBe('72,5 kg');
  });
});

describe('personal records', () => {
  it('timeline: baseline first, then only real improvements', () => {
    const t = buildRecordTimeline('bench', 'weight_reps', [
      { workoutId: 'w1', at: 1, sets: [S(80, 8, { id: 'a' })] },
      { workoutId: 'w2', at: 2, sets: [S(80, 8, { id: 'b' })] },
      { workoutId: 'w3', at: 3, sets: [S(85, 8, { id: 'c' })] },
    ]);
    const weight = t.filter((r) => r.type === 'weight');
    expect(weight).toHaveLength(2);
    expect(weight[0].prevValue).toBeNull();
    expect(weight[1]).toMatchObject({ value: 85, reps: 8, prevValue: 80, prevWeight: 80, prevReps: 8, workoutId: 'w3' });
    expect(t.filter((r) => r.type === 'volume').map((r) => r.value)).toEqual([640, 680]);
  });
  it('warm-up sets are ignored for records', () => {
    const t = buildRecordTimeline('bench', 'weight_reps', [
      { workoutId: 'w1', at: 1, sets: [S(100, 1, { kind: 'warmup' }), S(60, 10)] },
    ]);
    expect(t.find((r) => r.type === 'weight')!.value).toBe(60);
  });
  it('rep PR only against same or higher weight', () => {
    const hist = [S(80, 8), S(60, 12)];
    // 70 × 10: there is 80×8 (heavier) → 10 > 8 → PR against comparable load
    const p1 = detectLivePRs('weight_reps', S(70, 10, { id: 'x' }), hist, []);
    expect(p1.find((p) => p.type === 'reps')).toMatchObject({ prevValue: 8, prevWeight: 80 });
    // 50 × 11: heavier 60×12 exists → no rep PR
    expect(detectLivePRs('weight_reps', S(50, 11, { id: 'y' }), hist, []).find((p) => p.type === 'reps')).toBeUndefined();
  });
  it('live: weight PR with old vs new, no PR without history', () => {
    const p = detectLivePRs('weight_reps', S(85, 8, { id: 'n' }), [S(80, 8)], []);
    expect(p.find((x) => x.type === 'weight')).toMatchObject({ value: 85, prevValue: 80, prevReps: 8 });
    expect(p.find((x) => x.type === 'e1rm')).toBeUndefined(); // redundant with weight PR
    expect(detectLivePRs('weight_reps', S(85, 8, { id: 'n' }), [], [])).toEqual([]);
  });
  it('duration PR for planks', () => {
    const p = detectLivePRs('duration', S(null, null, { holdSec: 75, id: 'p' }), [S(null, null, { holdSec: 60 })], []);
    expect(p).toEqual([expect.objectContaining({ type: 'duration', value: 75, prevValue: 60 })]);
  });
});

describe('compare with last workout', () => {
  it('detects increases and decreases', () => {
    expect(compareSet({ weight: 80, reps: 6, holdSec: null }, { weight: 75, reps: 8, holdSec: null })).toEqual({
      weight: 'up',
      reps: 'down',
      hold: 'none',
    });
  });
});

describe('first session', () => {
  it('no live PRs without previous workouts (even if later sets are heavier)', () => {
    expect(detectLivePRs('weight_reps', S(70, 10, { id: 'b' }), [], [S(60, 12)])).toEqual([]);
  });
});
