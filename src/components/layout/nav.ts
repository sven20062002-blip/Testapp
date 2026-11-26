import { Apple, BarChart3, Dumbbell, Footprints, History, Home, Link2, ListChecks, Scale, Settings, Timer, Users, type LucideIcon } from 'lucide-react';
import type { ComponentType } from 'react';
import type { Area } from '@/components/ui/PageHeader';
import { FEATURES } from '@/config/features';
import { KettliIcon } from '@/pet/KettliIcon';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon | ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  /** shown directly in the mobile bottom bar */
  primary?: boolean;
  center?: boolean;
  area?: Area;
  group: 'Heute' | 'Training' | 'Kettli' | 'Freunde' | 'Körper & Ernährung' | 'App';
}

const ALL_NAV: NavItem[] = [
  { to: '/', label: 'Heute', icon: Home, primary: true, group: 'Heute' },
  { to: '/workout', label: 'Training', icon: Timer, primary: true, center: true, area: 'train', group: 'Training' },
  { to: '/nutrition', label: 'Ernährung', icon: Apple, primary: true, area: 'food', group: 'Körper & Ernährung' },
  { to: '/pet', label: 'Kettli', icon: KettliIcon, primary: true, area: 'pet', group: 'Kettli' },
  { to: '/social', label: 'Freunde', icon: Users, primary: true, area: 'social', group: 'Freunde' },
  { to: '/plans', label: 'Pläne', icon: ListChecks, area: 'train', group: 'Training' },
  { to: '/history', label: 'Verlauf', icon: History, area: 'train', group: 'Training' },
  { to: '/stats', label: 'Statistik', icon: BarChart3, area: 'train', group: 'Training' },
  { to: '/exercises', label: 'Übungen', icon: Dumbbell, area: 'train', group: 'Training' },
  { to: '/activity', label: 'Aktivität', icon: Footprints, area: 'move', group: 'Körper & Ernährung' },
  { to: '/body', label: 'Körpergewicht', icon: Scale, area: 'body', group: 'Körper & Ernährung' },
  { to: '/health/sources', label: 'Datenquellen', icon: Link2, area: 'move', group: 'Körper & Ernährung' },
  { to: '/settings', label: 'Einstellungen', icon: Settings, group: 'App' },
];

/** Freunde is switched off for now (FEATURES.social) – Kettli takes its place in the bottom bar. */
export const NAV: NavItem[] = ALL_NAV.filter((n) => (n.to === '/social' ? FEATURES.social : n.to === '/pet' ? !FEATURES.social : true));
