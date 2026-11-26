import type { Area } from '@/components/ui/PageHeader';

export type TourIcon = 'sparkles' | 'home' | 'train' | 'plans' | 'food' | 'social' | 'move' | 'done';

export interface TourStep {
  id: string;
  /** page shown behind the spotlight */
  route: string;
  /** candidate selectors, the first *visible* one is highlighted (bottom bar on phones, sidebar on desktop) */
  target?: string[];
  area?: Area;
  icon: TourIcon;
  title: string;
  text: string;
  bullets?: string[];
  note?: string;
}

export const TOUR: TourStep[] = [
  {
    id: 'intro',
    route: '/',
    icon: 'sparkles',
    area: 'train',
    title: 'Kurze Tour durch Forge',
    text: 'In wenigen Stationen zeigen wir dir, wo du was findest. Du kannst die Tour jederzeit beenden und später unter Einstellungen erneut starten.',
  },
  {
    id: 'today',
    route: '/',
    target: ['[data-tour="nav-/"]'],
    icon: 'home',
    area: 'train',
    title: 'Heute',
    text: 'Dein Startpunkt für jeden Tag.',
    bullets: ['Workout mit einem Tipp starten', 'Wochenziel, Kalorien, Schritte und Gewicht auf einen Blick', 'Schnellzugriffe zu Plänen, Verlauf und Statistik'],
  },
  {
    id: 'workout',
    route: '/workout',
    target: ['[data-tour="nav-/workout"]'],
    icon: 'train',
    area: 'train',
    title: 'Training',
    text: 'Hier läuft dein Workout – leer oder nach Plan.',
    bullets: [
      'Gewicht und Wiederholungen eintragen, Satz mit ✓ abhaken',
      'Der Pausentimer startet automatisch und läuft auch weiter, wenn du die App verlässt',
      'Neue Bestleistungen (PRs) werden sofort erkannt',
      'Notizen pro Übung bleiben fürs nächste Mal gespeichert',
    ],
  },
  {
    id: 'plans',
    route: '/plans',
    target: ['[data-tour="nav-more"]', '[data-tour="nav-/plans"]'],
    icon: 'plans',
    area: 'train',
    title: 'Pläne & mehr',
    text: 'Weitere Trainingsbereiche – auf dem Handy findest du sie unter „Mehr“.',
    bullets: ['Pläne mit Übungen, Sätzen und Pausen anlegen', 'Verlauf aller Workouts und Statistik zu Volumen und Kraft', 'Übungsbibliothek – eigene Übungen ergänzen'],
  },
  {
    id: 'nutrition',
    route: '/nutrition',
    target: ['[data-tour="nav-/nutrition"]'],
    icon: 'food',
    area: 'food',
    title: 'Ernährung',
    text: 'Behalte Kalorien und Makros im Blick.',
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
    bullets: ['Feed mit den Workouts deiner Freunde', 'Ranglisten und Challenges über einen Zeitraum', 'Live-Duell: gleichzeitig trainieren, jeder Satz zählt sofort'],
    note: 'Für die Online-Funktionen brauchst du einmalig ein Konto. Geteilt werden nur Zusammenfassungen, keine Notizen.',
  },
  {
    id: 'body',
    route: '/activity',
    target: ['[data-tour="nav-more"]', '[data-tour="nav-/activity"]'],
    icon: 'move',
    area: 'move',
    title: 'Aktivität & Körper',
    text: 'Deine Werte außerhalb des Studios – auf dem Handy ebenfalls unter „Mehr“.',
    bullets: ['Schritte und Aktivitätskalorien', 'Gewichtsverlauf mit Trend', 'Datenquellen: Google Health, Health Connect oder Apple Health verbinden'],
  },
  {
    id: 'done',
    route: '/',
    icon: 'done',
    area: 'body',
    title: 'Alles wird gespeichert',
    text: 'Deine Daten bleiben auf diesem Gerät und werden automatisch gesichert – auch offline und wenn du die App verlässt.',
    note: 'Tipp: Unter Einstellungen kannst du ein Backup exportieren, die Darstellung ändern und diese Tour erneut starten.',
  },
];
