import { useMemo } from 'react';

import { api } from '@/lib/api';
import { usePolling } from '@/lib/hooks';
import type { IconName } from '@/lib/icons';
import type { BikeStation, VehiclesData } from '@/lib/types';

import type { MapMarker, MapViewport } from './types';

const SUBWAY: Record<string, string> = { 1: '#d5c82b', 2: '#00923f', 4: '#a8518a', 5: '#f58025', 6: '#959595' };
const isStreetcar = (n: number) => (n >= 501 && n <= 512) || (n >= 301 && n <= 310);

/** TTC vehicle look by route: subway line colours, streetcar red, express blue, bus red. */
export function vehicleStyle(route: string | null): { color: string; icon: IconName } {
  if (!route) return { color: '#7a7a7a', icon: 'bus' };
  if (SUBWAY[route]) return { color: SUBWAY[route], icon: 'subway' };
  const n = Number(route);
  if (isStreetcar(n)) return { color: '#b8141b', icon: 'tram' };
  if (n >= 900) return { color: '#1f6fb2', icon: 'bus' };
  return { color: '#da251d', icon: 'bus' };
}

/** Bike Share station colour: green with bikes, orange when nearly empty, grey when empty. */
export const bikeColor = (bikes: number) => (bikes === 0 ? '#9aa3a0' : bikes < 3 ? '#d97706' : '#2e9b47');

const MAX_MARKERS = 250; // keeps phones smooth

/** Rounds the view so tiny pans don't trigger a new request. */
const viewKey = (v: MapViewport | null) => (v ? [v.minLat, v.minLon, v.maxLat, v.maxLon].map((n) => n.toFixed(2)).join(',') : '');
const nearestToCentre = <T extends { lat: number; lon: number }>(list: T[], v: MapViewport) => {
  const cy = (v.minLat + v.maxLat) / 2, cx = (v.minLon + v.maxLon) / 2;
  return [...list].sort((a, b) => ((a.lat - cy) ** 2 + ((a.lon - cx) * 0.72) ** 2) - ((b.lat - cy) ** 2 + ((b.lon - cx) * 0.72) ** 2)).slice(0, MAX_MARKERS);
};

/** Live TTC (and GO, when the server has a key) vehicles in view; refreshes every 15 s. Needs zoom ≥ 13. */
export function useVehicleLayer(on: boolean, view: MapViewport | null) {
  const active = on && !!view && view.zoom >= 13;
  const { data } = usePolling<VehiclesData | null>(
    async () => (active ? api.vehicles(view!) : null), 15_000, active ? `v:${viewKey(view)}` : 'off');
  const markers = useMemo<MapMarker[]>(() => {
    if (!active || !data || !view) return [];
    const labels = view.zoom >= 15;
    const ttc = nearestToCentre(data.ttc, view).map((v): MapMarker => ({
      id: `v${v.id}`, lat: v.lat, lon: v.lon, ...vehicleStyle(v.route), size: labels ? 24 : 20,
      label: labels && v.route ? v.route : undefined, title: `TTC ${v.route ? `route ${v.route}` : 'vehicle'} · #${v.id}`,
    }));
    const go = data.go.map((v): MapMarker => ({ id: `g${v.id}`, lat: v.lat, lon: v.lon, color: '#3d8b37', icon: 'train', size: 24, title: `GO ${v.route ?? ''}` }));
    return [...ttc, ...go];
  }, [active, data, view]);
  return { markers, needsZoom: on && !!view && view.zoom < 13 };
}

/** Bike Share Toronto stations in view, coloured by availability; refreshes every 60 s. Needs zoom ≥ 14. */
export function useBikeLayer(on: boolean, view: MapViewport | null) {
  const active = on && !!view && view.zoom >= 14;
  const { data } = usePolling<BikeStation[] | null>(
    async () => (active ? api.bikeStations(view!) : null), 60_000, active ? `b:${viewKey(view)}` : 'off');
  const markers = useMemo<MapMarker[]>(() => {
    if (!active || !data || !view) return [];
    return nearestToCentre(data, view).map((s): MapMarker => ({
      id: `bs${s.id}`, lat: s.lat, lon: s.lon, icon: 'bike', label: String(s.bikes), size: 24, color: bikeColor(s.bikes),
      title: `${s.name} · ${s.bikes} bikes${s.ebikes ? ` (${s.ebikes} e-bikes)` : ''} · ${s.docks} docks`,
    }));
  }, [active, data, view]);
  return { markers, needsZoom: on && !!view && view.zoom < 14 };
}
