import { useSyncExternalStore } from 'react';

import { load, save } from './storage';

/*
 * App settings, shared by every screen. Changing one updates all screens at once and is saved on the device.
 * Plan's trip options edit the same values, so they're remembered next time.
 */

export type Pref = 'balanced' | 'fastest' | 'fewer_transfers' | 'less_walking';
export type Rider = 'adult' | 'youth' | 'senior' | 'child';
export type ThemeChoice = 'system' | 'light' | 'dark';
export type Clock = '12h' | '24h';

export type Settings = {
  theme: ThemeChoice;
  clock: Clock;
  pref: Pref;
  rider: Rider;
  accessible: boolean;
  coach: boolean;
  /** other ways to get there shown next to transit */
  showBikeShare: boolean;
  showCycling: boolean;
  showDriving: boolean;
  /** map layers */
  mapVehicles: boolean;
  mapBikes: boolean;
  /** Plan: refresh live times every minute */
  autoRefresh: boolean;
};

export const DEFAULTS: Settings = {
  theme: 'system',
  clock: '12h',
  pref: 'balanced',
  rider: 'adult',
  accessible: false,
  coach: false,
  showBikeShare: true,
  showCycling: true,
  showDriving: true,
  mapVehicles: true,
  mapBikes: false,
  autoRefresh: true,
};

let state: Settings = DEFAULTS;
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Read once at start-up; earlier versions saved some of these under their own keys. */
async function init() {
  const stored = await load<Partial<Settings> | null>('settings', null);
  if (stored) {
    state = { ...DEFAULTS, ...stored };
  } else {
    const [pref, rider, accessible, coach, mapVehicles, mapBikes] = await Promise.all([
      load('pref', DEFAULTS.pref), load('rider', DEFAULTS.rider), load('accessible', DEFAULTS.accessible),
      load('coach', DEFAULTS.coach), load('layer:vehicles', DEFAULTS.mapVehicles), load('layer:bikes', DEFAULTS.mapBikes),
    ]);
    state = { ...DEFAULTS, pref, rider, accessible, coach, mapVehicles, mapBikes };
  }
  loaded = true;
  emit();
}
const ready = init();

export const getSettings = () => state;
export const settingsLoaded = () => loaded;

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  state = { ...state, [key]: value };
  emit();
  save('settings', state);
}

export async function resetSettings() {
  await ready;
  state = DEFAULTS;
  emit();
  save('settings', state);
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** All settings; the component re-renders when any of them changes. */
export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSettings, getSettings);
}

/** One setting plus its setter, like useState. */
export function useSetting<K extends keyof Settings>(key: K) {
  const s = useSettings();
  return [s[key], (v: Settings[K]) => setSetting(key, v)] as const;
}
