import { useState } from 'react';
import { db } from '@/db/db';
import { syncSource, NeedsAuthError } from '@/health/sync';
import { useFeedback } from '@/components/ui/Feedback';

/** Manual "sync now" for all connected sources (user gesture → may refresh Google login). */
export function useSync() {
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (busy) return;
    if (!navigator.onLine) {
      toast('Offline – Synchronisierung nicht möglich. Lokale Daten bleiben verfügbar.', 'warn');
      return;
    }
    setBusy(true);
    try {
      const sources = (await db.healthSources.toArray()).filter((s) => s.connected && (s.id === 'google' || s.id === 'bridge'));
      if (!sources.length) {
        toast('Keine automatisch synchronisierbare Quelle verbunden.', 'info');
        return;
      }
      for (const s of sources) {
        try {
          await syncSource(s.id, true);
          toast('Synchronisiert', 'success');
        } catch (e) {
          toast(e instanceof NeedsAuthError ? e.message : `Sync fehlgeschlagen: ${(e as Error).message}`, 'error');
        }
      }
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}
