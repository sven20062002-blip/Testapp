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
  const moreActive = secondary.some((n) => loc.pathname.startsWith(n.to));

  return (
    <div className="min-h-dvh lg:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line/70 bg-surface/60 px-4 py-6 lg:flex">
        <div className="mb-8 flex items-center gap-2.5 px-2">
          <Logo size={34} />
          <div>
            <div className="text-lg font-bold leading-none tracking-tight">Forge</div>
            <div className="mt-0.5 text-[11px] font-medium text-subtle">Workout Tracker</div>
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
                      'flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-semibold transition',
                      isActive ? 'bg-elevated text-fg' : 'text-muted hover:bg-elevated/60 hover:text-fg',
                    )
                  }
                >
                  <I size={19} className={area ? `text-area-${area}` : undefined} />
                  {label}
                  {to === '/workout' && active && <span className="ml-auto h-2 w-2 animate-pulse-ring rounded-full bg-accent" />}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        {!online && (
          <div className="mt-auto flex items-center gap-2 rounded-xl bg-elevated px-3 py-2 text-xs font-medium text-muted">
            <WifiOff size={14} /> Offline – alles wird lokal gespeichert
          </div>
        )}
      </aside>

      <main className="min-w-0 flex-1">
        {!online && (
          <div className="flex items-center justify-center gap-2 bg-elevated py-1 text-xs font-medium text-muted lg:hidden" style={{ paddingTop: 'calc(var(--safe-top) + 4px)' }}>
            <WifiOff size={13} /> Offline-Modus – Daten werden lokal gespeichert
          </div>
        )}
        <Outlet />
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
            <NavLink key={to} to={to} end={to === '/'} data-tour={`nav-${to}`} className="relative flex flex-1 flex-col items-center justify-center gap-[3px]">
              {({ isActive }) =>
                center ? (
                  <>
                    <span
                      className={clsx(
                        'flex h-10 w-10 items-center justify-center rounded-full transition',
                        active ? 'animate-pulse-ring bg-accent text-accent-fg' : isActive ? 'bg-accent text-accent-fg' : 'bg-elevated text-fg',
                      )}
                    >
                      <I size={20} strokeWidth={2.2} />
                    </span>
                    <span className={clsx('text-[10px] font-medium', isActive || active ? 'text-fg' : 'text-subtle')}>{active ? 'Läuft' : label}</span>
                  </>
                ) : (
                  <>
                    <I size={22} strokeWidth={isActive ? 2.2 : 1.8} className={clsx('transition', isActive ? (area ? `text-area-${area}` : 'text-fg') : 'text-subtle')} />
                    <span className={clsx('text-[10px] font-medium transition', isActive ? 'text-fg' : 'text-subtle')}>{label}</span>
                  </>
                )
              }
            </NavLink>
          ))}
          <button onClick={() => setMore(true)} data-tour="nav-more" className="flex flex-1 flex-col items-center justify-center gap-[3px]" aria-label="Weitere Bereiche">
            <MoreHorizontal size={22} strokeWidth={moreActive ? 2.2 : 1.8} className={moreActive ? 'text-fg' : 'text-subtle'} />
            <span className={clsx('text-[10px] font-medium', moreActive ? 'text-fg' : 'text-subtle')}>Mehr</span>
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
                'flex flex-col items-center gap-2 rounded-2xl px-2 py-4 text-[13px] font-medium transition',
                loc.pathname.startsWith(to) ? 'bg-elevated ring-1 ring-fg/10' : 'hover:bg-elevated',
              )}
            >
              <span className={clsx('chip h-11 w-11 rounded-2xl', `chip-${area ?? 'train'}`, !area && 'text-fg')}>
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
