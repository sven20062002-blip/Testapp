import { useCallback, useEffect, useLayoutEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Apple, ArrowLeft, ArrowRight, Home, MoreHorizontal, Timer, Users, X } from 'lucide-react';
import { db } from '@/db/db';
import { Button } from '@/components/ui/Button';
import { TOUR, type TourIcon } from './steps';
import { KettliIcon } from '@/pet/KettliIcon';
import { finishTour, loadTourStep, rememberTourOrigin, saveTourStep, tourOrigin } from './state';

const ICONS: Record<TourIcon, ReactNode> = {
  home: <Home size={20} />,
  train: <Timer size={20} />,
  food: <Apple size={20} />,
  social: <Users size={20} />,
  more: <MoreHorizontal size={20} />,
  pet: <KettliIcon size={20} />,
};

/** first target that is actually rendered and visible (phone bottom bar vs. desktop sidebar) */
function findTarget(selectors: string[] | undefined): DOMRect | null {
  for (const sel of selectors ?? []) {
    for (const el of Array.from(document.querySelectorAll(sel))) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden') return r;
    }
  }
  return null;
}

/**
 * Guided walkthrough shown once after the onboarding: dims the app, highlights the navigation entry
 * of each area and shows the matching page behind it. The current station is stored, so leaving
 * the app mid-tour resumes at the same place.
 */
export function AppTour() {
  const settings = useLiveQuery(() => db.settings.get('settings'), []);
  const open = !!settings?.onboardedAt && !settings.tourSeenAt;
  return open ? <TourOverlay /> : null;
}

function TourOverlay() {
  const nav = useNavigate();
  const loc = useLocation();
  const [i, setI] = useState(loadTourStep);
  // must run before the first navigation below
  useState(() => rememberTourOrigin(loc.pathname + loc.search));
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [vw, setVw] = useState(() => window.innerWidth);
  const [vh, setVh] = useState(() => window.innerHeight);
  const step = TOUR[i];
  const last = i === TOUR.length - 1;

  useEffect(() => saveTourStep(i), [i]);

  // show the page that belongs to the station
  useEffect(() => {
    if (loc.pathname !== step.route) nav(step.route);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.route]);

  // keep the spotlight on its target (layout shifts while the page loads, rotation, resize)
  useLayoutEffect(() => {
    const measure = () => {
      setRect(findTarget(step.target));
      setVw(window.innerWidth);
      setVh(window.innerHeight);
    };
    measure();
    const id = setInterval(measure, 250);
    window.addEventListener('resize', measure);
    return () => {
      clearInterval(id);
      window.removeEventListener('resize', measure);
    };
  }, [step]);

  const close = useCallback(() => {
    nav(tourOrigin(), { replace: true }); // back to where the tour started (e.g. an invite link)
    void finishTour();
  }, [nav]);
  const go = useCallback((d: number) => setI((x) => Math.min(TOUR.length - 1, Math.max(0, x + d))), []);
  const next = () => (last ? close() : go(1));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close, go]);

  // card placement: above a target in the lower half (phone bottom bar), right of a sidebar target, otherwise centred
  const PAD = 6;
  // no target → centred by a flex wrapper (a transform would clash with the entry animation)
  let card: CSSProperties | null = null;
  if (rect) {
    if (vw >= 1024 && rect.right < vw / 2) card = { left: rect.right + 28, top: Math.min(Math.max(16, rect.top - 60), vh - 420) };
    else if (rect.top > vh / 2) card = { left: 16, right: 16, bottom: vh - rect.top + PAD + 18 };
    else card = { left: 16, right: 16, top: rect.bottom + PAD + 18 };
  }

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-labelledby="tour-title" data-testid="app-tour">
      {/* dim layer; the spotlight is a transparent hole made with a huge box-shadow */}
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-2xl ring-2 ring-white/90 transition-all duration-300 ease-out"
          style={{
            left: rect.left - PAD,
            top: rect.top - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: '0 0 0 9999px rgb(0 0 0 / 0.58)',
          }}
        />
      ) : (
        <div className="absolute inset-0 animate-fade-in bg-black/60" />
      )}

      <div className={clsx(!card && 'absolute inset-0 flex items-center justify-center p-4')}>
        <section
          key={step.id}
          className={clsx(`chip-${step.area} mx-auto max-w-sm animate-rise rounded-3xl bg-surface p-5 text-fg shadow-[0_20px_60px_-15px_rgb(0_0_0/0.5)]`, card ? 'absolute' : 'w-full')}
          style={card ?? undefined}
        >
          <div className="flex items-start justify-between gap-3">
            <span className={clsx('chip h-11 w-11', `chip-${step.area}`)}>{ICONS[step.icon]}</span>
            <button
              onClick={close}
              className="-mr-1.5 -mt-1 flex h-9 items-center gap-1 rounded-full px-2.5 text-[12.5px] font-medium text-subtle hover:bg-elevated hover:text-fg"
              aria-label="Tour beenden"
            >
              Beenden <X size={15} />
            </button>
          </div>
          <div className="mt-3 text-[11.5px] font-semibold text-muted">
            {i + 1} / {TOUR.length}
          </div>
          <h2 id="tour-title" className="mt-0.5 text-[21px] font-bold tracking-tight">
            {step.title}
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">{step.text}</p>
          {step.bullets && (
            <ul className="mt-3 space-y-1.5">
              {step.bullets.map((b) => (
                <li key={b} className="flex gap-2.5 text-[13px] leading-snug">
                  <span className={clsx('nav-dot mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full')} />
                  {b}
                </li>
              ))}
            </ul>
          )}
          {step.note && <p className="mt-3 rounded-xl bg-elevated/70 px-3 py-2.5 text-[12.5px] leading-relaxed text-muted">{step.note}</p>}

          <div className="mt-5 flex items-center gap-2">
            {i > 0 ? (
              <Button variant="ghost" size="md" onClick={() => go(-1)} icon={<ArrowLeft size={16} />} aria-label="Zurück">
                <span className="sr-only">Zurück</span>
              </Button>
            ) : (
              <span className="w-11" />
            )}
            <div className="flex flex-1 justify-center gap-1.5" aria-hidden>
              {TOUR.map((s, k) => (
                <span key={s.id} className={clsx('h-1.5 rounded-full transition-all', k === i ? 'nav-dot w-5' : 'w-1.5 bg-line')} />
              ))}
            </div>
            <Button variant="primary" size="md" onClick={next}>
              {last ? "Los geht's" : 'Weiter'}
              {!last && <ArrowRight size={16} />}
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
