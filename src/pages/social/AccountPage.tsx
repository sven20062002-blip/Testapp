import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CloudUpload, LogOut, Server, ShieldCheck, Trash2 } from 'lucide-react';
import { useSocial, refreshSocial } from '@/social/hooks';
import { deleteMyAccount, deleteMySocialData, signOut, updatePassword } from '@/social/api';
import { enqueueAllWorkouts, flushOutbox, isSyncEnabled, pendingCount, setSyncEnabled } from '@/social/outbox';
import { clearConfig, getConfig } from '@/social/config';
import { resetClient } from '@/social/client';
import { PageHeader, SectionTitle } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { useFeedback } from '@/components/ui/Feedback';
import { ProfileForm } from '@/components/social/SocialSetup';

export default function AccountPage() {
  const s = useSocial();
  const nav = useNavigate();
  const { toast, confirm } = useFeedback();
  const [sync, setSync] = useState(isSyncEnabled());
  const [pending, setPending] = useState(0);
  const [pw, setPw] = useState('');
  const cfg = getConfig();

  useEffect(() => {
    void pendingCount().then(setPending);
    const id = setInterval(() => void pendingCount().then(setPending), 3000);
    return () => clearInterval(id);
  }, []);

  if (s.status !== 'ready')
    return (
      <div className="page">
        <PageHeader back="/social" title="Konto" />
        <p className="text-[13px] text-muted">Bitte zuerst unter „Freunde“ anmelden.</p>
      </div>
    );

  return (
    <div className="page">
      <PageHeader back="/social" title="Konto & Datenschutz" area="social" subtitle={s.session.user.email ?? undefined} />

      <section className="card p-4">
        <ProfileForm userId={s.session.user.id} initial={s.profile} />
      </section>

      <SectionTitle>Synchronisierung</SectionTitle>
      <section className="card divide-y divide-line/50">
        <div className="flex items-center justify-between gap-3 px-4 py-3.5">
          <div>
            <div className="text-[14px] font-semibold">Workouts online speichern</div>
            <div className="text-[11.5px] text-muted">Nötig für Feed, Ranglisten und Challenges</div>
          </div>
          <Toggle
            checked={sync}
            onChange={(v) => {
              setSync(v);
              setSyncEnabled(v);
              if (v) void flushOutbox();
            }}
            label="Workouts online speichern"
          />
        </div>
        <div className="flex items-center justify-between gap-3 px-4 py-3.5">
          <div>
            <div className="text-[14px] font-semibold">Warteschlange</div>
            <div className="text-[11.5px] text-muted">{pending ? `${pending} Einträge warten auf Übertragung` : 'Alles übertragen'}</div>
          </div>
          <Button size="sm" onClick={() => void flushOutbox().then((r) => toast(`${r.sent} übertragen${r.failed ? `, ${r.failed} fehlgeschlagen` : ''}`, r.failed ? 'warn' : 'success'))}>
            Jetzt senden
          </Button>
        </div>
        <div className="flex items-center justify-between gap-3 px-4 py-3.5">
          <div>
            <div className="text-[14px] font-semibold">Gesamten Verlauf hochladen</div>
            <div className="text-[11.5px] text-muted">Alle bisherigen Workouts erneut übertragen</div>
          </div>
          <Button size="sm" icon={<CloudUpload size={15} />} onClick={async () => toast(`${await enqueueAllWorkouts()} Workouts in der Warteschlange`, 'info')}>
            Hochladen
          </Button>
        </div>
      </section>

      <SectionTitle>Konto</SectionTitle>
      <section className="card divide-y divide-line/50">
        <form
          className="flex items-center gap-2 px-4 py-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (pw.length < 6) return toast('Mindestens 6 Zeichen', 'error');
            await updatePassword(pw).then(() => (toast('Passwort geändert', 'success'), setPw('')), (err) => toast(err.message, 'error'));
          }}
        >
          <input type="password" autoComplete="new-password" className="field flex-1 py-2" placeholder="Neues Passwort" value={pw} onChange={(e) => setPw(e.target.value)} aria-label="Neues Passwort" />
          <Button size="sm" type="submit">
            Ändern
          </Button>
        </form>
        <button
          onClick={async () => {
            await signOut();
            refreshSocial();
            nav('/social');
          }}
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-[14px] font-semibold hover:bg-elevated/50"
        >
          <LogOut size={18} className="text-muted" /> Abmelden
        </button>
      </section>

      <SectionTitle>Datenschutz</SectionTitle>
      <section className="card p-3.5">
        <p className="flex gap-2 text-[12.5px] leading-relaxed text-muted">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-good" />
          Online gespeichert werden nur: dein Profil (Benutzername, Anzeigename, Farbe), Freundschaften, Workout-Zusammenfassungen ohne Notizen und ohne einzelne Sätze, Challenge-/Duell-Ergebnisse
          und Reaktionen. Sichtbar sind sie nur für dich und bestätigte Freunde. Deine E-Mail-Adresse ist für niemanden sichtbar.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <Button
            variant="danger"
            icon={<Trash2 size={16} />}
            onClick={async () => {
              if (await confirm({ title: 'Alle Online-Daten löschen?', text: 'Profil, Freundschaften, Workouts, Challenges und Duelle werden vom Server gelöscht. Dein Login bleibt bestehen, die Daten auf diesem Gerät bleiben erhalten.', confirmLabel: 'Online-Daten löschen', danger: true, skippable: false })) {
                await deleteMySocialData().then(() => (toast('Online-Daten gelöscht', 'info'), refreshSocial()), (e) => toast(e.message, 'error'));
              }
            }}
          >
            Online-Daten löschen
          </Button>
          <Button
            variant="danger"
            icon={<Trash2 size={16} />}
            onClick={async () => {
              if (await confirm({ title: 'Konto endgültig löschen?', text: 'Dein Online-Konto und alle Online-Daten werden unwiderruflich gelöscht. Deine Trainingsdaten auf diesem Gerät bleiben erhalten.', confirmLabel: 'Konto löschen', danger: true, skippable: false })) {
                try {
                  await deleteMyAccount();
                  await signOut();
                  toast('Konto gelöscht', 'info');
                  refreshSocial();
                  nav('/social');
                } catch (e) {
                  toast((e as Error).message, 'error');
                }
              }
            }}
          >
            Konto löschen
          </Button>
        </div>
      </section>

      <SectionTitle>Server</SectionTitle>
      <section className="card flex items-center gap-3 p-3.5">
        <Server size={18} className="shrink-0 text-muted" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium">{cfg?.url}</div>
          <div className="text-[11.5px] text-muted">{cfg?.source === 'build' ? 'In der App hinterlegt' : 'Manuell verbunden'}</div>
        </div>
        {cfg?.source === 'app' && (
          <Button
            size="sm"
            onClick={async () => {
              if (await confirm({ title: 'Server trennen?', text: 'Du wirst abgemeldet. Online-Daten bleiben auf dem Server.', confirmLabel: 'Trennen', danger: true })) {
                await signOut();
                clearConfig();
                resetClient();
                refreshSocial();
                nav('/social');
              }
            }}
          >
            Trennen
          </Button>
        )}
      </section>
    </div>
  );
}
