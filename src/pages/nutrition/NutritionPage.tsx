import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { BarChart3, CalendarDays, ChevronLeft, ChevronRight, Copy, MoreHorizontal, Plus, Save, Trash2, UserCog, Apple, ArrowRightLeft, Info } from 'lucide-react';
import clsx from 'clsx';
import { db } from '@/db/db';
import type { FoodLogEntry, MealSlot } from '@/db/types';
import { addDays, dayKey, relativeDayKey } from '@/lib/day';
import { entryNutrients, sumNutrients } from '@/nutrition/calc';
import { MEALS, copyMeal, defaultMeal, deleteEntry, moveEntry, recipeFromMeal, restoreEntry, updateEntryAmount } from '@/nutrition/repo';
import { fmtNumber, parseDecimal } from '@/lib/units';
import { PageHeader } from '@/components/ui/PageHeader';
import { Sheet } from '@/components/ui/Sheet';
import { Button, IconButton } from '@/components/ui/Button';
import { useFeedback } from '@/components/ui/Feedback';
import { MenuItem, MenuList } from '@/components/workout/ExerciseCard';
import { RenameSheet } from '@/pages/WorkoutPage';
import { AddFoodSheet } from '@/components/nutrition/AddFoodSheet';
import { KcalRing, MacroBar, MacroLine, NutrientTable, dayTotals, useDayEntries, useTargets } from '@/components/nutrition/shared';
import { Badge } from '@/components/ui/Chip';

