import { useState } from 'react';
import { Check, Share2, UserMinus, UserPlus, X } from 'lucide-react';
import { inviteLink } from '@/social/config';
import { listFriends, removeFriend, respondFriendRequest, sendFriendRequest } from '@/social/api';
import { useRemote } from '@/social/hooks';
import type { FriendRow } from '@/social/types';
import { Button, IconButton } from '@/components/ui/Button';
import { useFeedback } from '@/components/ui/Feedback';
import { Empty } from '@/components/ui/Empty';
import { SectionTitle } from '@/components/ui/PageHeader';
import { Avatar } from './Avatar';
import { ErrorNote, Skeleton } from './shared';

export function useFriends() {
  return useRemote(() => listFriends(), [], [{ table: 'friendships' }]);
}

export function FriendsTab({ myUsername }: { myUsername: string }) {
  const { toast, confirm } = useFeedback();
  const { data, error, loading, refresh } = useFriends();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await sendFriendRequest(name);
      toast('Anfrage gesendet', 'success');
      setName('');
      void refresh();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const act = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      toast(msg, 'success');
      void refresh();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const incoming = (data ?? []).filter((f) => f.direction === 'incoming');
  const outgoing = (data ?? []).filter((f) => f.direction === 'outgoing');
  const friends = (data ?? []).filter((f) => f.direction === 'friend');

  return (
    <div>
      <form
        className="card flex items-center gap-2 p-2 pl-4"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <span className="text-muted">@</span>
        <input
          className="min-w-0 flex-1 bg-transparent py-2 text-[14px] outline-none placeholder:text-subtle"
          placeholder="Benutzername eines Freundes"
          value={name}
          autoCapitalize="none"
          autoCorrect="off"
          onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_@]/g, ''))}
          aria-label="Benutzername eines Freundes"
        />
        <Button type="submit" variant="primary" size="sm" disabled={busy || !name.trim()} icon={<UserPlus size={15} />}>
          Hinzufügen
        </Button>
      </form>
      <div className="mt-2 flex items-center justify-between gap-3 px-1">
        <p className="text-[11.5px] text-subtle">
          Dein Benutzername: <span className="font-semibold text-fg">@{myUsername}</span>
        </p>
        <Button
          size="sm"
          icon={<Share2 size={14} />}
          onClick={async () => {
            const link = inviteLink(myUsername);
            if (!link) return;
            const text = `Trainier mit mir in heben! Mein Benutzername: @${myUsername}`;
            try {
              if (navigator.share) await navigator.share({ title: 'heben', text, url: link });
              else {
                await navigator.clipboard.writeText(`${text}\n${link}`);
                toast('Einladungslink kopiert', 'success');
              }
            } catch {
              /* share cancelled */
            }
          }}
        >
          Einladen
        </Button>
      </div>

      {loading && !data && (
        <div className="mt-6">
          <Skeleton rows={2} />
        </div>
      )}
      {error && !data && (
        <div className="mt-6">
          <ErrorNote error={error} onRetry={refresh} />
        </div>
      )}

      {incoming.length > 0 && (
        <>
          <SectionTitle area="social">Anfragen</SectionTitle>
          <div className="card divide-y divide-line/50">
            {incoming.map((f) => (
              <Row key={f.friendship_id} f={f}>
                <IconButton label="Ablehnen" variant="secondary" onClick={() => act(() => respondFriendRequest(f.friendship_id, false), 'Abgelehnt')}>
                  <X size={17} />
                </IconButton>
                <button
                  aria-label="Annehmen"
                  onClick={() => act(() => respondFriendRequest(f.friendship_id, true), 'Ihr seid jetzt befreundet 🎉')}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-area-social text-white transition active:scale-95"
                >
                  <Check size={18} />
                </button>
              </Row>
            ))}
          </div>
        </>
      )}

      <SectionTitle>Freunde {friends.length > 0 && <span className="text-muted">({friends.length})</span>}</SectionTitle>
      {data && !friends.length && <Empty icon={<UserPlus size={26} />} title="Noch keine Freunde" text="Füge Freunde über ihren Benutzernamen hinzu, um gemeinsam zu trainieren." />}
      {friends.length > 0 && (
        <div className="card divide-y divide-line/50">
          {friends.map((f) => (
            <Row key={f.friendship_id} f={f}>
              <IconButton
                label={`${f.display_name} entfernen`}
                onClick={async () => {
                  if (await confirm({ title: `${f.display_name} entfernen?`, text: 'Ihr seht dann gegenseitig keine Workouts mehr.', confirmLabel: 'Entfernen', danger: true }))
                    void act(() => removeFriend(f.user_id), 'Entfernt');
                }}
              >
                <UserMinus size={17} />
              </IconButton>
            </Row>
          ))}
        </div>
      )}

      {outgoing.length > 0 && (
        <>
          <SectionTitle>Gesendet</SectionTitle>
          <div className="card divide-y divide-line/50">
            {outgoing.map((f) => (
              <Row key={f.friendship_id} f={f} hint="wartet auf Bestätigung">
                <IconButton label="Anfrage zurückziehen" onClick={() => act(() => removeFriend(f.user_id), 'Zurückgezogen')}>
                  <X size={17} />
                </IconButton>
              </Row>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Row({ f, hint, children }: { f: FriendRow; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Avatar name={f.display_name} color={f.color} size={40} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-semibold">{f.display_name}</div>
        <div className="truncate text-[11.5px] text-muted">
          @{f.username}
          {hint ? ` · ${hint}` : ''}
        </div>
      </div>
      <div className="flex gap-1.5">{children}</div>
    </div>
  );
}
