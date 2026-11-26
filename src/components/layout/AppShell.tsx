import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { MoreHorizontal, WifiOff } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { NAV } from './nav';
import { ActiveWorkoutBar } from './ActiveWorkoutBar';
import { useActiveWorkout, useOnline } from '@/hooks/useData';
import { Logo } from './Logo';

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
            <div className="text-lg font-extrabold leading-none tracking-tight">Forge</div>
            <div className="mt-0.5 text-[11px] font-medium text-subtle">Workout Tracker</div>
          </div>
        </div>
        <nav className="flex flex-col gap-0.5 overflow-y-auto" aria-label="Hauptnavigation">
          {(['Heute', 'Training', 'Körper & Ernährung', 'App'] as const).map((g) => (
            <div key={g} className="mb-3">
              {g !== 'Heute' && <div className="label mb-1 px-3">{g}</div>}
              {NAV.filter((n) => n.group === g).map(({ to, label, icon: I }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  className={({ isActive }) =>
                    clsx(
                      'flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-semibold transition',
                      isActive ? 'bg-elevated text-fg' : 'text-muted hover:bg-elevated/60 hover:text-fg',
                    )
                  }
                >
                  <I size={19} />
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

      {/* Mobile bottom navigation */}
      <nav
        aria-label="Hauptnavigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line/70 bg-bg/85 backdrop-blur-xl lg:hidden"
        style={{ paddingBottom: 'var(--safe-bottom)' }}
      >
        <div className="mx-auto flex h-[var(--nav-h)] max-w-lg items-stretch justify-around px-1">
          {NAV.filter((n) => n.primary).map(({ to, label, icon: I, center }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                clsx('relative flex flex-1 flex-col items-center justify-center gap-1 text-[10.5px] font-semibold transition', isActive ? 'text-fg' : 'text-subtle')
              }
            >
              {({ isActive }) =>
                center ? (
                  <>
                    <span
                      className={clsx(
                        'flex h-9 w-14 items-center justify-center rounded-2xl transition',
                        active ? 'bg-accent text-accent-fg animate-pulse-ring' : isActive ? 'bg-fg text-bg' : 'bg-elevated text-fg',
                      )}
                    >
                      <I size={20} strokeWidth={2.3} />
                    </span>
                    {active ? 'Läuft' : label}
                  </>
                ) : (
                  <>
                    <I size={22} strokeWidth={isActive ? 2.4 : 1.9} />
                    {label}
                  </>
                )
              }
            </NavLink>
          ))}
          <button
            onClick={() => setMore(true)}
            className={clsx('flex flex-1 flex-col items-center justify-center gap-1 text-[10.5px] font-semibold transition', moreActive ? 'text-fg' : 'text-subtle')}
            aria-label="Weitere Bereiche"
          >
            <MoreHorizontal size={22} strokeWidth={moreActive ? 2.4 : 1.9} />
            Mehr
          </button>
        </div>
      </nav>

      <Sheet open={more} onClose={() => setMore(false)} title="Weitere Bereiche">
        <div className="grid grid-cols-3 gap-2">
          {secondary.map(({ to, label, icon: I }) => (
            <button
              key={to}
              onClick={() => {
                setMore(false);
                nav(to);
              }}
              className={clsx(
                'flex flex-col items-center gap-2 rounded-2xl px-2 py-4 text-[13px] font-semibold transition',
                loc.pathname.startsWith(to) ? 'bg-accent text-accent-fg' : 'bg-elevated text-fg hover:bg-line',
              )}
            >
              <I size={22} />
              {label}
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
