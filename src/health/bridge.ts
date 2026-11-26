/**
 * Native bridge – extension point for Google Health Connect (Android) and Apple HealthKit (iOS).
 *
 * Neither Health Connect nor HealthKit can be accessed from a browser/PWA: both are on-device
 * APIs reserved for native apps. To read them live, heben can be wrapped in a native shell
 * (e.g. Capacitor) that implements the small contract below and injects it as
 * `window.ForgeHealthBridge`. The web app then syncs through it exactly like any other source.
 * See docs/NATIVE_BRIDGE.md for the contract and the required native permissions.
 */
import type { HealthCategory, MetricKey } from '@/db/types';

export interface ForgeHealthBridge {
  /** 'healthconnect' (Android) or 'healthkit' (iOS) */
  platform: 'healthconnect' | 'healthkit';
  /** e.g. "Health Connect 1.1" – shown in the UI */
  version?: string;
  isAvailable(): Promise<boolean>;
  /** Shows the OS permission dialog for the given categories; returns the granted ones. */
  requestPermissions(categories: HealthCategory[]): Promise<HealthCategory[]>;
  /**
   * Returns already-normalised data for local days [from, to] (YYYY-MM-DD).
   * Units: see METRIC_META (steps count, distance in meters, energy in kcal, weight kg, body fat %).
   * Daily metrics must already be de-duplicated per day (one value per metric and day).
   */
  read(params: { from: string; to: string; categories: HealthCategory[] }): Promise<{
    metrics: { metric: MetricKey; date: string; value: number; origin?: string }[];
  }>;
}

declare global {
  interface Window {
    ForgeHealthBridge?: ForgeHealthBridge;
  }
}

export function getBridge(): ForgeHealthBridge | null {
  return typeof window !== 'undefined' && window.ForgeHealthBridge ? window.ForgeHealthBridge : null;
}
