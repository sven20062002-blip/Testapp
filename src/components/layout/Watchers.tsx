import { useEffect, useRef } from 'react';
import { useActiveWorkout, useNow, useRest, useSettings } from '@/hooks/useData';
import { markRestDone, stopRest } from '@/db/repo/timers';
import { nextOpenSet, startSetTimer } from '@/db/repo/workouts';
import { restRemainingMs } from '@/lib/time';
import { playRestDone, systemNotify, unlockAudio, vibrate } from '@/services/feedback';
import { useFeedback } from '@/components/ui/Feedback';
import { autoSync } from '@/health/sync';

/**
 * Global, route-independent watchers:
 *  - fires the rest-timer completion exactly once (also after reload / background)
 *  - keeps the theme in sync
 *  - holds a screen wake lock during workouts
 */
export function Watchers() {
  return (
    <>
      <RestWatcher />
      <ThemeSync />
      <WakeLock />
      <AudioUnlock />
      <HealthAutoSync />
    </>
  );
}

function RestWatcher() {
  const rest = useRest();
  const settings = useSettings();
  const { toast } = useFeedback();
  const running = rest.status === 'running';
  const now = useNow(running, 200);
  const firing = useRef(false);

  useEffect(() => {
    if (!running || !rest.endsAt || firing.current) return;
    if (restRemainingMs(rest, now) > 0) return;
    firing.current = true;
    // If we come back long after the timer elapsed (app was suspended), stay silent.
    const late = now - rest.endsAt > 60_000;
    void (async () => {
      const did = await markRestDone();
      if (did && !late) {
        if (settings.sound) playRestDone();
        if (settings.vibration) vibrate([200, 100, 200]);
        toast('Pause vorbei – auf zum nächsten Satz!', 'success');
        void systemNotify('Pause vorbei', 'Zeit für den nächsten Satz 💪');
      }
      if (did && settings.autoStartSetTimer && rest.workoutId && !late) {
        const next = await nextOpenSet(rest.workoutId, rest.workoutExerciseId);
        if (next && !next.timerStartedAt) await startSetTimer(next.id);
      }
      firing.current = false;
    })();
  }, [running, rest, now, settings.sound, settings.vibration, settings.autoStartSetTimer, toast]);

  // clear the "done" state after a moment
  useEffect(() => {
    if (rest.status !== 'done') return;
    const t = setTimeout(() => void stopRest(), 6000);
    return () => clearTimeout(t);
  }, [rest.status, rest.updatedAt]);

  return null;
}

function ThemeSync() {
  const { theme } = useSettings();
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      document.documentElement.classList.toggle('dark', dark);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0A0A0B' : '#F6F6F8');
    };
    apply();
    try {
      localStorage.setItem('forge-theme', theme);
    } catch {
      /* ignore */
    }
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
  return null;
}

function WakeLock() {
  const active = useActiveWorkout();
  const { keepAwake } = useSettings();
  const want = !!active && keepAwake;
  useEffect(() => {
    if (!want || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        if (document.visibilityState === 'visible') lock = await navigator.wakeLock.request('screen');
      } catch {
        /* not allowed */
      }
      if (cancelled) void lock?.release();
    };
    void acquire();
    const onVis = () => document.visibilityState === 'visible' && void acquire();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      void lock?.release();
    };
  }, [want]);
  return null;
}

function AudioUnlock() {
  useEffect(() => {
    const h = () => {
      unlockAudio();
      window.removeEventListener('pointerdown', h);
    };
    window.addEventListener('pointerdown', h);
    return () => window.removeEventListener('pointerdown', h);
  }, []);
  return null;
}

/** Background health sync: on start, when the app returns to the foreground and every 30 min. Never opens popups. */
function HealthAutoSync() {
  useEffect(() => {
    const run = () => document.visibilityState === 'visible' && void autoSync();
    run();
    const id = setInterval(run, 30 * 60_000);
    document.addEventListener('visibilitychange', run);
    window.addEventListener('online', run);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', run);
      window.removeEventListener('online', run);
    };
  }, []);
  return null;
}
