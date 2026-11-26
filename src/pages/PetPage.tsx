import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import clsx from 'clsx';
import { Check, ChevronRight, Dumbbell, Flame, Footprints, Gift, Lock, Pencil, Sparkles, Utensils } from 'lucide-react';
import { db } from '@/db/db';
import { PageHeader, SectionTitle } from '@/components/ui/PageHeader';
import { Segmented } from '@/components/ui/Segmented';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { useFeedback } from '@/components/ui/Feedback';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { Kettli } from '@/pet/Kettli';
import { CURRENCY, ITEMS, LEVEL_UP_COINS, MOOD_LINES, STAGES, canBuy, nextStage, type ItemKind, type QuestId, type QuestStatus, type ShopItem } from '@/pet/model';
import { DEFAULT_PET, buyItem, claimQuest, equipItem, renamePet } from '@/pet/repo';
import { usePet, usePetView, useTodayQuests } from '@/pet/hooks';
import type { PetState } from '@/db/types';

const QUEST_ICON: Record<QuestId, ReactNode> = {
  steps: <Footprints size={17} />,
  workout: <Dumbbell size={17} />,
  kcal: <Utensils size={17} />,
  bonus: <Gift size={17} />,
};
const QUEST_AREA: Record<QuestId, string> = { steps: 'move', workout: 'train', kcal: 'food', bonus: 'pet' };
const QUEST_LINK: Partial<Record<QuestId, string>> = { steps: '/activity', workout: '/workout', kcal: '/nutrition' };

export default function PetPage() {
  const pet = usePet();
  const { quests } = useTodayQuests();
  const claimedToday = quests?.filter((q) => q.claimed && q.id !== 'bonus').length ?? 0;
  const view = usePetView(pet, claimedToday);
  const stored = useStoredPet();

  if (!pet || !view || !quests || stored === undefined) return <div className="page" />;
  if (!stored) return <Adopt />;
  return <PetHome pet={pet} view={view} quests={quests} />;
}

/** true once Kettli was adopted (named), undefined while loading */
function useStoredPet() {
  return useLiveQuery(async () => !!(await db.pet.get('pet')), []);
}

/* ---------------- first visit: name your Kettli ---------------- */

function Adopt() {
  const [name, setName] = useState('Kettli');
  const [busy, setBusy] = useState(false);
  return (
    <div className="page">
      <div className="mx-auto max-w-sm pt-6 text-center">
        <Kettli size={200} mood="happy" level={1} className="mx-auto" />
        <h1 className="title-xl mt-3">Das ist dein Kettli</h1>
        <p className="mx-auto mt-2 max-w-xs text-[13.5px] leading-relaxed text-muted">
          Erledige jeden Tag deine Aufgaben – Schritte, Workout, Kalorien – und Kettli wächst mit dir. Mit {CURRENCY} kaufst du ihm neue Looks.
        </p>
        <label className="mt-6 block text-left">
          <span className="mb-1.5 block text-[12.5px] font-semibold text-muted">Wie soll er heißen?</span>
          <input className="field text-center text-[17px] font-semibold" value={name} maxLength={16} onChange={(e) => setName(e.target.value)} aria-label="Name" />
        </label>
        <Button
          variant="primary"
          size="lg"
          block
          className="mt-4"
          disabled={busy || !name.trim()}
          onClick={async () => {
            setBusy(true);
            await db.pet.put({ ...DEFAULT_PET(), name: name.trim().slice(0, 16) });
          }}
        >
          Los geht's
        </Button>
      </div>
    </div>
  );
}

/* ---------------- main ---------------- */

interface FloatFx {
  id: number;
  text: string;
  dx: number;
}

