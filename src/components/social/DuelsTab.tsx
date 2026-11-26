import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { ChevronRight, Swords, Zap } from 'lucide-react';
import { cancelDuel, createDuel, myDuels, respondDuel } from '@/social/api';
import { useRemote } from '@/social/hooks';
import type { DuelSummary } from '@/social/types';
import { useSettings } from '@/hooks/useData';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Segmented } from '@/components/ui/Segmented';
import { Empty } from '@/components/ui/Empty';
import { useFeedback } from '@/components/ui/Feedback';
import { Field } from '@/components/exercises/ExerciseForm';
import { Avatar } from './Avatar';
import { useFriends } from './FriendsTab';
import { ErrorNote, Skeleton, ago, fmtScore, remaining, useSharedExercises } from './shared';

export function DuelsTab() {
  const { toast } = useFeedback();
  const { data, error, loading, refresh } = useRemote(() => myDuels(), [], [{ table: 'duels' }]);
  const [creating, setCreating] = useState(false);
  const list = data ?? [];
  const live = list.filter((d) => d.status === 'active');
  const pending = list.filter((d) => d.status === 'pending');
  const past = list.filter((d) => d.status === 'finished').slice(0, 10);

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      toast(msg, 'success');
      void refresh();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  return (
    <div>
      <div className="card relative overflow-hidden p-4">
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-16 h-44 w-44 rounded-full bg-area-social/25 blur-3xl" />
        <div className="relative">
          <span className="chip chip-social h-10 w-10 rounded-2xl">
            <Swords size={20} />
          </span>
          <div className="mt-3 text-[16.5px] font-semibold tracking-[-0.01em]">Live-Duell</div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
            Ihr trainiert gleichzeitig – jeder abgeschlossene Satz zählt sofort. Wer nach Ablauf der Zeit mehr Volumen (oder Wiederholungen) hat, gewinnt.
          </p>
          <Button variant="primary" className="mt-4" icon={<Zap size={16} />} onClick={() => setCreating(true)}>
            Freund herausfordern
          </Button>
        </div>
      </div>

      <div className="mt-5 space-y-2.5">
        {loading && !data && <Skeleton rows={2} />}
        {error && !data && <ErrorNote error={error} onRetry={refresh} />}
        {live.map((d) => (
          <DuelRow key={d.id} d={d} live />
        ))}
        {pending.map((d) => (
          <div key={d.id} className="card p-3.5">
            <div className="flex items-center gap-3">
              <Avatar name={d.opponent_display_name} color={d.opponent_color} size={40} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold">
                  {d.i_am_challenger ? `Warte auf ${d.opponent_display_name}` : `${d.opponent_display_name} fordert dich heraus`}
                </div>
                <div className="truncate text-[11.5px] text-muted">
                  {d.exercise_name ?? 'Alle Übungen'} · {d.metric === 'volume' ? 'Volumen' : 'Wiederholungen'} · {d.duration_min} min · {ago(d.created_at)}
                </div>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              {d.i_am_challenger ? (
                <Button size="sm" onClick={() => act(() => cancelDuel(d.id), 'Duell abgesagt')}>
                  Absagen
                </Button>
              ) : (
                <>
                  <Button size="sm" onClick={() => act(() => respondDuel(d.id, false), 'Abgelehnt')}>
                    Ablehnen
                  </Button>
                  <Button size="sm" variant="primary" onClick={() => act(() => respondDuel(d.id, true), 'Duell läuft – los geht’s! 🔥')}>
                    Annehmen & starten
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}
        {data && !live.length && !pending.length && !past.length && (
          <Empty icon={<Swords size={26} />} title="Noch keine Duelle" text="Fordere einen Freund heraus, wenn ihr beide trainiert – auch wenn ihr in verschiedenen Studios seid." />
        )}
        {past.length > 0 && <div className="label px-1 pt-4">Vergangene Duelle</div>}
        {past.map((d) => (
          <DuelRow key={d.id} d={d} />
        ))}
      </div>
      <NewDuelSheet open={creating} onClose={() => setCreating(false)} onCreated={refresh} />
    </div>
  );
}

function DuelRow({ d, live }: { d: DuelSummary; live?: boolean }) {
  const { unit } = useSettings();
  const me = d.my_score ?? 0;
  const op = d.opponent_score ?? 0;
  const result = me > op ? 'Gewonnen' : me < op ? 'Verloren' : 'Unentschieden';
  return (
    <Link to={`/social/duel/${d.id}`} className={clsx('card block p-3.5', live && 'ring-1 ring-area-social/50')}>
      <div className="flex items-center gap-3">
        <Avatar name={d.opponent_display_name} color={d.opponent_color} size={40} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold">vs. {d.opponent_display_name}</div>
          <div className="truncate text-[11.5px] text-muted">
            {d.exercise_name ?? 'Alle Übungen'} · {live && d.ends_at ? `noch ${remaining(d.ends_at)}` : result}
          </div>
        </div>
        {live && <span className="flex h-2.5 w-2.5 animate-pulse rounded-full bg-area-social" aria-label="live" />}
        <div className="num text-right text-[13px] font-semibold">
          {fmtScore(d.metric, me, unit)}
          <div className="text-[11.5px] font-normal text-muted">{fmtScore(d.metric, op, unit)}</div>
        </div>
        <ChevronRight size={18} className="text-subtle" />
      </div>
    </Link>
  );
}

export function NewDuelSheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated?: () => void }) {
  const { toast } = useFeedback();
  const exercises = useSharedExercises();
  const friends = useFriends();
  const [opp, setOpp] = useState('');
  const [ex, setEx] = useState('');
  const [metric, setMetric] = useState<'volume' | 'reps'>('volume');
  const [dur, setDur] = useState('30');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (open) {
      setOpp('');
      setEx('');
      setMetric('volume');
      setDur('30');
      setErr('');
    }
  }, [open]);
  const fr = (friends.data ?? []).filter((f) => f.direction === 'friend');

  const create = async () => {
    setBusy(true);
    try {
      const exObj = exercises.find((e) => e.key === ex);
      await createDuel(opp, ex || null, exObj?.nameDe ?? null, metric, Number(dur));
      toast('Herausforderung gesendet', 'success');
      onCreated?.();
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Live-Duell"
      footer={
        <Button variant="primary" size="lg" block disabled={!opp || busy} onClick={create}>
          {busy ? 'Sendet …' : 'Herausfordern'}
        </Button>
      }
    >
      <div className="space-y-4">
        <div>
          <span className="label mb-2 block">Gegner</span>
          {!fr.length && <p className="text-[12.5px] text-muted">Füge zuerst Freunde hinzu.</p>}
          <div className="space-y-1.5">
            {fr.map((f) => (
              <button
                key={f.user_id}
                onClick={() => setOpp(f.user_id)}
                aria-pressed={opp === f.user_id}
                className={clsx('flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition', opp === f.user_id ? 'bg-area-social/15 ring-1 ring-area-social/50' : 'bg-elevated/60')}
              >
                <Avatar name={f.display_name} color={f.color} size={34} />
                <span className="flex-1 text-[13px] font-medium">{f.display_name}</span>
              </button>
            ))}
          </div>
        </div>
        <Field label="Übung" htmlFor="du-ex">
          <select id="du-ex" className="field" value={ex} onChange={(e) => setEx(e.target.value)}>
            <option value="">Alle Übungen</option>
            {exercises.map((e) => (
              <option key={e.key} value={e.key}>
                {e.name}
              </option>
            ))}
          </select>
        </Field>
        <div>
          <span className="label mb-2 block">Wertung</span>
          <Segmented value={metric} onChange={setMetric} options={[{ value: 'volume', label: 'Volumen (kg × Wdh)' }, { value: 'reps', label: 'Wiederholungen' }]} label="Wertung" />
        </div>
        <div>
          <span className="label mb-2 block">Dauer ab Annahme</span>
          <Segmented value={dur} onChange={setDur} options={['15', '30', '45', '60', '90'].map((v) => ({ value: v, label: `${v} min` }))} size="sm" label="Dauer" />
        </div>
        {err && <p className="animate-shake text-[13px] font-medium text-bad">{err}</p>}
      </div>
    </Sheet>
  );
}
