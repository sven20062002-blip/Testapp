import { useMemo, useState } from 'react';
import { ChevronRight, Footprints, Link2, Plus, RefreshCw, Scale, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useHealthContext, useProfile } from '@/hooks/useHealth';
import { series, valueOn } from '@/health/merge';
import { fmtMetric } from '@/health/meta';
import { updateProfile } from '@/health/repo';
import { addDays, dayKey, dayLabel, dayWeekday, lastNDays, relativeDayKey } from '@/lib/day';
import { startOfWeek } from '@/lib/time';
import { fmtNumber } from '@/lib/units';
import { PageHeader, SectionTitle } from '@/components/ui/PageHeader';
import { Segmented } from '@/components/ui/Segmented';
import { Button } from '@/components/ui/Button';
import { BarTrend } from '@/components/charts/Charts';
import { ProgressBar } from '@/components/health/ProgressBar';
import { SourceBadge } from '@/components/health/SourceBadge';
import { MetricEntrySheet } from '@/components/health/ManualEntry';
import { Kv } from '@/components/health/Kv';
import { useSync } from './useSync';
import { useSources } from '@/hooks/useHealth';
import { relativeDay } from '@/lib/time';
import type { MetricKey } from '@/db/types';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';

export default function ActivityPage() {
  const ctx = useHealthContext(400);
  const profile = useProfile();
  const sources = useSources();
  const sync = useSync();
  const connected = (sources ?? []).filter((x) => x.connected && x.id !== 'manual');
  const canSync = connected.some((x) => x.id === 'bridge');
  const lastSync = connected.reduce<number | null>((m, x) => (x.lastSyncAt && (!m || x.lastSyncAt > m) ? x.lastSyncAt : m), null);
  const [range, setRange] = useState<'7' | '30' | '90'>('30');
  const [metric, setMetric] = useState<MetricKey>('steps');
  const [entry, setEntry] = useState(false);
  const today = dayKey();
  const [hourDay, setHourDay] = useState(today);
  const hourlyRows = useLiveQuery(() => db.healthHourly.where('date').equals(hourDay).toArray(), [hourDay]);
  const hourly = useMemo(() => {
    if (!hourlyRows?.length) return null;
    const rank = (x: string) => {
      const i = profile.sourcePriority.indexOf(x as never);
      return i < 0 ? 99 : i;
    };
    return [...hourlyRows].sort((a, b) => rank(a.source) - rank(b.source))[0];
  }, [hourlyRows, profile.sourcePriority]);

  const d = useMemo(() => {
    if (!ctx.loaded) return null;
    const days = lastNDays(Number(range));
    const vals = series(ctx.merged, metric, days);
    const stepsAll = lastNDays(365).map((k) => ({ k, v: valueOn(ctx.merged, 'steps', k)?.value ?? null }));
    const avg = (n: number) => {
      const xs = stepsAll.slice(-n).map((x) => x.v).filter((x): x is number => x != null);
      return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
    };
    const best = stepsAll.reduce<{ k: string; v: number } | null>((m, x) => (x.v != null && (!m || x.v > m.v) ? { k: x.k, v: x.v } : m), null);
    // week comparison (Mon–Sun) – last 6 weeks
    const weeks: { label: string; avg: number | null; total: number; days: number }[] = [];
    const thisWeek = startOfWeek(Date.now());
    for (let i = 5; i >= 0; i--) {
      const start = dayKey(thisWeek - i * 7 * 86400000 + 3600_000);
      const ks = Array.from({ length: 7 }, (_, j) => addDays(start, j)).filter((k) => k <= today);
      const xs = ks.map((k) => valueOn(ctx.merged, 'steps', k)?.value).filter((x): x is number => x != null);
      weeks.push({ label: `KW ab ${dayLabel(start)}`, avg: xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null, total: xs.reduce((a, b) => a + b, 0), days: xs.length });
    }
    const goalDays = days.filter((k) => (valueOn(ctx.merged, 'steps', k)?.value ?? 0) >= profile.stepGoal).length;
    return {
      chart: days.map((k, i) => ({ label: range === '7' ? dayWeekday(k) : dayLabel(k), value: vals[i] == null ? null : metric === 'distance_m' ? Math.round(vals[i]! / 10) / 100 : Math.round(vals[i]!) })),
      avg7: avg(7),
      avg30: avg(30),
      best,
      weeks,
      goalDays,
    };
  }, [ctx, range, metric, profile.stepGoal, today]);
  if (!ctx.loaded || !d) return <div className="page" />;

  const v = (m: MetricKey) => valueOn(ctx.merged, m, today);
  const steps = v('steps')?.value ?? 0;
  const remaining = Math.max(0, profile.stepGoal - steps);

  return (
    <div className="page">
      <PageHeader
        title="Aktivität"
        subtitle={lastSync ? `Synchronisiert ${relativeDay(lastSync).toLowerCase()}, ${new Date(lastSync).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : 'Schritte, Bewegung & Energie'}
        actions={
          <>
            {canSync && (
              <Button size="sm" onClick={sync.run} disabled={sync.busy} icon={<RefreshCw size={15} className={sync.busy ? 'animate-spin' : ''} />}>
                Sync
              </Button>
            )}
            <Button size="sm" onClick={() => setEntry(true)} icon={<Plus size={15} />}>
              Eintragen
            </Button>
          </>
        }
      />

      {!connected.length && (
        <Link to="/health/sources" className="card mb-4 flex items-center gap-3 border-accent/40 p-3.5">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-fg">
            <Link2 size={20} />
          </span>
          <div className="flex-1">
            <div className="font-bold">Datenquelle verbinden</div>
            <div className="text-[12.5px] text-muted">Apple-Health-Export oder manuelle Eingabe</div>
          </div>
          <ChevronRight className="text-subtle" />
        </Link>
      )}

      <div className="card p-4">
        <div className="flex items-center gap-2 text-muted">
          <Footprints size={16} />
          <span className="label">Schritte heute</span>
        </div>
        <div className="num mt-2 text-[28px] font-bold leading-none tracking-tight">
          {v('steps') ? fmtNumber(steps) : '–'}
          <span className="text-[16.5px] font-semibold text-subtle"> / {fmtNumber(profile.stepGoal)}</span>
        </div>
        <ProgressBar className="mt-3 h-3" value={steps} max={profile.stepGoal} area="move" tone={steps >= profile.stepGoal ? 'good' : undefined} />
        <div className="mt-2 flex justify-between text-[11.5px] text-muted">
          <span>{remaining > 0 ? `Noch ${fmtNumber(remaining)} Schritte` : 'Tagesziel erreicht 🎉'}</span>
          {v('steps') && <SourceBadge m={v('steps')} />}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          <Kv k="Distanz" v={fmtMetric('distance_m', v('distance_m')?.value)} />
          <Kv k="Aktive Minuten" v={fmtMetric('active_min', v('active_min')?.value)} />
          <Kv k="Etagen" v={fmtMetric('floors', v('floors')?.value)} />
          <Kv k="Aktiv-kcal" v={fmtMetric('active_kcal', v('active_kcal')?.value)} />
          <Kv k="Ruhe-kcal" v={fmtMetric('basal_kcal', v('basal_kcal')?.value)} />
          <Kv k="Gesamt-kcal" v={fmtMetric('total_kcal', v('total_kcal')?.value)} />
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-subtle">
          Gesamt = Ruhe + Aktivität – die Werte werden nie zusätzlich addiert. „–“ = von deiner Quelle nicht geliefert.
        </p>
      </div>

      <SectionTitle
        action={
          <Segmented
            size="sm"
            value={hourDay === today ? 'today' : 'yesterday'}
            onChange={(x) => setHourDay(x === 'today' ? today : addDays(today, -1))}
            options={[
              { value: 'today', label: 'Heute' },
              { value: 'yesterday', label: 'Gestern' },
            ]}
            label="Tag"
          />
        }
      >
        Aktivität im Tagesverlauf
      </SectionTitle>
      <div className="card p-3.5">
        {hourly ? (
          <>
            <BarTrend color="move" data={hourly.steps.map((v, h) => ({ label: `${h}`, value: v }))} fmt={(x) => `${fmtNumber(x)} Schritte`} height={150} />
            <p className="mt-1 text-[10.5px] text-subtle">Schritte pro Stunde · <SourceBadge source={hourly.source} /></p>
          </>
        ) : (
          <p className="py-6 text-center text-[12.5px] text-muted">Kein stündlicher Verlauf verfügbar (wird vom Apple-Health-Import geliefert).</p>
        )}
      </div>

      <SectionTitle>Schrittziel</SectionTitle>
      <div className="card flex items-center justify-between p-3.5">
        <span className="text-[14px] font-semibold">Schritte pro Tag</span>
        <div className="flex items-center rounded-xl bg-elevated">
          <button className="h-9 w-9 text-[16.5px] font-bold text-muted" aria-label="Weniger" onClick={() => updateProfile({ stepGoal: Math.max(1000, profile.stepGoal - 500) })}>
            −
          </button>
          <span className="num min-w-[4.5rem] text-center text-[13px] font-bold">{fmtNumber(profile.stepGoal)}</span>
          <button className="h-9 w-9 text-[16.5px] font-bold text-muted" aria-label="Mehr" onClick={() => updateProfile({ stepGoal: Math.min(50000, profile.stepGoal + 500) })}>
            +
          </button>
        </div>
      </div>

      <SectionTitle>Statistik</SectionTitle>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Kv k="Ø 7 Tage" v={d.avg7 != null ? fmtNumber(d.avg7) : '–'} />
        <Kv k="Ø 30 Tage" v={d.avg30 != null ? fmtNumber(d.avg30) : '–'} />
        <Kv k={`Ziel erreicht (${range} T)`} v={`${d.goalDays} Tage`} />
        <Kv k="Bester Tag" v={d.best ? fmtNumber(d.best.v) : '–'} sub={d.best ? <span className="flex items-center gap-1 text-[10.5px] text-subtle"><Trophy size={10} /> {relativeDayKey(d.best.k)}</span> : null} />
      </div>

      <SectionTitle
        action={<Segmented size="sm" value={range} onChange={setRange} options={[{ value: '7', label: '7 T' }, { value: '30', label: '30 T' }, { value: '90', label: '90 T' }]} label="Zeitraum" />}
      >
        Entwicklung
      </SectionTitle>
      <div className="card p-3.5">
        <Segmented
          size="sm"
          className="mb-4"
          value={metric}
          onChange={setMetric}
          label="Kennzahl"
          options={[
            { value: 'steps', label: 'Schritte' },
            { value: 'distance_m', label: 'Distanz' },
            { value: 'active_min', label: 'Akt. Min' },
            { value: 'active_kcal', label: 'Akt. kcal' },
            { value: 'floors', label: 'Etagen' },
          ]}
        />
        <BarTrend color="move"
          data={d.chart}
          fmt={(x) => (metric === 'distance_m' ? `${String(x).replace('.', ',')} km` : fmtMetric(metric, x))}
          goal={metric === 'steps' ? profile.stepGoal : null}
          goalLabel="Ziel"
          yFmt={(x) => (x >= 10000 ? `${Math.round(x / 1000)}k` : String(x))}
        />
      </div>

      <SectionTitle>Wochenvergleich (Schritte)</SectionTitle>
      <div className="card divide-y divide-line/60">
        {d.weeks.map((w, i) => {
          const prev = d.weeks[i - 1];
          const diff = prev?.avg && w.avg ? ((w.avg - prev.avg) / prev.avg) * 100 : null;
          return (
            <div key={w.label} className="flex items-center justify-between px-3.5 py-2 text-[12.5px]">
              <span className="text-muted">{w.label}</span>
              <span className="num font-semibold">
                {w.avg != null ? `Ø ${fmtNumber(w.avg)}` : '–'}
                {diff != null && <span className={`ml-2 text-[11.5px] ${diff >= 0 ? 'text-good' : 'text-subtle'}`}>{diff >= 0 ? '+' : ''}{fmtNumber(diff)} %</span>}
              </span>
            </div>
          );
        })}
      </div>
      <SectionTitle>Körper</SectionTitle>
      <Link to="/body" className="card flex items-center gap-3 p-3.5">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-elevated transition hover:bg-line">
          <Scale size={18} />
        </span>
        <div className="flex-1">
          <div className="font-semibold">Körpergewicht</div>
          <div className="text-[11.5px] text-muted">Verlauf, Zielgewicht, Körperfett</div>
        </div>
        <ChevronRight size={18} className="text-subtle" />
      </Link>
      <Link to="/health/sources" className="card mt-2.5 flex items-center gap-3 p-3.5">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-elevated transition hover:bg-line">
          <Link2 size={18} />
        </span>
        <div className="flex-1">
          <div className="font-semibold">Datenquellen & Datenschutz</div>
          <div className="text-[11.5px] text-muted">Verbindungen, Berechtigungen, importierte Daten löschen</div>
        </div>
        <ChevronRight size={18} className="text-subtle" />
      </Link>

      <MetricEntrySheet open={entry} onClose={() => setEntry(false)} metric="steps" metrics={['steps', 'active_min']} />
    </div>
  );
}
