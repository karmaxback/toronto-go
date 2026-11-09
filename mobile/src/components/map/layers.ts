import { useMemo } from 'react';

import { api } from '@/lib/api';
import { usePolling } from '@/lib/hooks';
import type { BikeStation, VehiclesData } from '@/lib/types';

import type { MapMarker, MapViewport } from './types';

const SUBWAY: Record<string, string> = { 1: '#d5c82b', 2: '#00923f', 4: '#a8518a', 5: '#f58025', 6: '#959595' };
export function vehicleColor(route: string | null) {
  if (!route) return '#7a7a7a';
  if (SUBWAY[route]) return SUBWAY[route];
  const n = Number(route);
  if ((n >= 501 && n <= 512) || (n >= 301 && n <= 310)) return '#b8141b'; // streetcars
  if (n >= 900) return '#1f6fb2'; // express buses
  return '#da251d';
}

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
    const ttc = nearestToCentre(data.ttc, view).map((v) => ({
      id: `v${v.id}`, lat: v.lat, lon: v.lon, color: vehicleColor(v.route), size: labels && v.route ? 22 : 10,
      label: labels && v.route ? v.route : undefined, title: `TTC ${v.route ? `route ${v.route}` : 'vehicle'} · #${v.id}`,
    }));
    const go = data.go.map((v) => ({ id: `g${v.id}`, lat: v.lat, lon: v.lon, color: '#3d8b37', size: 14, title: `GO ${v.route ?? ''}` }));
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
    return nearestToCentre(data, view).map((s) => ({
      id: `bs${s.id}`, lat: s.lat, lon: s.lon, label: String(s.bikes), size: 22,
      color: s.bikes === 0 ? '#9aa3a0' : s.bikes < 3 ? '#d97706' : '#2e9b47',
      title: `${s.name} · ${s.bikes} bikes${s.ebikes ? ` (${s.ebikes} e-bikes)` : ''} · ${s.docks} docks`,
    }));
  }, [active, data, view]);
  return { markers, needsZoom: on && !!view && view.zoom < 14 };
}
