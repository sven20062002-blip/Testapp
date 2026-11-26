import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getConfig } from './config';

let client: SupabaseClient | null = null;
let clientKey = '';

/** Lazily created Supabase client (null when no server is configured). */
export function getClient(): SupabaseClient | null {
  const cfg = getConfig();
  if (!cfg) return null;
  const k = `${cfg.url}|${cfg.anonKey}`;
  if (!client || clientKey !== k) {
    client = createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'forge-auth', detectSessionInUrl: true },
      realtime: { params: { eventsPerSecond: 5 } },
    });
    clientKey = k;
  }
  return client;
}

export function requireClient(): SupabaseClient {
  const c = getClient();
  if (!c) throw new SocialError('Kein Online-Server eingerichtet.', 'not_configured');
  return c;
}

export function resetClient(): void {
  client = null;
  clientKey = '';
}

/** Error with a stable code (server error message or our own) and a German message for the UI. */
export class SocialError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
  }
}

const MESSAGES: Record<string, string> = {
  not_authenticated: 'Bitte melde dich an.',
  not_found: 'Diesen Benutzernamen gibt es nicht.',
  self: 'Du kannst dich nicht selbst hinzufügen.',
  already_friends: 'Ihr seid bereits befreundet.',
  already_requested: 'Anfrage wurde bereits gesendet.',
  not_friends: 'Das geht nur mit bestätigten Freunden.',
  invalid_metric: 'Ungültige Wertung.',
  exercise_required: 'Für diese Wertung bitte eine Übung wählen.',
  invalid_period: 'Ungültiger Zeitraum (maximal 90 Tage).',
  duel_exists: 'Mit dieser Person läuft bereits ein Duell.',
  not_allowed: 'Dafür fehlt die Berechtigung.',
  profile_missing: 'Bitte lege zuerst dein Profil an.',
  invalid_title: 'Titel: 1–60 Zeichen.',
  too_many_invitees: 'Maximal 50 Einladungen pro Challenge.',
  not_member: 'Du bist nicht Teil dieser Challenge.',
  not_invited: 'Diese Einladung gibt es nicht (mehr).',
  invalid_duration: 'Dauer muss zwischen 5 und 180 Minuten liegen.',
  '23505': 'Dieser Benutzername ist schon vergeben.',
  '23514': 'Ungültige Eingabe.',
  '42501': 'Dafür fehlt die Berechtigung.',
};

/** Normalise Supabase/PostgREST errors into SocialError with a readable German message. */
export function toSocialError(e: unknown): SocialError {
  if (e instanceof SocialError) return e;
  const err = e as { message?: string; code?: string; status?: number; name?: string };
  const msg = err?.message ?? String(e);
  const code = Object.keys(MESSAGES).find((k) => msg === k || msg.includes(k)) ?? err?.code ?? 'unknown';
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return new SocialError('Keine Verbindung zum Server.', 'network');
  if (/Invalid login credentials/i.test(msg)) return new SocialError('E-Mail oder Passwort ist falsch.', 'invalid_credentials');
  if (/Email not confirmed/i.test(msg)) return new SocialError('Bitte bestätige zuerst deine E-Mail-Adresse (Link im Postfach).', 'email_not_confirmed');
  if (/User already registered/i.test(msg)) return new SocialError('Für diese E-Mail gibt es schon ein Konto – bitte anmelden.', 'user_exists');
  if (/Password should be/i.test(msg)) return new SocialError('Das Passwort ist zu kurz (mindestens 6 Zeichen).', 'weak_password');
  if (/rate limit/i.test(msg)) return new SocialError('Zu viele Versuche – bitte kurz warten.', 'rate_limit');
  return new SocialError(MESSAGES[code] ?? msg, code);
}
