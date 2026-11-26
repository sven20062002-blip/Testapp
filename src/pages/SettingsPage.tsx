import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Compass, Database, HeartPulse, Download, FileJson, FileSpreadsheet, Info, Moon, RotateCcw, Smartphone, Timer, Trash2, Upload, User } from 'lucide-react';
import { updateSettings } from '@/db/repo/settings';
import { downloadText, exportCSV, exportJSON, exportNutritionCSV, importJSON, wipeAllData } from '@/db/repo/backup';
import { restoreStandardExercises } from '@/db/init';
import { restartOnboarding } from '@/onboarding/model';
import { restartTour } from '@/tour/state';
import { useSettings } from '@/hooks/useData';
import { PageHeader } from '@/components/ui/PageHeader';
import { Segmented } from '@/components/ui/Segmented';
import { Toggle } from '@/components/ui/Toggle';
import { Button } from '@/components/ui/Button';
import { useFeedback } from '@/components/ui/Feedback';
import { REST_PRESETS } from '@/components/workout/TimerPanel';
import { formatClock } from '@/lib/time';
import { notificationsSupported, playRestDone, requestNotifications, unlockAudio } from '@/services/feedback';

export default function SettingsPage() {
  const s = useSettings();
  const nav = useNavigate();
  const { toast, confirm } = useFeedback();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(s.userName);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<string>('');
  const [notif, setNotif] = useState<string>(notificationsSupported() ? Notification.permission : 'unsupported');
  const install = useInstallPrompt();

  useEffect(() => {
    setName(s.userName);
  }, [s.userName]);
  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
    navigator.storage?.estimate?.().then((e) => e.usage != null && setUsage(`${(e.usage / 1024 / 1024).toFixed(1)} MB belegt`));
  }, []);

  const stamp = new Date().toISOString().slice(0, 10);

  return (
    <div className="page">
      <PageHeader title="Einstellungen" />

      <Group title="Profil" icon={<User size={16} />}>
        <Row label="Dein Name" hint="Für die Begrüßung">
          <input
            className="field w-40 py-2 text-right"
            value={name}
            maxLength={24}
            placeholder="optional"
            onChange={(e) => setName(e.target.value)}
            onBlur={() => updateSettings({ userName: name.trim() })}
            aria-label="Name"
          />
        </Row>
        <Row label="Wochenziel" hint="Workouts pro Woche">
          <Stepper value={s.weeklyGoal} min={1} max={14} onChange={(v) => updateSettings({ weeklyGoal: v })} />
        </Row>
        <Row label="App-Tour" hint="Kurze Erklärung aller Bereiche">
          <Button
            size="sm"
            icon={<Compass size={15} />}
            onClick={async () => {
              await restartTour();
              nav('/');
            }}
          >
            Tour starten
          </Button>
        </Row>
        <Row label="Einrichtung erneut durchlaufen" hint="Körperdaten, Ziel & Training neu angeben">
          <Button size="sm" icon={<RotateCcw size={15} />} onClick={() => void restartOnboarding()}>
            Starten
          </Button>
        </Row>
      </Group>

      <Group title="Gesundheit & Ernährung" icon={<HeartPulse size={16} />}>
        <Row label="Datenquellen & Datenschutz" hint="Apple Health, Berechtigungen, Löschen">
          <Button size="sm" onClick={() => nav('/health/sources')}>
            Öffnen
          </Button>
        </Row>
        <Row label="Ernährungsprofil & Ziele" hint="Kalorienbedarf, Makros und Schrittziel">
          <Button size="sm" onClick={() => nav('/nutrition/profile')}>
            Öffnen
          </Button>
        </Row>
      </Group>

      <Group title="Darstellung" icon={<Moon size={16} />}>
        <Row label="Design">
          <Segmented
            value={s.theme}
            onChange={(v) => updateSettings({ theme: v })}
            options={[
              { value: 'dark', label: 'Dunkel' },
              { value: 'light', label: 'Hell' },
              { value: 'system', label: 'System' },
            ]}
            size="sm"
            label="Design"
          />
        </Row>
        <Row label="Gewichtseinheit" hint="Daten werden intern in kg gespeichert">
          <Segmented
            value={s.unit}
            onChange={(v) => updateSettings({ unit: v })}
            options={[
              { value: 'kg', label: 'kg' },
              { value: 'lb', label: 'lb' },
            ]}
            size="sm"
            label="Einheit"
          />
        </Row>
        <Row label="Übungsnamen">
          <Segmented
            value={s.exerciseLang}
            onChange={(v) => updateSettings({ exerciseLang: v })}
            options={[
              { value: 'de', label: 'Deutsch' },
              { value: 'en', label: 'English' },
            ]}
            size="sm"
            label="Sprache der Übungsnamen"
          />
        </Row>
      </Group>

      <Group title="Training & Timer" icon={<Timer size={16} />}>
        <Row label="Standard-Pausenzeit">
          <select
            className="field w-32 py-2"
            value={REST_PRESETS.includes(s.defaultRestSec) ? s.defaultRestSec : 'custom'}
            onChange={(e) => e.target.value !== 'custom' && updateSettings({ defaultRestSec: Number(e.target.value) })}
            aria-label="Standard-Pausenzeit"
          >
            {REST_PRESETS.map((p) => (
              <option key={p} value={p}>
                {formatClock(p * 1000)} min
              </option>
            ))}
            {!REST_PRESETS.includes(s.defaultRestSec) && <option value="custom">{formatClock(s.defaultRestSec * 1000)} min</option>}
          </select>
        </Row>
        <Row label="Eigene Pausenzeit" hint="in Sekunden">
          <Stepper value={s.defaultRestSec} min={10} max={900} step={15} onChange={(v) => updateSettings({ defaultRestSec: v })} />
        </Row>
        <ToggleRow label="Pause automatisch starten" hint="Nach jedem abgeschlossenen Satz" checked={s.autoRest} onChange={(v) => updateSettings({ autoRest: v })} />
        <ToggleRow
          label="Satz-Timer automatisch starten"
          hint="Wenn die Pause abgelaufen ist"
          checked={s.autoStartSetTimer}
          onChange={(v) => updateSettings({ autoStartSetTimer: v })}
        />
        <ToggleRow label="Bildschirm aktiv halten" hint="Während eines Workouts (falls unterstützt)" checked={s.keepAwake} onChange={(v) => updateSettings({ keepAwake: v })} />
      </Group>

      <Group title="Signale & Hinweise" icon={<Bell size={16} />}>
        <ToggleRow
          label="Akustisches Signal"
          hint="Ton am Ende der Pause"
          checked={s.sound}
          onChange={(v) => {
            void updateSettings({ sound: v });
            if (v) {
              unlockAudio();
              playRestDone();
            }
          }}
        />
        <ToggleRow label="Vibration" hint="Auf Android-Geräten" checked={s.vibration} onChange={(v) => updateSettings({ vibration: v })} />
        <ToggleRow label="Rekord-Benachrichtigungen" hint="Bei neuen Bestleistungen" checked={s.prAlerts} onChange={(v) => updateSettings({ prAlerts: v })} />
        <ToggleRow label="Vor dem Löschen bestätigen" checked={s.confirmDeletes} onChange={(v) => updateSettings({ confirmDeletes: v })} />
        <Row label="System-Benachrichtigungen" hint={notif === 'unsupported' ? 'Auf diesem Gerät nicht verfügbar (iOS: nur als installierte App)' : 'Pausenende, wenn die App im Hintergrund ist'}>
          {notif === 'granted' ? (
            <span className="text-[12.5px] font-semibold text-good">Aktiv</span>
          ) : notif === 'denied' ? (
            <span className="text-[12.5px] text-subtle">Blockiert</span>
          ) : notif === 'unsupported' ? (
            <span className="text-[12.5px] text-subtle">–</span>
          ) : (
            <Button size="sm" onClick={async () => setNotif(await requestNotifications())}>
              Erlauben
            </Button>
          )}
        </Row>
      </Group>

      <Group title="Daten" icon={<Database size={16} />}>
        <div className="px-3.5 py-2.5">
          <div className="text-[13.5px] font-semibold">Exportieren</div>
          <div className="text-[11.5px] text-muted">JSON-Backup (ohne Zugangsdaten) oder Tabellen für Excel</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Button size="sm" icon={<FileJson size={15} />} onClick={async () => downloadText(`forge-backup-${stamp}.json`, await exportJSON(), 'application/json')}>
              Backup (JSON)
            </Button>
            <Button size="sm" icon={<FileSpreadsheet size={15} />} onClick={async () => downloadText(`forge-saetze-${stamp}.csv`, await exportCSV(), 'text/csv;charset=utf-8')}>
              Sätze (CSV)
            </Button>
            <Button size="sm" icon={<FileSpreadsheet size={15} />} onClick={async () => downloadText(`forge-ernaehrung-${stamp}.csv`, await exportNutritionCSV(), 'text/csv;charset=utf-8')}>
              Ernährung (CSV)
            </Button>
          </div>
        </div>
        <Row label="Backup wiederherstellen" hint="Ersetzt alle Daten (außer laufendem Workout)">
          <Button size="sm" icon={<Upload size={15} />} onClick={() => fileRef.current?.click()}>
            Import
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              if (!(await confirm({ title: 'Backup importieren?', text: 'Alle aktuellen Übungen, Pläne und Workouts werden durch das Backup ersetzt.', confirmLabel: 'Importieren', danger: true, skippable: false })))
                return;
              try {
                const r = await importJSON(await f.text());
                toast(`${r.workouts} Workouts importiert`, 'success');
              } catch (err) {
                toast((err as Error).message, 'error');
              }
            }}
          />
        </Row>
        <Row label="Standardübungen wiederherstellen" hint="Gelöschte Startübungen zurückholen">
          <Button
            size="sm"
            icon={<RotateCcw size={15} />}
            onClick={async () => {
              const n = await restoreStandardExercises();
              toast(n ? `${n} Übungen wiederhergestellt` : 'Alle Standardübungen sind vorhanden', 'success');
            }}
          >
            Wiederherstellen
          </Button>
        </Row>
        <Row label="Speicher" hint={usage || 'Lokal auf diesem Gerät (IndexedDB)'}>
          <span className={`text-[12.5px] font-semibold ${persisted ? 'text-good' : 'text-subtle'}`}>{persisted ? 'Dauerhaft' : persisted === false ? 'Standard' : '–'}</span>
        </Row>
        <Row label="Alle Daten löschen" hint="Kann nicht rückgängig gemacht werden">
          <Button
            size="sm"
            variant="danger"
            icon={<Trash2 size={15} />}
            onClick={async () => {
              if (await confirm({ title: 'Wirklich alle Daten löschen?', text: 'Alle Workouts, Pläne, Übungen und Einstellungen werden unwiderruflich gelöscht. Exportiere vorher ein Backup.', confirmLabel: 'Alles löschen', danger: true, skippable: false }))
                await wipeAllData();
            }}
          >
            Löschen
          </Button>
        </Row>
      </Group>

      <Group title="App" icon={<Smartphone size={16} />}>
        {install.canInstall && (
          <Row label="Als App installieren" hint="Startbildschirm, Vollbild, offline">
            <Button size="sm" variant="primary" icon={<Download size={15} />} onClick={install.prompt}>
              Installieren
            </Button>
          </Row>
        )}
        {install.isIOS && !install.standalone && (
          <div className="px-4 py-3 text-[12.5px] text-muted">
            <b className="text-fg">iPhone/iPad:</b> In Safari auf „Teilen“ tippen und „Zum Home-Bildschirm“ wählen, um Forge als App zu installieren.
          </div>
        )}
        <Row label="Version" hint={install.standalone ? 'Läuft als installierte App' : 'Läuft im Browser'}>
          <span className="num text-[12.5px] text-subtle">1.0.0</span>
        </Row>
        <div className="flex gap-2 px-4 py-3 text-[11.5px] leading-relaxed text-subtle">
          <Info size={14} className="mt-0.5 shrink-0" />
          <span>
            Alle Daten bleiben lokal auf deinem Gerät und funktionieren vollständig offline. Timer basieren auf Zeitstempeln und laufen auch korrekt weiter, wenn das Betriebssystem die App im
            Hintergrund pausiert. Auf iOS können Töne im Hintergrund nicht abgespielt werden – das Pausenende wird beim Zurückkehren angezeigt.
          </span>
        </div>
      </Group>
    </div>
  );
}

