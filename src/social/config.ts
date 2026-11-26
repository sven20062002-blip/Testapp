/**
 * Supabase connection. Values come from the build (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)
 * or – if the app was built without them – from what the user entered in the app.
 * The anon key is public by design; all data access is protected by Row Level Security.
 */
const KEY = 'forge-supabase';

export interface SocialConfig {
  url: string;
  anonKey: string;
  source: 'build' | 'app';
}

export function getConfig(): SocialConfig | null {
  const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (envUrl && envKey) return { url: envUrl, anonKey: envKey, source: 'build' };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return v?.url && v?.anonKey ? { url: v.url, anonKey: v.anonKey, source: 'app' } : null;
  } catch {
    return null;
  }
}

export function validateConfig(url: string, anonKey: string): string | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return 'Bitte die vollständige Project-URL eingeben (https://….supabase.co).';
  }
  if (u.protocol !== 'https:' && u.hostname !== 'localhost') return 'Die Project-URL muss mit https:// beginnen.';
  const k = anonKey.trim();
  // legacy anon keys are JWTs (eyJ…), new publishable keys start with sb_publishable_
  if (!/^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(k) && !/^sb_publishable_[\w-]{10,}$/.test(k)) return 'Das sieht nicht wie ein öffentlicher Supabase-Schlüssel (anon / publishable) aus.';
  if (/^eyJ/.test(k)) {
    try {
      const payload = JSON.parse(atob(k.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (payload.role === 'service_role') return 'Das ist der geheime service_role-Schlüssel! Bitte NUR den öffentlichen anon-Schlüssel verwenden.';
    } catch {
      /* not decodable – let the server decide */
    }
  }
  return null;
}

export function saveConfig(url: string, anonKey: string): void {
  localStorage.setItem(KEY, JSON.stringify({ url: url.trim().replace(/\/+$/, ''), anonKey: anonKey.trim() }));
}

export function clearConfig(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Invite link: carries the (public) server config + who invited, so friends need no manual setup. */
export function inviteLink(username: string): string | null {
  const c = getConfig();
  if (!c) return null;
  const u = new URL('/social', location.origin);
  u.searchParams.set('sb', c.url);
  u.searchParams.set('key', c.anonKey);
  u.searchParams.set('from', username);
  return u.toString();
}

/** Apply ?sb=&key= from an invite link (only if no server is configured yet). Returns the inviter. */
export function applyInviteParams(search: string): { applied: boolean; from: string | null; error?: string } {
  const p = new URLSearchParams(search);
  const url = p.get('sb');
  const key = p.get('key');
  const from = p.get('from');
  if (!url || !key) return { applied: false, from };
  const cur = getConfig();
  if (cur) return { applied: false, from, error: cur.url === url.replace(/\/+$/, '') ? undefined : 'Diese App ist bereits mit einem anderen Server verbunden.' };
  const err = validateConfig(url, key);
  if (err) return { applied: false, from, error: err };
  saveConfig(url, key);
  return { applied: true, from };
}
