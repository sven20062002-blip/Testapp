/**
 * "App is being left": tab hidden (app switch, home button, screen off), page unload or the
 * browser freezing the page. On mobile `pagehide`/`beforeunload` are unreliable, `visibilitychange`
 * → hidden is the last event that is guaranteed to fire – so all three are handled.
 */
export function onAppLeave(cb: () => void): () => void {
  const onVis = () => document.visibilityState === 'hidden' && cb();
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('pagehide', cb);
  document.addEventListener('freeze', cb);
  return () => {
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('pagehide', cb);
    document.removeEventListener('freeze', cb);
  };
}

/** Small JSON drafts in localStorage (never throws – private mode etc.). */
export function readDraft<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
export function writeDraft(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full / blocked */
  }
}
export function clearDraft(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
