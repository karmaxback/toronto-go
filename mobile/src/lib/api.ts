import { apiBase } from './config';
import type { AirportData, AlertsData, BikeStation, NearbyBoard, Place, PlanResult, WeatherData } from './types';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${apiBase()}/api/${path}`);
  let body: unknown = null;
  try { body = await res.json(); } catch { /* not JSON */ }
  if (!res.ok) {
    const msg = (body as { error?: string } | null)?.error || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return body as T;
}

const at = (p: { lat: number; lon: number }) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`;

export type PlanParams = {
  from: Place;
  to: Place;
  pref?: string;
  rider?: string;
  accessible?: boolean;
  time?: Date | null;
  arriveBy?: boolean;
};

export const api = {
  geocode: (q: string) => get<Place[]>(`geocode?q=${encodeURIComponent(q)}`),
  reverse: (p: { lat: number; lon: number }) => get<Place>(`reverse?at=${at(p)}`),
  plan: (p: PlanParams) => {
    const q = new URLSearchParams({
      from: at(p.from),
      to: at(p.to),
      pref: p.pref || 'balanced',
      rider: p.rider || 'adult',
      accessible: String(Boolean(p.accessible)),
    });
    if (p.time) {
      q.set('time', p.time.toISOString());
      if (p.arriveBy) q.set('arriveBy', 'true');
    }
    return get<PlanResult>(`plan?${q}`);
  },
  nearby: (p: { lat: number; lon: number }, radius = 450) => get<NearbyBoard[]>(`nearby?at=${at(p)}&radius=${radius}`),
  bikesNear: (p: { lat: number; lon: number }) => get<BikeStation[]>(`bikeshare/near?at=${at(p)}`),
  weather: () => get<WeatherData>('weather'),
  alerts: () => get<AlertsData>('alerts'),
  airport: () => get<AirportData>('airport'),
};
