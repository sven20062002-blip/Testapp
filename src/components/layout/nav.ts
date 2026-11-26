import { Apple, BarChart3, Dumbbell, Footprints, History, Home, Link2, ListChecks, Scale, Settings, Timer, type LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** shown directly in the mobile bottom bar */
  primary?: boolean;
  center?: boolean;
  group: 'Heute' | 'Training' | 'Körper & Ernährung' | 'App';
}

export const NAV: NavItem[] = [
  { to: '/', label: 'Heute', icon: Home, primary: true, group: 'Heute' },
  { to: '/workout', label: 'Training', icon: Timer, primary: true, center: true, group: 'Training' },
  { to: '/nutrition', label: 'Ernährung', icon: Apple, primary: true, group: 'Körper & Ernährung' },
  { to: '/activity', label: 'Aktivität', icon: Footprints, primary: true, group: 'Körper & Ernährung' },
  { to: '/plans', label: 'Pläne', icon: ListChecks, group: 'Training' },
  { to: '/history', label: 'Verlauf', icon: History, group: 'Training' },
  { to: '/stats', label: 'Statistik', icon: BarChart3, group: 'Training' },
  { to: '/exercises', label: 'Übungen', icon: Dumbbell, group: 'Training' },
  { to: '/body', label: 'Körpergewicht', icon: Scale, group: 'Körper & Ernährung' },
  { to: '/health/sources', label: 'Datenquellen', icon: Link2, group: 'Körper & Ernährung' },
  { to: '/settings', label: 'Einstellungen', icon: Settings, group: 'App' },
];
