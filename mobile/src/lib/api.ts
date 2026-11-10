import { apiBase } from './config';
import type { AirportData, AlertsData, BikeStation, NearbyBoard, Place, PlanResult, VehiclesData, WeatherData } from './types';

type Box = { minLat: number; minLon: number; maxLat: number; maxLon: number };
const bbox = (b: Box) => [b.minLon, b.minLat, b.maxLon, b.maxLat].map((n) => n.toFixed(4)).join(',');

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
  coach?: boolean;
  time?: Date | null;
  arriveBy?: boolean;
};

export const api = {
  /** `more`: also ask the backup search (Google) if the free one finds nothing that matches every word. */
  geocode: (q: string, near?: { lat: number; lon: number } | null, more = false) =>
    get<Place[]>(`geocode?q=${encodeURIComponent(q)}${near ? `&near=${at(near)}` : ''}${more ? '&more=1' : ''}`),
  reverse: (p: { lat: number; lon: number }) => get<Place>(`reverse?at=${at(p)}`),
  plan: (p: PlanParams) => {
    const q = new URLSearchParams({
      from: at(p.from),
      to: at(p.to),
      pref: p.pref || 'balanced',
      rider: p.rider || 'adult',
      accessible: String(Boolean(p.accessible)),
      coach: String(Boolean(p.coach)),
    });
    if (p.time) {
      q.set('time', p.time.toISOString());
      if (p.arriveBy) q.set('arriveBy', 'true');
    }
    return get<PlanResult>(`plan?${q}`);
  },
  nearby: (p: { lat: number; lon: number }, radius = 450) => get<NearbyBoard[]>(`nearby?at=${at(p)}&radius=${radius}`),
  bikesNear: (p: { lat: number; lon: number }) => get<BikeStation[]>(`bikeshare/near?at=${at(p)}`),
  vehicles: (b: Box) => get<VehiclesData>(`vehicles?bbox=${bbox(b)}`),
  bikeStations: (b: Box) => get<BikeStation[]>(`bikeshare?bbox=${bbox(b)}`),
  weather: () => get<WeatherData>('weather'),
  alerts: () => get<AlertsData>('alerts'),
  airport: () => get<AirportData>('airport'),
};