function PetHome({ pet, view, quests }: { pet: PetState; view: NonNullable<ReturnType<typeof usePetView>>; quests: QuestStatus[] }) {
  const { toast } = useFeedback();
  const [jump, setJump] = useState(0);
  const [bubble, setBubble] = useState<string | null>(null);
  const [fx, setFx] = useState<FloatFx[]>([]);
  const [levelUp, setLevelUp] = useState<{ level: number; stage?: string } | null>(null);
  const [rename, setRename] = useState(false);
  const fxId = useRef(0);
  const bubbleTimer = useRef<ReturnType<typeof setTimeout>>();
  const next = nextStage(view.level);

  const float = (texts: string[]) => {
    const add = texts.map((text, i) => ({ id: ++fxId.current, text, dx: (i - (texts.length - 1) / 2) * 46 }));
    setFx((f) => [...f, ...add]);
    setTimeout(() => setFx((f) => f.filter((x) => !add.includes(x))), 1200);
  };
  const say = (line: string) => {
    setBubble(line);
    clearTimeout(bubbleTimer.current);
    bubbleTimer.current = setTimeout(() => setBubble(null), 2600);
  };
  const poke = () => {
    setJump((j) => j + 1);
    const lines = MOOD_LINES[view.mood];
    say(lines[Math.floor(Math.random() * lines.length)]);
    float(['❤️']);
  };

  const claim = async (q: QuestStatus) => {
    const r = await claimQuest(q.id);
    if (!r) return;
    setJump((j) => j + 1);
    float([`+${r.xp} XP`, `+${r.coins} ${CURRENCY}`]);
    if (r.streakCoins > 0 && r.streak > 1) toast(`🔥 ${r.streak} Tage in Folge – +${r.streakCoins} ${CURRENCY} Bonus`, 'success');
    if (r.levelAfter > r.levelBefore) {
      const stage = STAGES.find((s) => s.from > r.levelBefore && s.from <= r.levelAfter);
      setTimeout(() => setLevelUp({ level: r.levelAfter, stage: stage?.label }), 500);
    }
  };

  return (
    <div className="page">
      <PageHeader title={pet.name} subtitle={`${STAGES.find((s) => s.id === view.stage)!.label} · Level ${view.level}`} area="pet" actions={<CoinPill coins={pet.coins} />} />

      {/* hero */}
      <section className="card relative overflow-visible p-4">
        <div className="flex items-center justify-between text-[12px] font-semibold">
          <span className={clsx('flex items-center gap-1 rounded-full px-2.5 py-1', pet.streak > 0 ? 'bg-area-food/15 text-area-food' : 'bg-elevated text-muted')}>
            <Flame size={13} /> {pet.streak} {pet.streak === 1 ? 'Tag' : 'Tage'}
          </span>
          <button onClick={() => setRename(true)} className="flex items-center gap-1 rounded-full bg-elevated px-2.5 py-1 text-muted hover:text-fg" aria-label="Namen ändern">
            <Pencil size={12} /> Name
          </button>
        </div>
        <div className="relative mx-auto mt-1 w-fit">
          {bubble && (
            <div className="absolute -top-2 left-1/2 z-10 w-max max-w-[230px] -translate-x-1/2 -translate-y-full animate-pop rounded-2xl bg-fg px-3 py-2 text-center text-[12.5px] font-medium text-bg shadow-lg">
              {bubble}
              <span className="absolute -bottom-1 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-fg" />
            </div>
          )}
          <button onClick={poke} className="block rounded-3xl outline-none" aria-label={`${pet.name} antippen`} data-testid="kettli">
            <Kettli key={jump} jumping={jump > 0} skin={pet.equipped.skin} accessory={pet.equipped.accessory} background={pet.equipped.background} level={view.level} mood={view.mood} size={210} />
          </button>
          {fx.map((f) => (
            <span key={f.id} className="float-up left-1/2 top-1/3 whitespace-nowrap rounded-full bg-surface px-2.5 py-1 text-[13px] font-bold text-area-pet shadow-md" style={{ ['--dx' as string]: `${f.dx}px` }}>
              {f.text}
            </span>
          ))}
        </div>
        <div className="mt-2">
          <div className="flex items-baseline justify-between text-[12px]">
            <span className="font-semibold">Level {view.level}</span>
            <span className="num text-muted">
              {view.into} / {view.needed} XP
            </span>
          </div>
          <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-elevated">
            <div className="h-full rounded-full bg-area-pet transition-[width] duration-700 ease-[cubic-bezier(.2,.9,.25,1)]" style={{ width: `${Math.max(3, view.pct * 100)}%` }} />
          </div>
          {next && <p className="mt-1.5 text-[11.5px] text-subtle">Ab Level {next.from} wird {pet.name} zum {next.label}.</p>}
        </div>
      </section>

      {/* quests */}
      <SectionTitle area="pet">Heutige Aufgaben</SectionTitle>
      <div className="stagger space-y-2">
        {quests.map((q) => (
          <QuestRow key={q.id} q={q} onClaim={() => void claim(q)} />
        ))}
      </div>
      <p className="mt-2 px-1 text-[11px] text-subtle">Täglich neu um Mitternacht. Kalorien zählen als eingehalten zwischen 90 und 105 % deines Ziels.</p>

      <Shop pet={pet} level={view.level} />

      <Sheet open={!!levelUp} onClose={() => setLevelUp(null)} title={null}>
        {levelUp && (
          <div className="py-2 text-center">
            <Kettli skin={pet.equipped.skin} accessory={pet.equipped.accessory} level={levelUp.level} mood="ecstatic" size={170} className="mx-auto" />
            <div className="mt-2 text-[12px] font-semibold uppercase tracking-wider text-area-pet">Level-Up!</div>
            <div className="title-xl mt-1">Level {levelUp.level}</div>
            {levelUp.stage && <p className="mt-1 text-[14px] font-semibold">{pet.name} ist jetzt ein {levelUp.stage}! ✨</p>}
            <p className="mt-1 text-[13px] text-muted">
              +{LEVEL_UP_COINS} {CURRENCY} als Belohnung
            </p>
            <Button variant="primary" block className="mt-4" onClick={() => setLevelUp(null)}>
              Weiter so!
            </Button>
          </div>
        )}
      </Sheet>
      <RenameSheet open={rename} onClose={() => setRename(false)} current={pet.name} />
    </div>
  );
}

