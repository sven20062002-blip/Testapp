import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getClient } from './client';
import { getConfig } from './config';
import { getMyProfile, myDuels, subscribe } from './api';
import { flushOutbox } from './outbox';
import type { DuelSummary, SocialProfile } from './types';

export type SocialState =
  | { status: 'unconfigured' }
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'needsProfile'; session: Session }
  | { status: 'ready'; session: Session; profile: SocialProfile };

const listeners = new Set<() => void>();
/** Ask all useSocial() hooks to reload (e.g. after saving the profile). */
export function refreshSocial(): void {
  listeners.forEach((l) => l());
}

export function useSocial(): SocialState & { reload: () => void } {
  const [state, setState] = useState<SocialState>(() => (getConfig() ? { status: 'loading' } : { status: 'unconfigured' }));
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    listeners.add(reload);
    return () => {
      listeners.delete(reload);
    };
  }, [reload]);

  useEffect(() => {
    const c = getClient();
    if (!c) {
      setState({ status: 'unconfigured' });
      return;
    }
    let alive = true;
    const resolve = async (session: Session | null) => {
      if (!alive) return;
      if (!session) return setState({ status: 'signedOut' });
      try {
        const profile = await getMyProfile(session.user.id);
        if (!alive) return;
        setState(profile ? { status: 'ready', session, profile } : { status: 'needsProfile', session });
        if (profile) void flushOutbox();
      } catch {
        // offline: keep the user signed in, profile unknown → show cached session as ready-less
        if (alive) setState((s) => (s.status === 'ready' ? s : { status: 'needsProfile', session }));
      }
    };
    void c.auth.getSession().then(({ data }) => resolve(data.session));
    const { data: sub } = c.auth.onAuthStateChange((_e, session) => {
      void resolve(session);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [tick]);

  return { ...state, reload };
}

/** Generic async loader with realtime refresh. */
export function useRemote<T>(
  load: () => Promise<T>,
  deps: unknown[],
  realtime?: { table: string; filter?: string }[],
  /** fallback polling (ms) when the realtime socket is unavailable, plus local window events that trigger a reload */
  opts?: { pollMs?: number; events?: string[] },
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loadRef = useRef(load);
  loadRef.current = load;
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    const my = ++seq.current;
    setLoading(true);
    try {
      const d = await loadRef.current();
      if (my === seq.current) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (my === seq.current) setError((e as Error).message);
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const unsubs = (realtime ?? []).map((r) => subscribe('rt', r.table, r.filter, () => void refresh()));
    const onVis = () => document.visibilityState === 'visible' && void refresh();
    const onEvt = () => void refresh();
    document.addEventListener('visibilitychange', onVis);
    opts?.events?.forEach((e) => window.addEventListener(e, onEvt));
    const poll = opts?.pollMs ? setInterval(() => document.visibilityState === 'visible' && void refresh(), opts.pollMs) : null;
    return () => {
      unsubs.forEach((u) => u());
      document.removeEventListener('visibilitychange', onVis);
      opts?.events?.forEach((e) => window.removeEventListener(e, onEvt));
      if (poll) clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading, refresh };
}

/* ---------------- active duels (used by the workout screen) ---------------- */

let activeDuels: DuelSummary[] = [];
let activeLoadedAt = 0;

/** Duels in which sets of the current workout should be posted. Cached for 30 s. */
export async function getActiveDuels(force = false): Promise<DuelSummary[]> {
  if (!getConfig()) return [];
  if (!force && Date.now() - activeLoadedAt < 30_000) return activeDuels.filter((d) => d.ends_at && Date.parse(d.ends_at) > Date.now());
  try {
    const c = getClient();
    const { data } = (await c?.auth.getSession()) ?? { data: { session: null } };
    if (!data.session) return [];
    activeDuels = (await myDuels()).filter((d) => d.status === 'active' && d.ends_at && Date.parse(d.ends_at) > Date.now());
    activeLoadedAt = Date.now();
  } catch {
    /* offline – keep the last known list */
  }
  return activeDuels.filter((d) => d.ends_at && Date.parse(d.ends_at) > Date.now());
}

export function useActiveDuels(): DuelSummary[] {
  const [list, setList] = useState<DuelSummary[]>([]);
  useEffect(() => {
    let alive = true;
    const load = (force: boolean) => void getActiveDuels(force).then((d) => alive && setList(d));
    load(true);
    const id = setInterval(() => load(false), 15_000);
    const unsub = subscribe('duels-active', 'duels', undefined, () => load(true));
    return () => {
      alive = false;
      clearInterval(id);
      unsub();
    };
  }, []);
  return list;
}