function Group({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-5">
      <h2 className="label mb-2 flex items-center gap-1.5 px-1">
        {icon}
        {title}
      </h2>
      <div className="card divide-y divide-line/60">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[52px] items-center justify-between gap-4 px-3.5 py-2.5">
      <div className="min-w-0">
        <div className="text-[13.5px] font-semibold">{label}</div>
        {hint && <div className="text-[11.5px] text-muted">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function ToggleRow({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <Row label={label} hint={hint}>
      <Toggle checked={checked} onChange={onChange} label={label} />
    </Row>
  );
}

function Stepper({ value, min, max, step = 1, onChange }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center rounded-xl bg-elevated">
      <button className="h-9 w-9 text-[16.5px] font-bold text-muted hover:text-fg" aria-label="Verringern" onClick={() => onChange(Math.max(min, value - step))}>
        −
      </button>
      <span className="num min-w-[2.5rem] text-center text-[13px] font-bold">{value}</span>
      <button className="h-9 w-9 text-[16.5px] font-bold text-muted hover:text-fg" aria-label="Erhöhen" onClick={() => onChange(Math.min(max, value + step))}>
        +
      </button>
    </div>
  );
}

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

function useInstallPrompt() {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  useEffect(() => {
    const h = (e: Event) => {
      e.preventDefault();
      setEvt(e as BIPEvent);
    };
    window.addEventListener('beforeinstallprompt', h);
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return {
    canInstall: !!evt && !standalone,
    standalone,
    isIOS,
    prompt: async () => {
      if (!evt) return;
      await evt.prompt();
      setEvt(null);
    },
  };
}