export function CoinIcon({ size = 16 }: { size?: number }) {
  // a weight plate as coin
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="10.5" fill="#F7C63A" stroke="#D99A12" strokeWidth="2" />
      <circle cx="12" cy="12" r="6" fill="none" stroke="#D99A12" strokeWidth="1.5" opacity="0.7" />
      <circle cx="12" cy="12" r="2.2" fill="#D99A12" />
    </svg>
  );
}

function CoinPill({ coins }: { coins: number }) {
  return (
    <span key={coins} className="coin-pop flex items-center gap-1.5 rounded-full bg-elevated px-3 py-1.5 text-[13px] font-bold" aria-label={`${coins} ${CURRENCY}`} data-testid="coins">
      <CoinIcon />
      <span className="num">
        <AnimatedNumber value={coins} />
      </span>
    </span>
  );
}

function QuestRow({ q, onClaim }: { q: QuestStatus; onClaim: () => void }) {
  const area = QUEST_AREA[q.id];
  const link = QUEST_LINK[q.id];
  return (
    <div className={clsx(`chip-${area} card flex items-center gap-3 p-3`, q.claimed && 'opacity-70')} data-testid={`quest-${q.id}`}>
      <span className={clsx('chip h-10 w-10 shrink-0 rounded-xl', `chip-${area}`)}>{q.claimed ? <Check size={18} /> : QUEST_ICON[q.id]}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13.5px] font-semibold">{q.title}</span>
        </div>
        <div className="truncate text-[11.5px] text-muted">{q.detail}</div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-elevated">
          <div className="nav-dot h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.max(q.progress * 100, q.claimed ? 100 : 2)}%` }} />
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {q.claimed ? (
          <span className="text-[11.5px] font-semibold text-muted">Abgeholt</span>
        ) : q.done ? (
          <button onClick={onClaim} className="nav-pill nav-ink animate-pop rounded-full px-3 py-1.5 text-[12.5px] font-bold active:scale-95" aria-label={`${q.title} abholen`}>
            Abholen
          </button>
        ) : link ? (
          <Link to={link} className="flex items-center text-[11.5px] font-semibold text-muted hover:text-fg">
            Los <ChevronRight size={14} />
          </Link>
        ) : null}
        <span className="num flex items-center gap-1 text-[10.5px] text-subtle">
          +{q.xp} XP · +{q.coins} <CoinIcon size={11} />
        </span>
      </div>
    </div>
  );
}

/* ---------------- shop ---------------- */

const KIND_LABEL: Record<ItemKind, string> = { skin: 'Farben', accessory: 'Accessoires', background: 'Hintergründe' };

