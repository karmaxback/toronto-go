import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useSyncExternalStore } from 'react';

import type { Place } from './types';

const PREFIX = 'tg:';

export async function load<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export async function save<T>(key: string, value: T) {
  try { await AsyncStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* storage full or blocked */ }
}

/*
 * useStored: like useState, but saved on the device and shared live between screens
 * (change Home in Settings and the Plan tab shows it straight away).
 */
const cache = new Map<string, unknown>();
const fallbacks = new Map<string, unknown>();
const listeners = new Map<string, Set<() => void>>();
const loading = new Set<string>();
const notify = (key: string) => listeners.get(key)?.forEach((l) => l());

function put(key: string, value: unknown) {
  cache.set(key, value);
  notify(key);
}

export function useStored<T>(key: string, fallback: T) {
  if (!fallbacks.has(key)) fallbacks.set(key, fallback); // one stable fallback per key
  const subscribe = useCallback((l: () => void) => {
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key)!.add(l);
    return () => { listeners.get(key)!.delete(l); };
  }, [key]);
  const snapshot = () => (cache.has(key) ? cache.get(key) : fallbacks.get(key)) as T;
  const value = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => {
    if (cache.has(key) || loading.has(key)) return;
    loading.add(key);
    load(key, fallbacks.get(key) as T).then((v) => { loading.delete(key); if (!cache.has(key)) put(key, v); });
  }, [key]);
  const set = useCallback((v: T) => { put(key, v); save(key, v); }, [key]);
  return [value, set, cache.has(key)] as const;
}

/** Forget a saved value on this device (Settings → reset). */
export async function removeStored(key: string) {
  cache.delete(key);
  notify(key);
  try { await AsyncStorage.removeItem(PREFIX + key); } catch { /* ignore */ }
}

export type SavedPlaces = { Home?: Place; Work?: Place };
