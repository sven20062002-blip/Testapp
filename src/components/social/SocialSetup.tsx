import { useState } from 'react';
import { Cloud, KeyRound, Mail, ShieldCheck } from 'lucide-react';
import clsx from 'clsx';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';
import { Toggle } from '@/components/ui/Toggle';
import { useFeedback } from '@/components/ui/Feedback';
import { Field } from '@/components/exercises/ExerciseForm';
import { resetClient } from '@/social/client';
import { saveConfig, validateConfig } from '@/social/config';
import { resetPassword, saveProfile, signIn, signUp, validateProfile } from '@/social/api';
import { refreshSocial } from '@/social/hooks';
import { enqueueAllWorkouts, setSyncEnabled } from '@/social/outbox';
import { Avatar, AVATAR_COLORS } from './Avatar';

/** Step 1: connect the app to the user's own Supabase project. */
export function ServerSetup() {
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [err, setErr] = useState('');
  return (
    <div className="card p-5">
      <span className="chip chip-social h-11 w-11 rounded-2xl">
        <Cloud size={22} />
      </span>
      <h2 className="mt-4 text-[20px] font-semibold tracking-[-0.01em]">Online-Server verbinden</h2>
      <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
        Für Freunde, Duelle und Ranglisten braucht Forge einen Server. Du nutzt dafür dein eigenes, kostenloses Supabase-Projekt – deine Daten liegen bei dir. Die Anleitung steht in
        <span className="font-medium text-fg"> docs/SUPABASE_SETUP.md</span>.
      </p>
      <div className="mt-5 space-y-3">
        <Field label="Project URL" htmlFor="sb-url">
          <input id="sb-url" className="field" placeholder="https://abcd1234.supabase.co" value={url} onChange={(e) => (setUrl(e.target.value), setErr(''))} autoComplete="off" />
        </Field>
        <Field label="Öffentlicher Schlüssel (anon / publishable)" htmlFor="sb-key">
          <input id="sb-key" className="field font-mono text-[12px]" placeholder="eyJhbGciOi… oder sb_publishable_…" value={key} onChange={(e) => (setKey(e.target.value), setErr(''))} autoComplete="off" />
        </Field>
        {err && <p className="animate-shake text-sm font-medium text-bad">{err}</p>}
        <Button
          variant="primary"
          size="lg"
          block
          onClick={() => {
            const e = validateConfig(url, key);
            if (e) return setErr(e);
            saveConfig(url, key);
            resetClient();
            refreshSocial();
          }}
        >
          Verbinden
        </Button>
      </div>
      <p className="mt-4 flex gap-2 text-[12px] leading-relaxed text-subtle">
        <ShieldCheck size={14} className="mt-0.5 shrink-0" />
        Der öffentliche Schlüssel darf in der App stehen: Zugriffe sind serverseitig durch Row Level Security geschützt. Den geheimen service_role-Schlüssel niemals eintragen.
      </p>
    </div>
  );
}

