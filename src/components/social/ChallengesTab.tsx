import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { ChevronRight, Flag, Plus } from 'lucide-react';
import { createChallenge, myChallenges, respondChallenge } from '@/social/api';
import { useRemote } from '@/social/hooks';
import { METRIC_LABELS, type ChallengeMetric } from '@/social/types';
import { useSettings } from '@/hooks/useData';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Segmented } from '@/components/ui/Segmented';
import { Empty } from '@/components/ui/Empty';
import { useFeedback } from '@/components/ui/Feedback';
import { Field } from '@/components/exercises/ExerciseForm';
import { Avatar } from './Avatar';
import { useFriends } from './FriendsTab';
import { ErrorNote, Skeleton, fmtScore, remaining, useSharedExercises } from './shared';

export function ChallengesTab() {
  const { unit } = useSettings();
  const { toast } = useFeedback();
  const { data, error, loading, refresh } = useRemote(() => myChallenges(), [], [{ table: 'challenge_members' }]);
  const [creating, setCreating] = useState(false);
  const now = Date.now();
  const list = data ?? [];
  const running = list.filter((c) => Date.parse(c.ends_at) > now && c.my_status !== 'invited');
  const invites = list.filter((c) => c.my_status === 'invited' && Date.parse(c.ends_at) > now);
  const done = list.filter((c) => Date.parse(c.ends_at) <= now && c.my_status !== 'invited');

  return (
    <div>
      <Button variant="primary" block size="lg" icon={<Plus size={18} />} onClick={() => setCreating(true)}>
        Challenge erstellen
      </Button>
      <div className="mt-5 space-y-2.5">
        {loading && !data && <Skeleton rows={2} />}
        {error && !data && <ErrorNote error={error} onRetry={refresh} />}
        {invites.map((c) => (
          <div key={c.id} className="card p-4 ring-1 ring-area-social/40">
            <div className="label text-area-social">Einladung</div>
            <div className="mt-1 text-[16px] font-semibold">{c.title}</div>
            <div className="text-[13px] text-muted">
              {METRIC_LABELS[c.metric]}
              {c.exercise_name ? ` · ${c.exercise_name}` : ''} · {c.members} Teilnehmer
            </div>
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                onClick={async () => {
                  await respondChallenge(c.id, false).catch((e) => toast(e.message, 'error'));
                  void refresh();
                }}
              >
                Ablehnen
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={async () => {
                  await respondChallenge(c.id, true).then(() => toast('Du bist dabei!', 'success'), (e) => toast(e.message, 'error'));
                  void refresh();
                }}
              >
                Mitmachen
              </Button>
            </div>
          </div>
        ))}
        {running.map((c) => (
          <ChallengeCard key={c.id} c={c} unit={unit} />
        ))}
        {data && !running.length && !invites.length && !done.length && (
          <Empty icon={<Flag size={26} />} title="Keine Challenges" text="Fordere Freunde heraus: Wer hebt diese Woche das meiste Volumen? Wer schafft das schwerste Bankdrücken?" />
        )}
        {done.length > 0 && <div className="label px-1 pt-4">Beendet</div>}
        {done.map((c) => (
          <ChallengeCard key={c.id} c={c} unit={unit} finished />
        ))}
      </div>
      <NewChallengeSheet open={creating} onClose={() => setCreating(false)} onCreated={refresh} />
    </div>
  );
}

