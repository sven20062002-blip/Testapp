import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { applyInviteParams } from '@/social/config';
import { resetClient } from '@/social/client';
import { refreshSocial } from '@/social/hooks';
import { useFeedback } from '@/components/ui/Feedback';
import { Link } from 'react-router-dom';
import { CloudOff, UserCog, Users } from 'lucide-react';
import { useSocial } from '@/social/hooks';
import { useOnline } from '@/hooks/useData';
import { PageHeader } from '@/components/ui/PageHeader';
import { Segmented } from '@/components/ui/Segmented';
import { AuthForm, ProfileForm, ServerSetup } from '@/components/social/SocialSetup';
import { Avatar } from '@/components/social/Avatar';
import { FeedTab } from '@/components/social/FeedTab';
import { FriendsTab } from '@/components/social/FriendsTab';
import { LeaderboardTab } from '@/components/social/LeaderboardTab';
import { ChallengesTab } from '@/components/social/ChallengesTab';
import { DuelsTab } from '@/components/social/DuelsTab';

type Tab = 'feed' | 'duels' | 'challenges' | 'ranks' | 'friends';
const TAB_KEY = 'forge-social-tab';

export default function SocialPage() {
  const s = useSocial();
  const online = useOnline();
  const { toast } = useFeedback();
  const [params, setParams] = useSearchParams();
  const [invitedBy, setInvitedBy] = useState<string | null>(null);

  // invite link: /social?sb=…&key=…&from=username
  useEffect(() => {
    if (!params.get('sb') && !params.get('from')) return;
    const r = applyInviteParams(params.toString());
    if (r.error) toast(r.error, 'warn');
    if (r.applied) {
      resetClient();
      refreshSocial();
    }
    if (r.from) setInvitedBy(r.from.replace(/[^a-z0-9_]/g, ''));
    setParams({}, { replace: true });
  }, [params, setParams, toast]);
  const [tab, setTabState] = useState<Tab>(() => {
    try {
      return (sessionStorage.getItem(TAB_KEY) as Tab) || 'feed';
    } catch {
      return 'feed';
    }
  });
  const setTab = (t: Tab) => {
    setTabState(t);
    try {
      sessionStorage.setItem(TAB_KEY, t);
    } catch {
      /* ignore */
    }
  };

  const header = (
    <PageHeader
      title="Freunde"
      area="social"
      subtitle={s.status === 'ready' ? undefined : 'Gemeinsam trainieren, Duelle & Ranglisten'}
      actions={
        s.status === 'ready' ? (
          <Link to="/social/account" aria-label="Konto & Datenschutz" className="flex items-center gap-2 rounded-full bg-elevated py-1 pl-1 pr-3 transition hover:bg-line">
            <Avatar name={s.profile.display_name} color={s.profile.color} size={32} />
            <UserCog size={16} className="text-muted" />
          </Link>
        ) : undefined
      }
    />
  );

  return (
    <div className="page">
      {header}
      {!online && (
        <div className="mb-4 flex items-center gap-2 rounded-2xl bg-elevated px-4 py-3 text-[13px] text-muted">
          <CloudOff size={16} /> Offline – Freunde-Funktionen brauchen eine Internetverbindung. Workouts werden später automatisch übertragen.
        </div>
      )}
      {invitedBy && s.status !== 'ready' && (
        <div className="mb-4 rounded-2xl bg-area-social/10 px-4 py-3 text-[14px] ring-1 ring-area-social/30">
          <b>@{invitedBy}</b> hat dich eingeladen. Erstelle ein Konto – danach kannst du @{invitedBy} unter „Freunde“ hinzufügen.
        </div>
      )}
      {s.status === 'unconfigured' && <ServerSetup />}
      {s.status === 'loading' && <div className="card h-40 animate-pulse" />}
      {s.status === 'signedOut' && <AuthForm />}
      {s.status === 'needsProfile' && (
        <div className="card p-5">
          <span className="chip chip-social h-11 w-11 rounded-2xl">
            <Users size={22} />
          </span>
          <h2 className="mt-4 text-[20px] font-semibold">Dein Profil</h2>
          <p className="mb-5 mt-1 text-[14px] text-muted">So sehen dich deine Freunde.</p>
          <ProfileForm userId={s.session.user.id} firstTime submitLabel="Loslegen" />
        </div>
      )}
      {s.status === 'ready' && (
        <>
          <div className="scroll-x -mx-4 mb-5 px-4 sm:-mx-6 sm:px-6">
            <Segmented
              className="min-w-full"
              value={tab}
              onChange={setTab}
              size="sm"
              label="Bereich"
              options={[
                { value: 'feed', label: 'Feed' },
                { value: 'duels', label: 'Duelle' },
                { value: 'challenges', label: 'Challenges' },
                { value: 'ranks', label: 'Rangliste' },
                { value: 'friends', label: 'Freunde' },
              ]}
            />
          </div>
          {tab === 'feed' && <FeedTab />}
          {tab === 'duels' && <DuelsTab />}
          {tab === 'challenges' && <ChallengesTab />}
          {tab === 'ranks' && <LeaderboardTab />}
          {tab === 'friends' && <FriendsTab myUsername={s.profile.username} />}
        </>
      )}
    </div>
  );
}