export default function NutritionPage() {
  const [params, setParams] = useSearchParams();
  const today = dayKey();
  const date = params.get('date') && /^\d{4}-\d{2}-\d{2}$/.test(params.get('date')!) ? params.get('date')! : today;
  const setDate = (d: string) => setParams(d === today ? {} : { date: d }, { replace: true });
  const entries = useDayEntries(date);
  const targets = useTargets(date);
  const [adding, setAdding] = useState<MealSlot | null>(null);
  const [editing, setEditing] = useState<FoodLogEntry | null>(null);
  const [mealMenu, setMealMenu] = useState<MealSlot | null>(null);
  const [calendar, setCalendar] = useState(false);

  const totals = useMemo(() => dayTotals(entries ?? []), [entries]);
  const byMeal = useMemo(() => {
    const m = new Map<MealSlot, FoodLogEntry[]>();
    for (const e of entries ?? []) m.set(e.meal, [...(m.get(e.meal) ?? []), e]);
    return m;
  }, [entries]);

  const kcalLeft = targets.kcal != null ? targets.kcal - totals.kcal : null;
  const hints: string[] = [];
  if (entries?.length && targets.kcal != null && kcalLeft != null) {
    if (kcalLeft < 0) hints.push(`Kalorienziel um ${fmtNumber(-kcalLeft, 0)} kcal überschritten.`);
    else if (kcalLeft <= targets.kcal * 0.15) hints.push(`Kalorienziel fast erreicht – noch ${fmtNumber(kcalLeft, 0)} kcal übrig.`);
  }
  if (entries?.length && targets.protein != null && totals.protein < targets.protein)
    hints.push(`Proteinziel noch nicht erreicht – es fehlen ${fmtNumber(targets.protein - totals.protein, 0)} g.`);

  return (
    <div className="page">
      <PageHeader
        title="Ernährung"
        area="food"
        actions={
          <>
            <Link to="/nutrition/stats" aria-label="Ernährungsstatistik" className="flex h-10 w-10 items-center justify-center rounded-full bg-elevated transition hover:bg-line">
              <BarChart3 size={19} />
            </Link>
            <Link to="/nutrition/foods" aria-label="Lebensmittel & Rezepte" className="flex h-10 w-10 items-center justify-center rounded-full bg-elevated transition hover:bg-line">
              <Apple size={19} />
            </Link>
            <Link to="/nutrition/profile" aria-label="Ernährungsprofil" className="flex h-10 w-10 items-center justify-center rounded-full bg-elevated transition hover:bg-line">
              <UserCog size={19} />
            </Link>
          </>
        }
      />

      {/* date navigation */}
      <div className="mb-5 flex items-center gap-2">
        <IconButton label="Vorheriger Tag" variant="secondary" onClick={() => setDate(addDays(date, -1))}>
          <ChevronLeft size={20} />
        </IconButton>
        <button onClick={() => setCalendar(true)} className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-elevated text-[14px] font-bold" aria-label="Datum wählen">
          <CalendarDays size={16} className="text-muted" />
          {relativeDayKey(date, today)}
        </button>
        <IconButton label="Nächster Tag" variant="secondary" onClick={() => setDate(addDays(date, 1))} disabled={date >= today}>
          <ChevronRight size={20} />
        </IconButton>
      </div>

      {/* summary */}
      <section className="card p-4" aria-label="Tagesübersicht">
        <div className="flex items-center gap-4">
          <KcalRing value={totals.kcal} target={targets.kcal} />
          <div className="min-w-0 flex-1 space-y-2">
            <div>
              <div className="text-[12px] font-semibold text-muted">{kcalLeft == null ? 'Kein Kalorienziel' : kcalLeft >= 0 ? 'Verbleibend' : 'Über dem Ziel'}</div>
              <div className={clsx('num text-[26px] font-bold leading-tight', kcalLeft != null && kcalLeft < 0 && 'text-warn')}>
                {kcalLeft == null ? '–' : `${fmtNumber(Math.abs(kcalLeft), 0)} kcal`}
              </div>
              {totals.incomplete.includes('kcal') && <div className="text-[11px] text-subtle">mind. – einige Einträge ohne Kalorienangabe</div>}
            </div>
            {targets.kcal == null ? (
              <Link to="/nutrition/profile" className="chip-food block rounded-xl bg-[rgb(var(--chip)/0.14)] px-2.5 py-1.5 text-[12px] font-semibold text-[rgb(var(--chip))]">
                Profil ausfüllen, um dein Kalorienziel zu berechnen →
              </Link>
            ) : (
              <div className="text-[11px] text-subtle">
                Ziel {fmtNumber(targets.kcal, 0)} kcal · {targets.manual.kcal ? 'manuell' : 'Schätzwert'}
                {targets.activeBonus > 0 && ` · inkl. ${fmtNumber(targets.activeBonus, 0)} kcal Aktivität`}
              </div>
            )}
          </div>
        </div>
        <div className="mt-4 space-y-3">
          <MacroBar label="Protein" value={totals.protein} target={targets.protein} unit="g" incomplete={totals.incomplete.includes('protein')} />
          <MacroBar label="Kohlenhydrate" value={totals.carbs} target={targets.carbs} unit="g" incomplete={totals.incomplete.includes('carbs')} />
          <MacroBar label="Fett" value={totals.fat} target={targets.fat} unit="g" incomplete={totals.incomplete.includes('fat')} />
        </div>
        <div className="num mt-3 grid grid-cols-4 gap-1.5 text-center">
          {(
            [
              ['Ballastst.', totals.fiber, 'fiber'],
              ['Zucker', totals.sugar, 'sugar'],
              ['Ges. FS', totals.satFat, 'satFat'],
              ['Salz', totals.salt, 'salt'],
            ] as const
          ).map(([l, v, k]) => (
            <div key={k} className="rounded-xl bg-elevated/70 px-1 py-2">
              <div className="text-[13px] font-bold">
                {totals.incomplete.includes(k) && entries?.length ? '≥' : ''}
                {fmtNumber(v, k === 'salt' ? 1 : 0)} g
              </div>
              <div className="text-[10.5px] text-muted">{l}</div>
            </div>
          ))}
        </div>
        {hints.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {hints.map((h) => (
              <li key={h} className="flex gap-2 rounded-xl bg-area-food/10 px-3 py-2 text-[13px]">
                <Info size={14} className="mt-0.5 shrink-0" /> {h}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* meals */}
      <div className="mt-4 space-y-3">
        {MEALS.map((m) => {
          const list = byMeal.get(m.key) ?? [];
          const t = sumNutrients(list.map(entryNutrients));
          return (
            <section key={m.key} className="card p-3" aria-label={m.label}>
              <div className="flex items-center gap-2 px-1">
                <div className="min-w-0 flex-1">
                  <h2 className="text-[16px] font-bold">{m.label}</h2>
                  <div className="num text-[12px] text-muted">{list.length ? `${fmtNumber(t.kcal, 0)} kcal · P ${fmtNumber(t.protein, 0)} · K ${fmtNumber(t.carbs, 0)} · F ${fmtNumber(t.fat, 0)}` : 'Noch nichts erfasst'}</div>
                </div>
                {list.length > 0 && (
                  <IconButton label={`${m.label} – Optionen`} onClick={() => setMealMenu(m.key)}>
                    <MoreHorizontal size={19} />
                  </IconButton>
                )}
                <IconButton label={`Zu ${m.label} hinzufügen`} variant="secondary" onClick={() => setAdding(m.key)}>
                  <Plus size={19} />
                </IconButton>
              </div>
              {list.length > 0 && (
                <ul className="mt-2 divide-y divide-line/50">
                  {list.map((e) => {
                    const n = entryNutrients(e);
                    return (
                      <li key={e.id}>
                        <button onClick={() => setEditing(e)} className="flex w-full items-center gap-3 rounded-lg px-1 py-2.5 text-left hover:bg-elevated/50">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate text-[14px] font-semibold">{e.name}</span>
                              {e.incomplete && <Badge tone="warn">unvollst.</Badge>}
                            </div>
                            <div className="truncate text-[12px] text-muted">
                              {fmtNumber(e.amount, 1)} {e.unit === 'portion' ? (e.amount === 1 ? 'Portion' : 'Portionen') : e.unit}
                              {e.brand ? ` · ${e.brand}` : ''} · <MacroLine n={n} />
                            </div>
                          </div>
                          <span className="num shrink-0 text-[14px] font-bold">{n.kcal == null ? '?' : fmtNumber(n.kcal, 0)} kcal</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {!entries?.length && date === today && (
        <Button variant="primary" size="xl" block className="mt-4" onClick={() => setAdding(defaultMeal())} icon={<Plus size={20} />}>
          Erstes Lebensmittel erfassen
        </Button>
      )}

      <AddFoodSheet open={!!adding} onClose={() => setAdding(null)} date={date} meal={adding ?? 'snack'} />
      <EntrySheet entry={editing} onClose={() => setEditing(null)} />
      <MealMenu date={date} meal={mealMenu} onClose={() => setMealMenu(null)} />
      <CalendarSheet open={calendar} onClose={() => setCalendar(false)} value={date} onPick={(d) => (setDate(d), setCalendar(false))} />
    </div>
  );
}

function EntrySheet({ entry, onClose }: { entry: FoodLogEntry | null; onClose: () => void }) {
  const { toast } = useFeedback();
  const [amount, setAmount] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [lastId, setLastId] = useState<string | null>(null);
  if (entry && entry.id !== lastId) {
    setLastId(entry.id);
    setAmount(String(entry.amount).replace('.', ','));
    setErr(null);
  }
  const qty = parseDecimal(amount);
  const preview = entry && qty ? entryNutrients({ ...entry, amount: qty }) : null;
  const unitLabel = entry?.unit === 'portion' ? 'Portionen' : entry?.unit;

  return (
    <Sheet
      open={!!entry}
      onClose={onClose}
      title={entry?.name}
      footer={
        <div className="flex gap-2">
          <Button
            variant="danger"
            size="lg"
            icon={<Trash2 size={17} />}
            onClick={async () => {
              if (!entry) return;
              const removed = await deleteEntry(entry.id);
              onClose();
              toast(`${entry.name} entfernt`, 'info', removed ? { label: 'Rückgängig', onClick: () => void restoreEntry(removed) } : undefined);
            }}
          >
            Entfernen
          </Button>
          <Button
            variant="primary"
            size="lg"
            block
            onClick={async () => {
              if (!entry || qty == null) return setErr('Bitte eine Menge eingeben.');
              try {
                await updateEntryAmount(entry.id, qty);
                onClose();
              } catch (e) {
                setErr((e as Error).message);
              }
            }}
          >
            Speichern
          </Button>
        </div>
      }
    >
      {entry && (
        <div className="space-y-4">
          <label className="block">
            <span className="label mb-1.5 block">Menge ({unitLabel})</span>
            <input className="field num text-center text-xl font-bold" inputMode="decimal" value={amount} onChange={(e) => (setAmount(e.target.value.replace(/[^\d.,]/g, '')), setErr(null))} />
          </label>
          <div>
            <span className="label mb-1.5 flex items-center gap-1">
              <ArrowRightLeft size={11} /> Mahlzeit
            </span>
            <div className="grid grid-cols-4 gap-1.5">
              {MEALS.map((m) => (
                <button
                  key={m.key}
                  onClick={async () => {
                    await moveEntry(entry.id, m.key);
                    onClose();
                  }}
                  className={clsx('rounded-lg py-2 text-[12px] font-semibold', entry.meal === m.key ? 'bg-fg text-bg' : 'bg-elevated text-muted')}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          {preview && <NutrientTable n={preview} />}
          <p className="text-[11px] text-subtle">
            Quelle: {entry.source === 'off' ? 'Open Food Facts' : entry.source === 'recipe' ? 'Rezept' : 'Eigenes Lebensmittel'} · Nährwerte zum Zeitpunkt der Erfassung gespeichert
          </p>
          {err && <p className="text-sm text-bad">{err}</p>}
        </div>
      )}
    </Sheet>
  );
}

function MealMenu({ date, meal, onClose }: { date: string; meal: MealSlot | null; onClose: () => void }) {
  const { toast } = useFeedback();
  const [copyOpen, setCopyOpen] = useState(false);
  const [recipeOpen, setRecipeOpen] = useState(false);
  const [target, setTarget] = useState({ date: dayKey(), meal: meal ?? 'breakfast' as MealSlot });
  const [current, setCurrent] = useState<MealSlot | null>(null);
  if (meal && meal !== current) {
    setCurrent(meal);
    setTarget({ date: dayKey(), meal });
  }
  const label = MEALS.find((m) => m.key === (meal ?? current))?.label;

  return (
    <>
      <Sheet open={!!meal && !copyOpen && !recipeOpen} onClose={onClose} title={label}>
        <MenuList>
          {date !== dayKey() && (
            <MenuItem
              icon={<Copy size={18} />}
              onClick={async () => {
                const n = await copyMeal(date, meal!, dayKey(), meal!);
                toast(`${n} Einträge zu heute kopiert`, 'success');
                onClose();
              }}
            >
              Nach heute kopieren
            </MenuItem>
          )}
          <MenuItem icon={<CalendarDays size={18} />} onClick={() => setCopyOpen(true)}>
            Kopieren nach …
          </MenuItem>
          <MenuItem icon={<Save size={18} />} onClick={() => setRecipeOpen(true)}>
            Als Rezept / Mahlzeit speichern
          </MenuItem>
        </MenuList>
      </Sheet>
      <Sheet
        open={copyOpen}
        onClose={() => (setCopyOpen(false), onClose())}
        title={`${label} kopieren`}
        footer={
          <Button
            variant="primary"
            size="lg"
            block
            onClick={async () => {
              const n = await copyMeal(date, current!, target.date, target.meal);
              toast(`${n} Einträge kopiert`, 'success');
              setCopyOpen(false);
              onClose();
            }}
          >
            Kopieren
          </Button>
        }
      >
        <label className="block">
          <span className="label mb-1.5 block">Zieldatum</span>
          <input type="date" className="field" value={target.date} onChange={(e) => e.target.value && setTarget((t) => ({ ...t, date: e.target.value }))} />
        </label>
        <div className="mt-4 grid grid-cols-4 gap-1.5">
          {MEALS.map((m) => (
            <button key={m.key} onClick={() => setTarget((t) => ({ ...t, meal: m.key }))} className={clsx('rounded-lg py-2 text-[12px] font-semibold', target.meal === m.key ? 'bg-fg text-bg' : 'bg-elevated text-muted')}>
              {m.label}
            </button>
          ))}
        </div>
      </Sheet>
      <RenameSheet
        open={recipeOpen}
        onClose={() => (setRecipeOpen(false), onClose())}
        value={label ?? ''}
        title="Als Rezept speichern"
        onSave={async (name) => {
          await recipeFromMeal(date, current!, name);
          toast('Rezept gespeichert – unter „Rezepte“ wiederverwendbar', 'success');
        }}
      />
    </>
  );
}

function CalendarSheet({ open, onClose, value, onPick }: { open: boolean; onClose: () => void; value: string; onPick: (d: string) => void }) {
  const [month, setMonth] = useState(value.slice(0, 7));
  const days = useLiveQuery(async () => {
    const list = await db.foodLog.where('date').between(`${month}-01`, `${month}-31`, true, true).toArray();
    const m = new Map<string, number>();
    for (const e of list) m.set(e.date, (m.get(e.date) ?? 0) + (entryNutrients(e).kcal ?? 0));
    return m;
  }, [month]);
  const [y, mo] = month.split('-').map(Number);
  const first = new Date(y, mo - 1, 1);
  const offset = (first.getDay() + 6) % 7;
  const count = new Date(y, mo, 0).getDate();
  const today = dayKey();
  const shift = (d: number) => {
    const t = new Date(y, mo - 1 + d, 1);
    setMonth(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`);
  };
  return (
    <Sheet open={open} onClose={onClose} title="Tag wählen">
      <div className="mb-3 flex items-center justify-between">
        <IconButton label="Vorheriger Monat" onClick={() => shift(-1)}>
          <ChevronLeft size={20} />
        </IconButton>
        <span className="font-bold">{new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }).format(first)}</span>
        <IconButton label="Nächster Monat" onClick={() => shift(1)} disabled={month >= today.slice(0, 7)}>
          <ChevronRight size={20} />
        </IconButton>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-subtle">
        {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {Array.from({ length: offset }, (_, i) => (
          <span key={`o${i}`} />
        ))}
        {Array.from({ length: count }, (_, i) => {
          const d = `${month}-${String(i + 1).padStart(2, '0')}`;
          const has = days?.has(d);
          return (
            <button
              key={d}
              disabled={d > today}
              onClick={() => onPick(d)}
              className={clsx(
                'num flex aspect-square flex-col items-center justify-center rounded-xl text-[13px] font-semibold transition disabled:opacity-30',
                d === value ? 'bg-fg text-bg' : has ? 'bg-area-food/15' : 'bg-elevated/60',
              )}
            >
              {i + 1}
              {has && <span className={clsx('mt-0.5 h-1 w-1 rounded-full', d === value ? 'bg-bg' : 'bg-area-food')} />}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-[12px] text-subtle">Markierte Tage enthalten Einträge.</p>
    </Sheet>
  );
}
