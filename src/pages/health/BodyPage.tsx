import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { Plus, Trash2, TrendingDown, TrendingUp, Target } from 'lucide-react';
import { db } from '@/db/db';
import { useHealthContext, useProfile } from '@/hooks/useHealth';
import { valueOn } from '@/health/merge';
import { deleteMetric, updateProfile } from '@/health/repo';
import { SOURCE_META } from '@/health/meta';
import { GOAL_LABELS } from '@/nutrition/calc';
import { addDays, dayKey, dayLabel, lastNDays, relativeDayKey } from '@/lib/day';
import { fmtNumber, parseDecimal } from '@/lib/units';
import { PageHeader, SectionTitle } from '@/components/ui/PageHeader';
import { Segmented } from '@/components/ui/Segmented';
import { Button, IconButton } from '@/components/ui/Button';
import { useFeedback } from '@/components/ui/Feedback';
import { LineTrend } from '@/components/charts/Charts';
import { MetricEntrySheet } from '@/components/health/ManualEntry';
import { SourceBadge } from '@/components/health/SourceBadge';
import { Kv } from '@/components/health/Kv';

type Range = '7' | '30' | '90' | '365';

export default function BodyPage() {
  const ctx = useHealthContext(400);
  const profile = useProfile();
  const { confirm, toast } = useFeedback();
  const [range, setRange] = useState<Range>('90');
  const [entry, setEntry] = useState(false);
  const [goal, setGoal] = useState('');
  const entries = useLiveQuery(() => db.healthMetrics.where('metric').anyOf('weight_kg', 'body_fat_pct').reverse().sortBy('date'), []);

  const d = useMemo(() => {
    if (!ctx.loaded) return null;
    const today = dayKey();
    const at = (k: string) => valueOn(ctx.merged, 'weight_kg', k)?.value ?? null;
    /** latest value on or before day k (within 10 days) */
    const asOf = (k: string) => {
      for (let i = 0; i < 10; i++) {
        const v = at(addDays(k, -i));
        if (v != null) return v;
      }
      return null;
    };
    let latestDay: string | null = null;
    for (let i = 0; i < 400 && !latestDay; i++) if (at(addDays(today, -i)) != null) latestDay = addDays(today, -i);
    const current = latestDay ? at(latestDay) : null;
    const change = (n: number) => (current != null && asOf(addDays(latestDay!, -n)) != null ? current - asOf(addDays(latestDay!, -n))! : null);
    const days = lastNDays(Number(range));
    const chart = days.map((k) => ({ label: dayLabel(k), value: at(k) }));
    // 7-day moving average smooths water fluctuation
    const smooth = days.map((k, i) => {
      const xs = days.slice(Math.max(0, i - 6), i + 1).map(at).filter((x): x is number => x != null);
      return { label: dayLabel(k), value: xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null };
    });
    const fat = latestDay ? valueOn(ctx.merged, 'body_fat_pct', latestDay) : undefined;
    // weekly rate over the last 4 weeks (linear regression on available points)
    const pts = lastNDays(28).map((k, i) => ({ x: i, y: at(k) })).filter((p): p is { x: number; y: number } => p.y != null);
    let weekly: number | null = null;
    if (pts.length >= 4 && pts[pts.length - 1].x - pts[0].x >= 10) {
      const mx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
      const my = pts.reduce((a, p) => a + p.y, 0) / pts.length;
      const slope = pts.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0) / pts.reduce((a, p) => a + (p.x - mx) ** 2, 0);
      weekly = slope * 7;
    }
    return { latestDay, current, c7: change(7), c30: change(30), c90: change(90), chart, smooth, fat, weekly, hasData: !!latestDay };
  }, [ctx, range]);

  if (!ctx.loaded || !d) return <div className="page" />;
  const goalW = profile.goalWeightKg;
  const toGoal = d.current != null && goalW != null ? goalW - d.current : null;
  const sign = (x: number | null) => (x == null ? '–' : `${x > 0 ? '+' : x < 0 ? '−' : '±'}${fmtNumber(Math.abs(x), 1)} kg`);
  // compare trend with nutrition goal
  let verdict: { text: string; ok: boolean } | null = null;
  if (d.weekly != null) {
    const w = d.weekly;
    const g = profile.goal;
    if (g === 'fatloss') verdict = w < -0.1 ? { text: `Gewicht sinkt um ${fmtNumber(-w, 2)} kg/Woche – passt zu „${GOAL_LABELS[g]}“.`, ok: true } : { text: `Kein Abwärtstrend (${sign(w)}/Woche) – Ziel „${GOAL_LABELS[g]}“ wird aktuell nicht erreicht.`, ok: false };
    else if (g === 'muscle') verdict = w > 0.05 && w < 0.5 ? { text: `Leichter Anstieg (${sign(w)}/Woche) – passt zu „${GOAL_LABELS[g]}“.`, ok: true } : { text: `${sign(w)}/Woche – für sauberen Muskelaufbau sind ca. +0,1 bis +0,4 kg/Woche üblich.`, ok: false };
    else verdict = Math.abs(w) < 0.2 ? { text: `Stabil (${sign(w)}/Woche) – passt zu „${GOAL_LABELS[g]}“.`, ok: true } : { text: `${sign(w)}/Woche – Gewicht verändert sich trotz Ziel „${GOAL_LABELS[g]}“.`, ok: false };
  }

  return (
    <div className="page">
      <PageHeader back title="Körpergewicht" actions={<Button size="sm" variant="primary" onClick={() => setEntry(true)} icon={<Plus size={15} />}>Wiegen</Button>} />

      <div className="card p-4">
        <div className="label">Aktuelles Gewicht</div>
        <div className="num mt-1 text-[28px] font-bold leading-none tracking-tight">
          {d.current != null ? fmtNumber(d.current, 1) : '–'} <span className="text-[16.5px] text-subtle">kg</span>
        </div>
        <div className="mt-1 text-[11.5px] text-muted">
          {d.latestDay ? relativeDayKey(d.latestDay) : 'Noch kein Eintrag'}
          {d.latestDay && <> · <SourceBadge m={valueOn(ctx.merged, 'weight_kg', d.latestDay)} /></>}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Kv k="7 Tage" v={sign(d.c7)} />
          <Kv k="30 Tage" v={sign(d.c30)} />
          <Kv k="90 Tage" v={sign(d.c90)} />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Kv k="Zielgewicht" v={goalW != null ? `${fmtNumber(goalW, 1)} kg` : '–'} sub={toGoal != null ? <span className="text-[10.5px] text-subtle">noch {sign(toGoal)}</span> : null} />
          <Kv k="Körperfett" v={d.fat ? `${fmtNumber(d.fat.value, 1)} %` : '–'} sub={d.fat ? <SourceBadge m={d.fat} /> : null} />
        </div>
        {verdict && (
          <div className={`mt-3 flex gap-2 rounded-xl px-3 py-2.5 text-[12.5px] ${verdict.ok ? 'bg-good/10' : 'bg-warn/10'}`}>
            {d.weekly! < 0 ? <TrendingDown size={16} className="mt-0.5 shrink-0" /> : <TrendingUp size={16} className="mt-0.5 shrink-0" />}
            <span>
              {verdict.text} <span className="text-subtle">(Trend der letzten 4 Wochen, eigene Berechnung)</span>
            </span>
          </div>
        )}
      </div>

      <SectionTitle
        action={
          <Segmented size="sm" value={range} onChange={setRange} label="Zeitraum" options={[{ value: '7', label: '7 T' }, { value: '30', label: '30 T' }, { value: '90', label: '3 M' }, { value: '365', label: '1 J' }]} />
        }
      >
        Gewichtsverlauf
      </SectionTitle>
      <div className="card p-3.5">
        {d.chart.filter((p) => p.value != null).length >= 2 ? (
          <>
            <LineTrend color="body" data={range === '7' ? d.chart : d.smooth} fmt={(v) => `${fmtNumber(v, 1)} kg`} goal={goalW} goalLabel="Zielgewicht" />
            {range !== '7' && <p className="mt-1 text-[10.5px] text-subtle">Gleitender 7-Tage-Durchschnitt – glättet Wasserschwankungen.</p>}
          </>
        ) : (
          <p className="py-8 text-center text-[13px] text-muted">Mindestens zwei Messungen im Zeitraum nötig.</p>
        )}
      </div>

      <SectionTitle>Zielgewicht</SectionTitle>
      <div className="card flex items-center gap-2 p-3.5">
        <Target size={18} className="text-muted" />
        <input
          className="field flex-1"
          inputMode="decimal"
          placeholder={goalW != null ? `${fmtNumber(goalW, 1)} kg` : 'z. B. 78,5'}
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          aria-label="Zielgewicht in kg"
        />
        <Button
          onClick={async () => {
            const v = parseDecimal(goal);
            if (v == null || v < 30 || v > 300) return toast('Bitte ein Zielgewicht zwischen 30 und 300 kg eingeben.', 'error');
            await updateProfile({ goalWeightKg: v });
            setGoal('');
            toast('Zielgewicht gespeichert', 'success');
          }}
        >
          Speichern
        </Button>
      </div>
      <p className="mt-2 px-1 text-[11.5px] text-subtle">
        Zielgewicht und Ernährungsziel werden im <Link to="/nutrition/profile" className="font-semibold underline">Ernährungsprofil</Link> gemeinsam genutzt.
      </p>

      <SectionTitle>Einträge</SectionTitle>
      <div className="card divide-y divide-line/60">
        {(entries ?? []).slice(0, 60).map((e) => (
          <div key={e.id} className="flex items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="num text-[13px] font-semibold">
                {e.metric === 'weight_kg' ? `${fmtNumber(e.value, 1)} kg` : `${fmtNumber(e.value, 1)} % Körperfett`}
              </div>
              <div className="text-[11.5px] text-muted">
                {relativeDayKey(e.date)} · {SOURCE_META[e.source].short}
              </div>
            </div>
            {e.source === 'manual' && (
              <IconButton
                label="Eintrag löschen"
                variant="danger"
                onClick={async () => {
                  if (await confirm({ title: 'Eintrag löschen?', confirmLabel: 'Löschen', danger: true })) await deleteMetric(e.id);
                }}
              >
                <Trash2 size={16} />
              </IconButton>
            )}
          </div>
        ))}
        {!entries?.length && <p className="p-5 text-center text-[13px] text-muted">Noch keine Einträge.</p>}
      </div>
      <MetricEntrySheet open={entry} onClose={() => setEntry(false)} metric="weight_kg" metrics={['weight_kg', 'body_fat_pct']} />
    </div>
  );
}
