import { useCallback, useEffect, useState } from 'react';

import { apiBase } from './config';
import { getDeviceIdentity, pushUnavailableReason, releaseDeviceIdentity } from './push-device';
import { load, save } from './storage';
import type { Place } from './types';

/* Notification settings shared by the Alerts tab (settings) and route cards (watch this trip). */

export type PushPrefs = { weather: boolean; weatherLevel: 'minor' | 'moderate' | 'severe'; routes: string[] };
export type Watch = {
  id: string; name: string | null; from: Place; to: Place; leaveAt: string; days: number[];
  remindMin: number; pref: string; accessible: boolean;
};
export type PushState = { id: string; prefs: PushPrefs; watches: Watch[] };

type Stored = { expoToken?: string; endpoint?: string };
/** Phones give an Expo token; browsers give a Web Push subscription (see push-device.ts / .web.ts). */
type AnyIdentity = { expoToken: string; platform: string } | { subscription: object; endpoint: string; platform: string };
const KEY = 'push:identity';

async function post<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`${apiBase()}/api/push/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error((data as { error?: string }).error || `Request failed (${res.status})`), { status: res.status });
  return data as T;
}

const who = (s: Stored) => (s.expoToken ? { expoToken: s.expoToken } : { endpoint: s.endpoint });

const listeners = new Set<(s: PushState | null) => void>();
let current: PushState | null = null;
const publish = (s: PushState | null) => { current = s; listeners.forEach((l) => l(s)); };

/** Subscribe to the server's notification state for this device. */
export function usePush() {
  const [state, setState] = useState<PushState | null>(current);
  const [ready, setReady] = useState(current !== null);
  useEffect(() => {
    listeners.add(setState);
    load<Stored | null>(KEY, null).then((stored) => {
      if (!stored || current) { setReady(true); return; }
      return post<PushState>('me', who(stored)).then(publish, () => publish(null)).finally(() => setReady(true));
    });
    return () => { listeners.delete(setState); };
  }, []);

  const call = useCallback(async (path: string, body: object = {}) => {
    const stored = await load<Stored | null>(KEY, null);
    if (!stored) throw new Error('Turn on notifications first.');
    const s = await post<PushState>(path, { ...who(stored), ...body });
    publish(s);
    return s;
  }, []);

  return {
    state,
    ready,
    unavailable: pushUnavailableReason(),
    /** Ask permission, register this device with the server. */
    enable: async () => {
      const id = (await getDeviceIdentity()) as AnyIdentity;
      const body = 'expoToken' in id ? { expoToken: id.expoToken, platform: id.platform } : { subscription: id.subscription };
      const s = await post<PushState>('subscribe', body);
      await save<Stored>(KEY, 'expoToken' in id ? { expoToken: id.expoToken } : { endpoint: id.endpoint });
      publish(s);
      return s;
    },
    disable: async () => {
      const stored = await load<Stored | null>(KEY, null);
      if (stored) await post('unsubscribe', who(stored)).catch(() => {});
      await releaseDeviceIdentity();
      await save(KEY, null);
      publish(null);
    },
    savePrefs: (prefs: Omit<Partial<PushPrefs>, 'routes'> & { routes?: string[] | string }) => call('prefs', { prefs }),
    /** Send a test notification (the server replies { ok }, not the settings). */
    test: async () => {
      const stored = await load<Stored | null>(KEY, null);
      if (!stored) throw new Error('Turn on notifications first.');
      await post('test', who(stored));
    },
    addWatch: (watch: Omit<Watch, 'id'>) => call('watch', { watch }),
    removeWatch: (id: string) => call('watch/delete', { id }),
  };
}

