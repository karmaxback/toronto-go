import { config, http } from '../config.js';
import { cached } from '../cache.js';

// MOTIS 2 API — hosted for free by Transitous (non-commercial), or self-hosted.
// Docs: https://transitous.org/api/  and  https://github.com/motis-project/motis
const api = (path, params) => {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  return `${config.motisUrl}/api/${path}?${qs}`;
};

// Greater Toronto bounding box used to keep geocoding results local.
export const GTA = { minLat: 43.35, maxLat: 44.25, minLon: -80.25, maxLon: -78.85 };
const inGta = (lat, lon) => lat >= GTA.minLat && lat <= GTA.maxLat && lon >= GTA.minLon && lon <= GTA.maxLon;

export const motis = {
  geocode: (text) => cached(`geo:${text.toLowerCase()}`, 24 * 3600_000, async () => {
    const res = await http(api('v1/geocode', { text, place: '43.6532,-79.3832', placeBias: 5, language: 'en' }));
    return res
      .filter((r) => inGta(r.lat, r.lon))
      .slice(0, 8)
      .map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type, // ADDRESS | PLACE | STOP
        detail: [r.street && r.houseNumber ? `${r.houseNumber} ${r.street}` : r.street,
          (r.areas || []).filter((a) => a.matched || a.default).map((a) => a.name).slice(0, 2).join(', ')]
          .filter(Boolean).filter((x) => x !== r.name).join(' · '),
        lat: r.lat,
        lon: r.lon,
      }));
  }),

  reverse: (lat, lon) => cached(`rev:${lat.toFixed(4)},${lon.toFixed(4)}`, 3600_000, async () => {
    const res = await http(api('v1/reverse-geocode', { place: `${lat},${lon}` }));
    const r = res[0];
    return r ? { name: [r.houseNumber, r.street].filter(Boolean).join(' ') || r.name, lat, lon } : { name: 'Current location', lat, lon };
  }),

  stopsInBox: (minLat, minLon, maxLat, maxLon) =>
    http(api('v1/map/stops', { min: `${minLat},${minLon}`, max: `${maxLat},${maxLon}` })),

  stoptimes: (stopId, n = 12) => cached(`st:${stopId}:${n}`, 30_000, () =>
    http(api('v5/stoptimes', { stopId, n, radius: 0 }))),

  plan: (p) => http(api('v5/plan', p), { timeout: 30000 }),
};
