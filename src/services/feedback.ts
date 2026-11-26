/**
 * Audio / haptic / notification feedback.
 * iOS: WebAudio must be unlocked by a user gesture; notifications only work for
 * installed PWAs (iOS 16.4+) and cannot be scheduled while the app is suspended.
 */
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    return ctx;
  } catch {
    return null;
  }
}

/** Call from any user gesture to allow later sounds on iOS/Safari */
export function unlockAudio(): void {
  const a = audio();
  if (!a) return;
  if (a.state === 'suspended') void a.resume();
  // play an inaudible blip to fully unlock iOS
  const o = a.createOscillator();
  const g = a.createGain();
  g.gain.value = 0.0001;
  o.connect(g).connect(a.destination);
  o.start();
  o.stop(a.currentTime + 0.01);
}

function tone(freq: number, start: number, dur: number, vol = 0.25) {
  const a = audio();
  if (!a) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = 'sine';
  o.frequency.value = freq;
  const t = a.currentTime + start;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export function playRestDone(): void {
  const a = audio();
  if (!a) return;
  if (a.state === 'suspended') void a.resume();
  tone(880, 0, 0.18);
  tone(880, 0.22, 0.18);
  tone(1320, 0.44, 0.35);
}

export function playPR(): void {
  tone(660, 0, 0.12, 0.2);
  tone(880, 0.1, 0.12, 0.2);
  tone(1320, 0.2, 0.3, 0.2);
}

export function playTick(): void {
  tone(1200, 0, 0.06, 0.08);
}

export function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported (iOS) */
  }
}

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export async function requestNotifications(): Promise<NotificationPermission | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}

/** System notification if the page is hidden and permission granted (best effort) */
export async function systemNotify(title: string, body: string): Promise<void> {
  if (!notificationsSupported() || Notification.permission !== 'granted' || document.visibilityState === 'visible') return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, { body, icon: '/pwa-192.png', badge: '/pwa-192.png', tag: 'forge-rest' });
    else new Notification(title, { body, icon: '/pwa-192.png' });
  } catch {
    /* ignore */
  }
}
