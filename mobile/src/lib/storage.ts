import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

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

/** useState that persists to the device. */
export function useStored<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(fallback);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    load(key, fallback).then((v) => { if (alive) { setValue(v); setReady(true); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const set = useCallback((v: T) => { setValue(v); save(key, v); }, [key]);
  return [value, set, ready] as const;
}

export type SavedPlaces = { Home?: Place; Work?: Place };
