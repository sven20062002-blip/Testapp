import { lazy, Suspense, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';

const Onboarding = lazy(() => import('./Onboarding'));

/** Shows the onboarding until it was completed or skipped (settings.onboardedAt). */
export function OnboardingGate({ children }: { children: ReactNode }) {
  const done = useLiveQuery(async () => !!(await db.settings.get('settings'))?.onboardedAt, []);
  if (done === undefined) return <div className="min-h-[100dvh] bg-bg" />;
  if (!done)
    return (
      <div className="min-h-[100dvh] bg-surface dark:bg-bg">
        <Suspense fallback={null}>
          <Onboarding />
        </Suspense>
      </div>
    );
  return <>{children}</>;
}
