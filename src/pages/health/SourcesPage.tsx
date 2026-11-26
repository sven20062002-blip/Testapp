import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, ChevronDown, FileArchive, Link2, Loader2, RefreshCw, ShieldCheck, Smartphone, Trash2, Unplug, Watch } from 'lucide-react';
import type { HealthCategory, HealthSourceId, HealthSourceState } from '@/db/types';
import { useProfile, useSources } from '@/hooks/useHealth';
import { ALL_CATEGORIES, defaultSourceState, deleteSourceData, disconnectSource, getSource, updateProfile, updateSource } from '@/health/repo';
import { CATEGORY_META, SOURCE_META } from '@/health/meta';
import { connectBridge, connectGoogle, importAppleExport, syncSource } from '@/health/sync';
import { revokeToken } from '@/health/google';
import { getBridge } from '@/health/bridge';
import { relativeDay } from '@/lib/time';
import { addDays, dayKey } from '@/lib/day';
import { PageHeader, SectionTitle } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { Badge } from '@/components/ui/Chip';
import { Sheet } from '@/components/ui/Sheet';
import { Segmented } from '@/components/ui/Segmented';
import { useFeedback } from '@/components/ui/Feedback';
import { ProgressBar } from '@/components/health/ProgressBar';

export default function SourcesPage() {
  const sources = useSources();
  const profile = useProfile();
  const get = (id: HealthSourceId): HealthSourceState => ({ ...defaultSourceState(id), ...(sources?.find((s) => s.id === id) ?? {}) });
  if (!sources) return <div className="page" />;

  const move = (i: number, dir: -1 | 1) => {
    const p = [...profile.sourcePriority];
    const j = i + dir;
    if (j < 0 || j >= p.length) return;
    [p[i], p[j]] = [p[j], p[i]];
    void updateProfile({ sourcePriority: p });
  };

  return (
    <div className="page">
      <PageHeader back title="Datenquellen & Datenschutz" subtitle="Verbindungen, Berechtigungen und importierte Daten" />

      <div className="card mb-5 flex gap-3 p-4 text-[13px] leading-relaxed text-muted">
        <ShieldCheck size={20} className="mt-0.5 shrink-0 text-good" />
        <div>
          Gesundheitsdaten werden <b className="text-fg">nur nach deiner ausdrücklichen Zustimmung</b> und nur für die freigegebenen Kategorien importiert. Sie werden ausschließlich lokal auf diesem Gerät
          gespeichert (IndexedDB) und an keinen Forge-Server übertragen – es gibt keinen. Du kannst Verbindungen jederzeit trennen und importierte Daten löschen.
        </div>
      </div>

      <GoogleCard s={get('google')} />
      <AppleCard s={get('apple')} />
      <BridgeCard s={get('bridge')} />
      <ManualCard />

      <SectionTitle>Quellen-Priorität</SectionTitle>
      <div className="card p-2">
        <p className="px-2 pb-2 pt-1 text-[12px] text-muted">
          Liefern mehrere Quellen denselben Wert für denselben Tag (z. B. Schritte), wird nur die oberste verwendet – Werte werden nie addiert. So gibt es keine Doppelzählungen.
        </p>
        {profile.sourcePriority.map((id, i) => (
          <div key={id} className="flex items-center gap-2 rounded-xl px-2 py-2">
            <span className="num w-5 text-center text-[13px] font-bold text-subtle">{i + 1}</span>
            <span className="flex-1 text-[14px] font-semibold">{SOURCE_META[id].label}</span>
            <button aria-label="Nach oben" disabled={i === 0} onClick={() => move(i, -1)} className="flex h-9 w-9 items-center justify-center rounded-lg bg-elevated disabled:opacity-30">
              <ArrowUp size={15} />
            </button>
            <button aria-label="Nach unten" disabled={i === profile.sourcePriority.length - 1} onClick={() => move(i, 1)} className="flex h-9 w-9 items-center justify-center rounded-lg bg-elevated disabled:opacity-30">
              <ArrowDown size={15} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function StatusLine({ s }: { s: HealthSourceState }) {
  return (
    <div className="mt-2 space-y-1 text-[12px]">
      <div className="flex flex-wrap items-center gap-2 text-muted">
        {s.lastStatus === 'syncing' && (
          <span className="flex items-center gap-1 text-fg">
            <Loader2 size={12} className="animate-spin" /> Synchronisiert …
          </span>
        )}
        {s.lastStatus === 'ok' && (
          <span className="flex items-center gap-1 text-good">
            <CheckCircle2 size={12} /> OK
          </span>
        )}
        {s.lastStatus === 'error' && (
          <span className="flex items-center gap-1 text-bad">
            <AlertTriangle size={12} /> Fehler
          </span>
        )}
        <span>Letzte Synchronisierung: {s.lastSyncAt ? `${relativeDay(s.lastSyncAt)}, ${new Date(s.lastSyncAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : 'noch nie'}</span>
      </div>
      {s.lastSummary && <div className="text-subtle">{s.lastSummary}</div>}
      {s.lastError && <pre className="whitespace-pre-wrap rounded-lg bg-bad/10 p-2 font-sans text-[12px] text-bad">{s.lastError}</pre>}
    </div>
  );
}

function CategoryToggles({ value, onChange, disabled }: { value: Record<HealthCategory, boolean>; onChange: (v: Record<HealthCategory, boolean>) => void; disabled?: boolean }) {
  return (
    <div className="divide-y divide-line/60 rounded-xl bg-elevated/50">
      {ALL_CATEGORIES.map((c) => (
        <div key={c} className={clsx('flex items-center justify-between gap-3 px-3 py-2.5', disabled && 'opacity-50')}>
          <div>
            <div className="text-[14px] font-semibold">{CATEGORY_META[c].label}</div>
            <div className="text-[11px] text-muted">{CATEGORY_META[c].hint}</div>
          </div>
          <Toggle checked={value[c]} onChange={(v) => !disabled && onChange({ ...value, [c]: v })} label={CATEGORY_META[c].label} />
        </div>
      ))}
    </div>
  );
}

function DataActions({ s }: { s: HealthSourceState }) {
  const { confirm, toast } = useFeedback();
  const [cat, setCat] = useState<HealthCategory | 'all'>('all');
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <select className="field w-auto flex-1 py-2 text-[13px]" value={cat} onChange={(e) => setCat(e.target.value as HealthCategory | 'all')} aria-label="Kategorie zum Löschen">
        <option value="all">Alle importierten Daten</option>
        {ALL_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            Nur {CATEGORY_META[c].label}
          </option>
        ))}
      </select>
      <Button
        size="sm"
        variant="danger"
        icon={<Trash2 size={14} />}
        onClick={async () => {
          if (!(await confirm({ title: 'Importierte Daten löschen?', text: `${SOURCE_META[s.id].label}: ${cat === 'all' ? 'alle Kategorien' : CATEGORY_META[cat].label}. Das betrifft nur Daten dieser Quelle auf diesem Gerät.`, confirmLabel: 'Löschen', danger: true, skippable: false })))
            return;
          const n = await deleteSourceData(s.id, cat === 'all' ? undefined : [cat]);
          toast(`${n} Einträge gelöscht`, 'info');
        }}
      >
        Löschen
      </Button>
    </div>
  );
}

function Card({ icon, title, badge, children }: { icon: React.ReactNode; title: string; badge?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card mb-4 p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-elevated">{icon}</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[16px] font-bold leading-tight">{title}</h2>
          {badge}
        </div>
      </div>
      {children}
    </section>
  );
}

function Collapsible({ title, children, open: initial = false }: { title: string; children: React.ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(initial);
  return (
    <div className="mt-3 rounded-xl border border-line/70">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-3 py-2.5 text-left text-[13px] font-semibold" aria-expanded={open}>
        {title}
        <ChevronDown size={16} className={clsx('transition', open && 'rotate-180')} />
      </button>
      {open && <div className="px-3 pb-3 text-[13px] leading-relaxed text-muted">{children}</div>}
    </div>
  );
}

/* ---------------- Google Health (Fitbit) ---------------- */

function GoogleCard({ s }: { s: HealthSourceState }) {
  const { toast } = useFeedback();
  const [clientId, setClientId] = useState(s.clientId ?? '');
  const [cats, setCats] = useState<Record<HealthCategory, boolean>>({ activity: true, body: true });
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [diag, setDiag] = useState(false);
  const [disc, setDisc] = useState(false);
  const disconnect = async (del: boolean) => {
    setDisc(false);
    const cur = await getSource('google');
    if (cur.accessToken) revokeToken(cur.accessToken);
    await disconnectSource('google', del);
    toast(del ? 'Getrennt und Daten gelöscht' : 'Getrennt – importierte Daten bleiben erhalten', 'info');
  };
  useEffect(() => setClientId(s.clientId ?? ''), [s.clientId]);
  useEffect(() => {
    if (s.connected) setCats(s.categories);
  }, [s.connected, s.categories]);
  const tokenValid = !!s.accessToken && (s.tokenExpiresAt ?? 0) > Date.now();
  const origin = typeof location !== 'undefined' ? location.origin : '';

  const connect = async () => {
    setBusy(true);
    try {
      await connectGoogle(clientId, ALL_CATEGORIES.filter((c) => cats[c]));
      setConsent(false);
      toast('Mit Google Health verbunden – erste Synchronisierung läuft', 'success');
      await syncSource('google', true).then((r) => toast(`Synchronisiert: ${r}`, 'success'));
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      icon={<Watch size={20} />}
      title="Fitbit / Fitbit Air via Google Health"
      badge={s.connected ? <Badge tone="good">Verbunden</Badge> : <Badge>Nicht verbunden</Badge>}
    >
      <Collapsible title="Kompatibilität mit deinem Fitbit-Gerät">
        <p>
          Die Fitbit Air (Google, 2026) und andere Fitbit-Geräte synchronisieren in die <b>Google-Health-App</b> (vormals Fitbit-App). Die frühere Fitbit Web API wurde von Google 2026 abgeschaltet;
          der offizielle Nachfolger ist die <b>Google Health API</b>. Forge liest deine Daten darüber direkt aus deinem Google-Konto – auch auf dem iPhone, da es eine Web-Schnittstelle ist.
        </p>
        <p className="mt-2">
          Forge übernimmt: Schritte, Distanz, Etagen, aktive Minuten, Energie sowie Gewicht/Körperfett (wenn in Google Health erfasst). Was dein Gerät nicht misst, bleibt leer – es wird
          nichts geschätzt.
        </p>
      </Collapsible>

      {!s.connected ? (
        <>
          <Collapsible title="Einrichtung (einmalig, ca. 10 Minuten)" open={!s.clientId}>
            <ol className="list-decimal space-y-1.5 pl-4">
              <li>
                In der <b>Google Cloud Console</b> (console.cloud.google.com) ein Projekt anlegen.
              </li>
              <li>
                Unter „APIs &amp; Dienste“ die <b>Google Health API</b> aktivieren.
              </li>
              <li>
                OAuth-Zustimmungsbildschirm konfigurieren: Typ „Extern“, Status „Testing“ und dein eigenes Google-Konto als <b>Testnutzer</b> hinzufügen. Für die private Nutzung ist keine Prüfung durch
                Google nötig.
              </li>
              <li>
                Anmeldedaten → „OAuth-Client-ID“ → Typ <b>Webanwendung</b>. Als „Autorisierte JavaScript-Quelle“ eintragen: <code className="rounded bg-elevated px-1 text-fg">{origin}</code>
              </li>
              <li>Die Client-ID (endet auf „.apps.googleusercontent.com“) unten einfügen. Sie ist nicht geheim; ein Client-Secret wird nicht benötigt.</li>
            </ol>
          </Collapsible>
          <label className="label mb-1.5 mt-4 block" htmlFor="g-client">
            OAuth-Client-ID
          </label>
          <input id="g-client" className="field text-[13px]" placeholder="1234…apps.googleusercontent.com" value={clientId} onChange={(e) => setClientId(e.target.value.trim())} autoComplete="off" />
          <Button variant="primary" block size="lg" className="mt-3" disabled={!clientId} onClick={() => setConsent(true)} icon={<Link2 size={17} />}>
            Verbinden …
          </Button>
        </>
      ) : (
        <>
          <StatusLine s={s} />
          <div className="mt-3">
            <CategoryToggles
              value={s.categories}
              onChange={async (v) => {
                const added = ALL_CATEGORIES.filter((c) => v[c] && !s.categories[c]);
                if (added.length) {
                  // new scope needs a new consent
                  setCats(v);
                  setConsent(true);
                } else await updateSource('google', { categories: v });
              }}
            />
          </div>
          {!tokenValid && <p className="mt-2 text-[12px] text-warn">Die Anmeldung ist abgelaufen (Google-Tokens gelten ca. 1 Stunde). Tippe auf „Jetzt synchronisieren“, um dich kurz erneut zu bestätigen.</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="primary"
              disabled={busy || s.lastStatus === 'syncing'}
              icon={<RefreshCw size={15} className={busy ? 'animate-spin' : ''} />}
              onClick={async () => {
                setBusy(true);
                try {
                  toast(`Synchronisiert: ${await syncSource('google', true)}`, 'success');
                } catch (e) {
                  toast((e as Error).message, 'error');
                } finally {
                  setBusy(false);
                }
              }}
            >
              Jetzt synchronisieren
            </Button>
            <Button icon={<Unplug size={15} />} onClick={() => setDisc(true)}>
              Trennen
            </Button>
            <Button size="md" variant="ghost" onClick={() => setDiag(true)}>
              Rohdaten
            </Button>
          </div>
          <DataActions s={s} />
        </>
      )}

      <Sheet
        open={consent}
        onClose={() => setConsent(false)}
        title="Zustimmung zum Datenimport"
        footer={
          <Button variant="primary" size="lg" block disabled={busy || !ALL_CATEGORIES.some((c) => cats[c])} onClick={connect}>
            {busy ? 'Verbinde …' : 'Zustimmen & bei Google anmelden'}
          </Button>
        }
      >
        <p className="text-[14px] text-muted">
          Forge liest folgende Kategorien <b className="text-fg">nur lesend</b> aus deinem Google-Health-Konto. Die Daten gehen direkt von Google auf dieses Gerät und bleiben lokal gespeichert.
        </p>
        <div className="mt-4">
          <CategoryToggles value={cats} onChange={setCats} />
        </div>
        <p className="mt-3 text-[12px] text-subtle">Google zeigt anschließend einen eigenen Berechtigungsdialog, in dem du einzelne Bereiche erneut ablehnen kannst. Nur tatsächlich gewährte Bereiche werden synchronisiert.</p>
      </Sheet>

      <Sheet open={disc} onClose={() => setDisc(false)} title="Google Health trennen?">
        <p className="text-[14px] text-muted">Die Anmeldung wird widerrufen und es werden keine neuen Daten mehr geladen. Was soll mit den bereits importierten Daten passieren?</p>
        <div className="mt-4 flex flex-col gap-2">
          <Button size="lg" onClick={() => disconnect(false)}>
            Trennen, Daten behalten
          </Button>
          <Button size="lg" variant="danger" onClick={() => disconnect(true)}>
            Trennen und Daten löschen
          </Button>
          <Button size="lg" variant="ghost" onClick={() => setDisc(false)}>
            Abbrechen
          </Button>
        </div>
      </Sheet>

      <Sheet open={diag} onClose={() => setDiag(false)} title="Rohdaten der letzten Synchronisierung" size="full" tall>
        <p className="mb-3 text-[12px] text-muted">Zur Kontrolle: die ersten Zeichen jeder API-Antwort, so wie Google sie geliefert hat (nur lokal gespeichert).</p>
        {Object.entries(s.diagnostics ?? {}).map(([k, v]) => (
          <div key={k} className="mb-3">
            <div className="text-[12px] font-bold">{k}</div>
            <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-elevated p-2 text-[11px]">{v}</pre>
          </div>
        ))}
        {!Object.keys(s.diagnostics ?? {}).length && <p className="text-sm text-muted">Noch keine Daten.</p>}
      </Sheet>
    </Card>
  );
}

/* ---------------- Apple Health export ---------------- */

function AppleCard({ s }: { s: HealthSourceState }) {
  const { toast } = useFeedback();
  const [cats, setCats] = useState<Record<HealthCategory, boolean>>(s.consentAt ? s.categories : { activity: true, body: true });
  const [period, setPeriod] = useState<'365' | 'all'>('365');
  const [progress, setProgress] = useState<{ read: number; total: number; records: number } | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const [consent, setConsent] = useState(false);

  const run = async (f: File) => {
    setProgress({ read: 0, total: f.size, records: 0 });
    try {
      const r = await importAppleExport(f, ALL_CATEGORIES.filter((c) => cats[c]), period === 'all' ? null : addDays(dayKey(), -365), setProgress);
      toast(`Import abgeschlossen: ${r.metrics.length} Tageswerte`, 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setProgress(null);
    }
  };

  return (
    <Card icon={<Smartphone size={20} />} title="Apple Health" badge={s.lastSyncAt ? <Badge tone="good">Importiert</Badge> : <Badge>Datei-Import</Badge>}>
      <Collapsible title="Warum ein Datei-Import?">
        Apple HealthKit ist ausschließlich für native iOS-Apps zugänglich – Web-Apps und PWAs haben technisch keinen Zugriff. Der offizielle Weg ohne native App ist der Export aus der Health-App.
        Für eine automatische Synchronisierung braucht es die native App-Hülle (siehe „Native App-Brücke“).
      </Collapsible>
      <Collapsible title="So exportierst du deine Daten">
        <ol className="list-decimal space-y-1 pl-4">
          <li>Health-App öffnen → oben rechts auf dein Profilbild tippen.</li>
          <li>„Alle Gesundheitsdaten exportieren“ wählen und bestätigen (kann einige Minuten dauern).</li>
          <li>„In Dateien sichern“ wählen.</li>
          <li>Hier „Export.zip auswählen“ tippen und die Datei wählen (ZIP oder export.xml).</li>
        </ol>
        <p className="mt-2">Bei erneutem Import werden vorhandene Tage überschrieben, nicht doppelt gespeichert.</p>
      </Collapsible>
      {s.lastSyncAt && <StatusLine s={s} />}
      {progress ? (
        <div className="mt-4">
          <div className="flex justify-between text-[12px] text-muted">
            <span>Lese Export … {progress.records.toLocaleString('de-DE')} Einträge</span>
            <span className="num">{Math.round((progress.read / Math.max(1, progress.total)) * 100)} %</span>
          </div>
          <ProgressBar className="mt-1.5" value={progress.read} max={progress.total} />
        </div>
      ) : (
        <>
          <Button variant="primary" block size="lg" className="mt-3" icon={<FileArchive size={17} />} onClick={() => setConsent(true)}>
            Export.zip auswählen …
          </Button>
          {s.lastSyncAt && <DataActions s={s} />}
        </>
      )}
      <input
        ref={file}
        type="file"
        accept=".zip,.xml,application/zip,text/xml,application/xml"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void run(f);
        }}
      />
      <Sheet
        open={consent}
        onClose={() => setConsent(false)}
        title="Was soll importiert werden?"
        footer={
          <Button
            variant="primary"
            size="lg"
            block
            disabled={!ALL_CATEGORIES.some((c) => cats[c])}
            onClick={() => {
              setConsent(false);
              file.current?.click();
            }}
          >
            Zustimmen & Datei wählen
          </Button>
        }
      >
        <p className="mb-3 text-[14px] text-muted">Die Datei wird nur auf diesem Gerät gelesen. Nicht ausgewählte Kategorien werden übersprungen und nicht gespeichert.</p>
        <CategoryToggles value={cats} onChange={setCats} />
        <div className="mt-4">
          <span className="label mb-2 block">Zeitraum</span>
          <Segmented value={period} onChange={setPeriod} options={[{ value: '365', label: 'Letzte 12 Monate' }, { value: 'all', label: 'Alles' }]} label="Zeitraum" />
        </div>
      </Sheet>
    </Card>
  );
}

/* ---------------- Native bridge ---------------- */

function BridgeCard({ s }: { s: HealthSourceState }) {
  const { toast } = useFeedback();
  const bridge = getBridge();
  const [cats, setCats] = useState<Record<HealthCategory, boolean>>({ activity: true, body: true });
  return (
    <Card
      icon={<Link2 size={20} />}
      title="Health Connect (Android) / HealthKit (iOS)"
      badge={bridge ? <Badge tone="good">Native Brücke erkannt ({bridge.platform})</Badge> : <Badge>Nur in nativer App verfügbar</Badge>}
    >
      <Collapsible title="Technischer Hintergrund">
        Google Health Connect und Apple HealthKit sind Schnittstellen auf dem Gerät, die nur native Apps nutzen dürfen – im Browser bzw. als installierte PWA gibt es keinen Zugriff. Forge enthält
        dafür eine fertige Erweiterungsschnittstelle („ForgeHealthBridge“): Wird die App in eine native Hülle (z. B. Capacitor) verpackt, die diese Schnittstelle bereitstellt, synchronisiert diese
        Quelle automatisch. Benötigte Berechtigungen und der Schnittstellen-Vertrag stehen in docs/NATIVE_BRIDGE.md. Für Fitbit-Daten ist die Brücke nicht nötig – dafür reicht Google Health.
      </Collapsible>
      {bridge ? (
        s.connected ? (
          <>
            <StatusLine s={s} />
            <div className="mt-3 flex gap-2">
              <Button
                variant="primary"
                icon={<RefreshCw size={15} />}
                onClick={async () => {
                  try {
                    toast(`Synchronisiert: ${await syncSource('bridge', true)}`, 'success');
                  } catch (e) {
                    toast((e as Error).message, 'error');
                  }
                }}
              >
                Jetzt synchronisieren
              </Button>
              <Button icon={<Unplug size={15} />} onClick={() => disconnectSource('bridge', false)}>
                Trennen
              </Button>
            </div>
            <DataActions s={s} />
          </>
        ) : (
          <>
            <div className="mt-3">
              <CategoryToggles value={cats} onChange={setCats} />
            </div>
            <Button
              variant="primary"
              block
              className="mt-3"
              onClick={async () => {
                try {
                  await connectBridge(ALL_CATEGORIES.filter((c) => cats[c]));
                  toast('Verbunden', 'success');
                } catch (e) {
                  toast((e as Error).message, 'error');
                }
              }}
            >
              Berechtigungen anfragen & verbinden
            </Button>
          </>
        )
      ) : (
        <p className="mt-3 text-[13px] text-muted">In diesem Browser nicht verfügbar. Nutze Google Health (Fitbit) oder den Apple-Health-Export.</p>
      )}
    </Card>
  );
}

function ManualCard() {
  const { confirm, toast } = useFeedback();
  return (
    <Card icon={<CheckCircle2 size={20} />} title="Manuelle Eingabe" badge={<Badge tone="good">Immer aktiv</Badge>}>
      <p className="mt-3 text-[13px] text-muted">Gewicht, Körperfett, Schritte und aktive Minuten kannst du jederzeit selbst eintragen. Manuelle Werte sind in der App als „manuell“ gekennzeichnet.</p>
      <Button
        size="sm"
        variant="danger"
        className="mt-3"
        icon={<Trash2 size={14} />}
        onClick={async () => {
          if (await confirm({ title: 'Alle manuellen Gesundheitswerte löschen?', confirmLabel: 'Löschen', danger: true, skippable: false })) {
            const n = await deleteSourceData('manual');
            toast(`${n} Einträge gelöscht`, 'info');
          }
        }}
      >
        Manuelle Werte löschen
      </Button>
    </Card>
  );
}