function Shop({ pet, level }: { pet: PetState; level: number }) {
  const [kind, setKind] = useState<ItemKind>('skin');
  const [selected, setSelected] = useState<ShopItem | null>(null);
  const { toast } = useFeedback();
  const items = useMemo(() => ITEMS.filter((i) => i.kind === kind), [kind]);
  const owned = (i: ShopItem) => i.price === 0 || pet.owned.includes(i.id);
  return (
    <>
      <SectionTitle area="pet" action={<CoinPill coins={pet.coins} />}>
        Shop
      </SectionTitle>
      <Segmented<ItemKind> value={kind} onChange={setKind} options={(Object.keys(KIND_LABEL) as ItemKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))} label="Kategorie" />
      <div className="stagger mt-3 grid grid-cols-3 gap-2" key={kind}>
        {items.map((it) => {
          const isEquipped = pet.equipped[it.kind] === it.id;
          const locked = !owned(it) && !!it.minLevel && level < it.minLevel;
          return (
            <button
              key={it.id}
              onClick={async () => {
                if (owned(it)) {
                  if (!isEquipped) await equipItem(it.id);
                } else setSelected(it);
              }}
              className={clsx('card relative flex flex-col items-center p-2 pb-2.5 text-center', isEquipped && 'ring-2 ring-area-pet')}
              aria-label={`${it.name}${isEquipped ? ' (angelegt)' : owned(it) ? ' anlegen' : ' kaufen'}`}
            >
              <Kettli
                animated={false}
                size={84}
                level={level}
                mood="happy"
                skin={it.kind === 'skin' ? it.id : pet.equipped.skin}
                accessory={it.kind === 'accessory' ? it.id : pet.equipped.accessory}
                background={it.kind === 'background' ? it.id : 'bg-none'}
                className={locked ? 'opacity-40 grayscale' : undefined}
              />
              <span className="mt-1 w-full truncate text-[12px] font-semibold">{it.name}</span>
              <span className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-muted">
                {isEquipped ? (
                  <span className="text-area-pet">Angelegt</span>
                ) : owned(it) ? (
                  'Anlegen'
                ) : locked ? (
                  <>
                    <Lock size={11} /> Level {it.minLevel}
                  </>
                ) : (
                  <>
                    <CoinIcon size={12} /> {it.price}
                  </>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <Sheet open={!!selected} onClose={() => setSelected(null)} title={selected?.name ?? ''}>
        {selected &&
          (() => {
            const check = canBuy(selected, pet.coins, level, pet.owned);
            return (
              <div className="text-center">
                <Kettli
                  size={150}
                  level={level}
                  mood="happy"
                  skin={selected.kind === 'skin' ? selected.id : pet.equipped.skin}
                  accessory={selected.kind === 'accessory' ? selected.id : pet.equipped.accessory}
                  background={selected.kind === 'background' ? selected.id : pet.equipped.background}
                  className="mx-auto"
                />
                <p className="mt-2 flex items-center justify-center gap-1.5 text-[15px] font-bold">
                  <CoinIcon /> {selected.price} {CURRENCY}
                </p>
                {!check.ok && <p className="mt-1 text-[12.5px] text-muted">{check.reason}</p>}
                <Button
                  variant="primary"
                  block
                  className="mt-4"
                  disabled={!check.ok}
                  icon={<Sparkles size={16} />}
                  onClick={async () => {
                    try {
                      await buyItem(selected.id);
                      toast(`${selected.name} gekauft und angelegt`, 'success');
                      setSelected(null);
                    } catch (e) {
                      toast((e as Error).message, 'error');
                    }
                  }}
                >
                  Kaufen & anlegen
                </Button>
              </div>
            );
          })()}
      </Sheet>
    </>
  );
}

function RenameSheet({ open, onClose, current }: { open: boolean; onClose: () => void; current: string }) {
  const [name, setName] = useState(current);
  const { toast } = useFeedback();
  return (
    <Sheet open={open} onClose={onClose} title="Name ändern">
      <input className="field text-[16px]" value={name} maxLength={16} onChange={(e) => setName(e.target.value)} aria-label="Neuer Name" />
      <Button
        variant="primary"
        block
        className="mt-3"
        onClick={async () => {
          try {
            await renamePet(name);
            onClose();
          } catch (e) {
            toast((e as Error).message, 'error');
          }
        }}
      >
        Speichern
      </Button>
    </Sheet>
  );
}
