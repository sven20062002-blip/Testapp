import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { MoreHorizontal, WifiOff } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { NAV } from './nav';
import { ActiveWorkoutBar } from './ActiveWorkoutBar';
import { useActiveWorkout, useOnline } from '@/hooks/useData';
import { Logo } from './Logo';
import { AppTour } from '@/tour/AppTour';

export function AppShell() {
  const active = useActiveWorkout();
  const online = useOnline();
  const loc = useLocation();
  const onWorkout = loc.pathname.startsWith('/workout');
  const nav = useNavigate();
  const [more, setMore] = useState(false);
  const secondary = NAV.filter((n) => !n.primary);
  const moreItem = secondary.find((n) => loc.pathname.startsWith(n.to));
  const moreActive = !!moreItem;
  // "Mehr" takes the colour of the area that is currently open behind it
  const moreArea = moreItem?.area ?? 'neutral';

  return (
    <div className="min-h-dvh lg:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line/70 bg-surface/60 px-4 py-6 lg:flex">
        <div className="mb-8 flex items-center gap-2.5 px-2">
          <Logo size={34} />
          <div>
            <div className="text-[16.5px] font-bold leading-none tracking-tight">heben</div>
            <div className="mt-0.5 text-[10.5px] font-medium text-subtle">Fitness &amp; Lifestyle</div>
          </div>
        </div>
        <nav className="flex flex-col gap-0.5 overflow-y-auto" aria-label="Hauptnavigation">
          {(['Heute', 'Training', 'Freunde', 'Körper & Ernährung', 'App'] as const).map((g) => (
            <div key={g} className="mb-3">
              {g !== 'Heute' && <div className="label mb-1 px-3">{g}</div>}
              {NAV.filter((n) => n.group === g).map(({ to, label, icon: I, area }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  data-tour={`nav-${to}`}
                  className={({ isActive }) =>
                    clsx(
                      `chip-${area ?? 'neutral'} flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-semibold transition`,
                      isActive ? 'nav-pill text-fg' : 'text-muted hover:bg-elevated/60 hover:text-fg',
                    )
                  }
                >
                  <I size={18} className="nav-ink" />
                  {label}
                  {to === '/workout' && active && <span className="ml-auto h-2 w-2 animate-pulse-ring rounded-full bg-accent" />}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        {!online && (
          <div className="mt-auto flex items-center gap-2 rounded-xl bg-elevated px-3 py-2 text-[11.5px] font-medium text-muted">
            <WifiOff size={14} /> Offline – alles wird lokal gespeichert
          </div>
        )}
      </aside>

      <main className="min-w-0 flex-1">
        {!online && (
          <div className="flex items-center justify-center gap-2 bg-elevated py-1 text-[11.5px] font-medium text-muted lg:hidden" style={{ paddingTop: 'calc(var(--safe-top) + 4px)' }}>
            <WifiOff size={13} /> Offline-Modus – Daten werden lokal gespeichert
          </div>
        )}
        {/* keyed by path → every page change plays the entry animation */}
        <div key={loc.pathname} className="page-transition">
          <Outlet />
        </div>
      </main>

      {active && !onWorkout && <ActiveWorkoutBar workout={active} />}

      {/* Mobile bottom navigation – floating glass pill */}
      <nav
        aria-label="Hauptnavigation"
        className="fixed inset-x-0 bottom-0 z-40 px-3 lg:hidden"
        style={{ paddingBottom: 'calc(var(--safe-bottom) + 8px)' }}
      >
        <div className="mx-auto flex h-[var(--nav-h)] max-w-md items-stretch justify-around rounded-[26px] bg-surface/80 px-1.5 shadow-[0_10px_40px_-10px_rgb(0_0_0/0.45),0_0_0_0.5px_rgb(var(--fg)/0.08)] backdrop-blur-2xl backdrop-saturate-150">
          {NAV.filter((n) => n.primary).map(({ to, label, icon: I, center, area }) => (
            <NavLink key={to} to={to} end={to === '/'} data-tour={`nav-${to}`} className={`chip-${area ?? 'neutral'} relative flex flex-1 flex-col items-center justify-center gap-[3px]`}>
              {({ isActive }) => (
                <>
                  <span className={clsx('nav-ink relative flex h-8 w-14 items-center justify-center rounded-full transition', isActive && 'nav-pill nav-pop')}>
                    <I size={21} strokeWidth={isActive ? 2.3 : 1.9} />
                    {center && active && <span className="nav-dot absolute right-2.5 top-1 h-2 w-2 animate-pulse rounded-full" aria-hidden />}
                  </span>
                  <span className={clsx('text-[10px] leading-none transition', isActive ? 'nav-ink font-semibold' : 'font-medium text-subtle')}>{center && active ? 'Läuft' : label}</span>
                </>
              )}
            </NavLink>
          ))}
          <button onClick={() => setMore(true)} data-tour="nav-more" className={`chip-${moreArea} flex flex-1 flex-col items-center justify-center gap-[3px]`} aria-label="Weitere Bereiche">
            <span className={clsx('nav-ink flex h-8 w-14 items-center justify-center rounded-full transition', moreActive && 'nav-pill nav-pop')}>
              <MoreHorizontal size={21} strokeWidth={moreActive ? 2.3 : 1.9} />
            </span>
            <span className={clsx('text-[10px] leading-none', moreActive ? 'nav-ink font-semibold' : 'font-medium text-subtle')}>Mehr</span>
          </button>
        </div>
      </nav>

      <AppTour />

      <Sheet open={more} onClose={() => setMore(false)} title="Weitere Bereiche">
        <div className="grid grid-cols-3 gap-2">
          {secondary.map(({ to, label, icon: I, area }) => (
            <button
              key={to}
              onClick={() => {
                setMore(false);
                nav(to);
              }}
              className={clsx(
                `chip-${area ?? 'neutral'} flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-[12.5px] font-medium transition`,
                loc.pathname.startsWith(to) ? 'nav-pill' : 'hover:bg-elevated',
              )}
            >
              <span className={clsx('chip h-10 w-10 rounded-2xl', `chip-${area ?? 'neutral'}`)}>
                <I size={21} />
              </span>
              {label}
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