function ChallengeCard({ c, unit, finished }: { c: import('@/social/types').ChallengeSummary; unit: import('@/db/types').WeightUnit; finished?: boolean }) {
  const lead = c.my_rank === 1;
  return (
    <Link to={`/social/challenge/${c.id}`} className={clsx('card block p-4', finished && 'opacity-80')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[16px] font-semibold">{c.title}</div>
          <div className="truncate text-[13px] text-muted">
            {METRIC_LABELS[c.metric]}
            {c.exercise_name ? ` · ${c.exercise_name}` : ''}
          </div>
        </div>
        <ChevronRight size={18} className="mt-1 shrink-0 text-subtle" />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-elevated/60 px-2.5 py-2">
          <div className="num text-[15px] font-semibold">{c.my_rank ? `#${c.my_rank}` : '–'}</div>
          <div className="text-[11px] text-muted">Dein Platz</div>
        </div>
        <div className="rounded-xl bg-elevated/60 px-2.5 py-2">
          <div className="num truncate text-[15px] font-semibold">{fmtScore(c.metric, c.my_score, unit)}</div>
          <div className="text-[11px] text-muted">Dein Wert</div>
        </div>
        <div className="rounded-xl bg-elevated/60 px-2.5 py-2">
          <div className="num truncate text-[15px] font-semibold">{finished ? 'beendet' : remaining(c.ends_at)}</div>
          <div className="text-[11px] text-muted">{finished ? `${c.members} Teilnehmer` : 'verbleibend'}</div>
        </div>
      </div>
      {c.leader_username && (
        <div className="mt-2.5 text-[12px] text-muted">
          {lead ? '🏆 Du führst' : `Führung: @${c.leader_username} mit ${fmtScore(c.metric, c.leader_score, unit)}`}
        </div>
      )}
    </Link>
  );
}

const PERIODS: { value: string; label: string; days: number }[] = [
  { value: '7', label: '1 Woche', days: 7 },
  { value: '14', label: '2 Wochen', days: 14 },
  { value: '30', label: '30 Tage', days: 30 },
];

export function NewChallengeSheet({ open, onClose, onCreated, preselect }: { open: boolean; onClose: () => void; onCreated?: () => void; preselect?: string }) {
  const { toast } = useFeedback();
  const exercises = useSharedExercises();
  const friends = useFriends();
  const [title, setTitle] = useState('');
  const [metric, setMetric] = useState<ChallengeMetric>('volume');
  const [ex, setEx] = useState<string>('');
  const [period, setPeriod] = useState('7');
  const [invitees, setInvitees] = useState<string[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setTitle('');
      setMetric('volume');
      setEx('');
      setPeriod('7');
      setInvitees(preselect ? [preselect] : []);
      setErr('');
    }
  }, [open, preselect]);
  const needsEx = metric === 'e1rm' || metric === 'max_weight';
  const fr = (friends.data ?? []).filter((f) => f.direction === 'friend');

  const create = async () => {
    setBusy(true);
    try {
      const start = new Date();
      const days = PERIODS.find((p) => p.value === period)!.days;
      const exObj = exercises.find((e) => e.key === ex);
      await createChallenge({
        title: title || `${METRIC_LABELS[metric]}${exObj ? ` – ${exObj.name}` : ''}`,
        metric,
        exerciseKey: ex || null,
        exerciseName: exObj?.nameDe ?? null,
        startsAt: start,
        endsAt: new Date(start.getTime() + days * 86400000),
        invitees,
      });
      toast('Challenge gestartet – deine Freunde werden eingeladen', 'success');
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
      title="Neue Challenge"
      size="lg"
      footer={
        <Button variant="primary" size="lg" block disabled={busy || !invitees.length || (needsEx && !ex)} onClick={create}>
          {busy ? 'Erstellt …' : 'Challenge starten'}
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Wertung" htmlFor="ch-metric">
          <select id="ch-metric" className="field" value={metric} onChange={(e) => setMetric(e.target.value as ChallengeMetric)}>
            {(Object.keys(METRIC_LABELS) as ChallengeMetric[]).map((m) => (
              <option key={m} value={m}>
                {METRIC_LABELS[m]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={needsEx ? 'Übung' : 'Übung (optional – sonst alle)'} htmlFor="ch-ex">
          <select id="ch-ex" className="field" value={ex} onChange={(e) => setEx(e.target.value)}>
            {!needsEx && <option value="">Alle Übungen</option>}
            {needsEx && <option value="">Übung wählen …</option>}
            {exercises.map((e) => (
              <option key={e.key} value={e.key}>
                {e.name}
              </option>
            ))}
          </select>
        </Field>
        <div>
          <span className="label mb-2 block">Zeitraum ab jetzt</span>
          <Segmented value={period} onChange={setPeriod} options={PERIODS} label="Zeitraum" />
        </div>
        <Field label="Titel (optional)" htmlFor="ch-title">
          <input id="ch-title" className="field" maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Bankdrück-Battle" />
        </Field>
        <div>
          <span className="label mb-2 block">Freunde einladen</span>
          {!fr.length && <p className="text-[13px] text-muted">Füge zuerst Freunde hinzu (Tab „Freunde“).</p>}
          <div className="space-y-1.5">
            {fr.map((f) => {
              const on = invitees.includes(f.user_id);
              return (
                <button
                  key={f.user_id}
                  onClick={() => setInvitees((x) => (on ? x.filter((y) => y !== f.user_id) : [...x, f.user_id]))}
                  aria-pressed={on}
                  className={clsx('flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition', on ? 'bg-area-social/15 ring-1 ring-area-social/50' : 'bg-elevated/60')}
                >
                  <Avatar name={f.display_name} color={f.color} size={34} />
                  <span className="flex-1 text-[14px] font-medium">{f.display_name}</span>
                  <span className={clsx('h-5 w-5 rounded-full border-2', on ? 'border-area-social bg-area-social' : 'border-line')} />
                </button>
              );
            })}
          </div>
        </div>
        <p className="text-[12px] text-subtle">Gewertet werden automatisch alle Workouts im Zeitraum, die ihr in Forge beendet. Ergebnisse basieren auf euren eigenen Eingaben.</p>
        {err && <p className="animate-shake text-sm font-medium text-bad">{err}</p>}
      </div>
    </Sheet>
  );
}
