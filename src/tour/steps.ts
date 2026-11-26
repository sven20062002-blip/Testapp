import type { Area } from '@/components/ui/PageHeader';

export type TourIcon = 'home' | 'train' | 'food' | 'social' | 'more';

export interface TourStep {
  id: string;
  /** page shown behind the spotlight */
  route: string;
  /** candidate selectors, the first *visible* one is highlighted (bottom bar on phones, sidebar on desktop) */
  target?: string[];
  /** colour of the station – the same as the menu item */
  area: Area | 'neutral';
  icon: TourIcon;
  title: string;
  text: string;
  bullets?: string[];
  note?: string;
}

/** One station per menu entry, in the order of the bottom bar (left → right). */
export const TOUR: TourStep[] = [
  {
    id: 'today',
    route: '/',
    target: ['[data-tour="nav-/"]'],
    icon: 'home',
    area: 'neutral',
    title: 'Heute',
    text: 'Willkommen bei heben! Hier startest du jeden Tag.',
    bullets: ['Workout mit einem Tipp starten', 'Wochenziel, Kalorien, Schritte und Gewicht auf einen Blick', 'Über „Anpassen“ gestaltest du die Startseite selbst: verschieben, verkleinern, entfernen, hinzufügen'],
  },
  {
    id: 'workout',
    route: '/workout',
    target: ['[data-tour="nav-/workout"]'],
    icon: 'train',
    area: 'train',
    title: 'Training',
    text: 'Hier startest du dein Workout – leer oder mit einem deiner Trainingspläne.',
    bullets: ['Trainingspläne direkt starten, neue Pläne anlegen', 'Gewicht und Wiederholungen eintragen, Satz mit ✓ abhaken', 'Pausentimer startet automatisch und läuft auch im Hintergrund weiter', 'Neue Bestleistungen werden sofort erkannt'],
  },
  {
    id: 'nutrition',
    route: '/nutrition',
    target: ['[data-tour="nav-/nutrition"]'],
    icon: 'food',
    area: 'food',
    title: 'Ernährung',
    text: 'Kalorien und Makros im Blick.',
    bullets: ['Lebensmittel per Barcode-Scanner oder Suche erfassen', 'Tagesziel aus deinem Profil berechnet', 'Eigene Lebensmittel, Rezepte und Favoriten'],
  },
  {
    id: 'social',
    route: '/social',
    target: ['[data-tour="nav-/social"]'],
    icon: 'social',
    area: 'social',
    title: 'Freunde',
    text: 'Hebe gegen deine Freunde.',
    bullets: ['Feed mit den Workouts deiner Freunde', 'Ranglisten und Challenges über einen Zeitraum', 'Live-Duell: gleichzeitig trainieren, jeder Satz zählt'],
    note: 'Dafür brauchst du einmalig ein Konto. Geteilt werden nur Zusammenfassungen.',
  },
  {
    id: 'more',
    route: '/',
    // phones: the "Mehr" button; desktop has no such button → the sidebar entries below the main areas
    target: ['[data-tour="nav-more"]', '[data-tour="nav-/plans"]'],
    icon: 'more',
    area: 'neutral',
    title: 'Mehr',
    text: 'Alles Weitere an einem Ort: Pläne, Verlauf, Statistik, Übungen, Aktivität, Körpergewicht, Datenquellen und Einstellungen.',
    note: 'Alles wird automatisch auf deinem Gerät gespeichert – auch offline. Die Tour findest du jederzeit unter Einstellungen.',
  },
];