/** Step 2: sign in / register with e-mail + password. */
export function AuthForm() {
  const { toast } = useFeedback();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');

  const submit = async () => {
    setErr('');
    setInfo('');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setErr('Bitte eine gültige E-Mail-Adresse eingeben.');
    if (pw.length < 6) return setErr('Das Passwort braucht mindestens 6 Zeichen.');
    setBusy(true);
    try {
      if (mode === 'in') await signIn(email, pw);
      else {
        const r = await signUp(email, pw);
        if (r.needsConfirmation) setInfo('Fast geschafft: Bitte bestätige deine E-Mail-Adresse über den Link in deinem Postfach und melde dich dann hier an.');
        else toast('Konto erstellt', 'success');
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-5">
      <span className="chip chip-social h-11 w-11 rounded-2xl">
        <KeyRound size={22} />
      </span>
      <h2 className="mt-4 text-[20px] font-semibold tracking-[-0.01em]">{mode === 'in' ? 'Anmelden' : 'Konto erstellen'}</h2>
      <p className="mt-1 text-[14px] text-muted">Trainiere mit Freunden, fordere sie zu Duellen heraus und vergleicht eure Bestleistungen.</p>
      <Segmented
        className="mt-5"
        value={mode}
        onChange={(m) => (setMode(m), setErr(''), setInfo(''))}
        options={[
          { value: 'in', label: 'Anmelden' },
          { value: 'up', label: 'Registrieren' },
        ]}
        label="Modus"
      />
      <form
        className="mt-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label="E-Mail" htmlFor="au-mail">
          <input id="au-mail" type="email" autoComplete="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Passwort" htmlFor="au-pw">
          <input id="au-pw" type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} className="field" value={pw} onChange={(e) => setPw(e.target.value)} />
        </Field>
        {err && <p className="animate-shake text-sm font-medium text-bad">{err}</p>}
        {info && <p className="rounded-xl bg-good/10 px-3 py-2 text-sm text-good">{info}</p>}
        <Button type="submit" variant="primary" size="lg" block disabled={busy}>
          {busy ? 'Bitte warten …' : mode === 'in' ? 'Anmelden' : 'Konto erstellen'}
        </Button>
      </form>
      {mode === 'in' && (
        <button
          className="mt-3 flex w-full items-center justify-center gap-1.5 text-[13px] font-medium text-muted hover:text-fg"
          onClick={async () => {
            if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setErr('Gib oben deine E-Mail ein, um das Passwort zurückzusetzen.');
            try {
              await resetPassword(email);
              setInfo('Wir haben dir einen Link zum Zurücksetzen geschickt.');
            } catch (e) {
              setErr((e as Error).message);
            }
          }}
        >
          <Mail size={14} /> Passwort vergessen?
        </button>
      )}
    </div>
  );
}

/** Step 3: choose username & look. Also used for editing. */
export function ProfileForm({
  userId,
  initial,
  onSaved,
  submitLabel = 'Profil speichern',
  firstTime,
}: {
  userId: string;
  initial?: { username: string; display_name: string; color: string; share_workouts: boolean };
  onSaved?: () => void;
  submitLabel?: string;
  firstTime?: boolean;
}) {
  const { toast } = useFeedback();
  const [username, setUsername] = useState(initial?.username ?? '');
  const [name, setName] = useState(initial?.display_name ?? '');
  const [color, setColor] = useState(initial?.color ?? AVATAR_COLORS[1]);
  const [share, setShare] = useState(initial?.share_workouts ?? true);
  const [upload, setUpload] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const p = { username: username.trim().toLowerCase(), display_name: name, color, share_workouts: share };
    const e = validateProfile(p);
    if (e) return setErr(e);
    setBusy(true);
    try {
      await saveProfile(userId, p);
      if (firstTime) {
        setSyncEnabled(true);
        if (upload) {
          const n = await enqueueAllWorkouts();
          if (n) toast(`${n} bisherige Workouts werden hochgeladen`, 'info');
        }
      }
      toast('Profil gespeichert', 'success');
      refreshSocial();
      onSaved?.();
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Avatar name={name || username || '?'} color={color} size={64} />
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Farbe">
          {AVATAR_COLORS.map((c) => (
            <button
              key={c}
              role="radio"
              aria-checked={color === c}
              aria-label={`Farbe ${c}`}
              onClick={() => setColor(c)}
              className={clsx('h-7 w-7 rounded-full transition', color === c ? 'ring-2 ring-fg ring-offset-2 ring-offset-surface' : 'opacity-80 hover:opacity-100')}
              style={{ background: c }}
            />
          ))}
        </div>
      </div>
      <Field label="Benutzername (zum Finden durch Freunde)" htmlFor="pf-user">
        <div className="relative">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">@</span>
          <input
            id="pf-user"
            className="field pl-8"
            value={username}
            maxLength={20}
            autoCapitalize="none"
            autoCorrect="off"
            onChange={(e) => (setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '')), setErr(''))}
            placeholder="max_power"
          />
        </div>
      </Field>
      <Field label="Anzeigename" htmlFor="pf-name">
        <input id="pf-name" className="field" value={name} maxLength={40} onChange={(e) => (setName(e.target.value), setErr(''))} placeholder="Max" />
      </Field>
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-elevated/60 px-4 py-3">
        <div>
          <div className="text-[14px] font-semibold">Workouts mit Freunden teilen</div>
          <div className="text-[12px] text-muted">Feed und Ranglisten. Challenges & Duelle funktionieren immer.</div>
        </div>
        <Toggle checked={share} onChange={setShare} label="Workouts mit Freunden teilen" />
      </div>
      {firstTime && (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-elevated/60 px-4 py-3">
          <div>
            <div className="text-[14px] font-semibold">Bisherige Workouts hochladen</div>
            <div className="text-[12px] text-muted">Damit Ranglisten von Anfang an deine Bestleistungen kennen.</div>
          </div>
          <Toggle checked={upload} onChange={setUpload} label="Bisherige Workouts hochladen" />
        </div>
      )}
      <p className="text-[12px] leading-relaxed text-subtle">
        Geteilt werden nur Zusammenfassungen: Workout-Name, Datum, Dauer, Volumen, Satzanzahl sowie pro Übung bestes Gewicht, geschätztes 1RM und Volumen. Notizen und einzelne Sätze bleiben
        auf deinem Gerät.
      </p>
      {err && <p className="animate-shake text-sm font-medium text-bad">{err}</p>}
      <Button variant="primary" size="lg" block onClick={save} disabled={busy}>
        {busy ? 'Speichert …' : submitLabel}
      </Button>
    </div>
  );
}
