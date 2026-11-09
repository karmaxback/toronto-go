import { http } from '../config.js';
import { cached } from '../cache.js';

// Bike Share Toronto — official GBFS v2 feed (free, no key). https://bikesharetoronto.com/data/
const BASE = 'https://toronto.publicbikesystem.net/customer/gbfs/v2/en';

const R = 6371000;
export function distM(a, b) {
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const info = () => cached('bs:info', 6 * 3600_000, async () => {
  const d = await http(`${BASE}/station_information`);
  return new Map(d.data.stations.map((s) => [s.station_id, s]));
});

/** Pay-as-you-go pricing from the live feed (falls back to the published rate). */
export const pricing = () => cached('bs:pricing', 24 * 3600_000, async () => {
  const fallback = { unlock: 1, classicPerMin: 0.12, ebikePerMin: 0.2, dayPass: 15 };
  try {
    const d = await http(`${BASE}/system_pricing_plans`);
    const plans = d.data.plans || [];
    const payg = plans.filter((p) => /pay-as-you-go/i.test(p.name));
    const perMin = payg.map((p) => p.per_min_pricing?.find((x) => x.start >= 1)?.rate).filter((x) => x > 0).sort((a, b) => a - b);
    const day = plans.find((p) => /daypass/i.test(p.name));
    return {
      unlock: 1,
      classicPerMin: perMin[0] ?? fallback.classicPerMin,
      ebikePerMin: perMin[1] ?? fallback.ebikePerMin,
      dayPass: day?.price || fallback.dayPass,
    };
  } catch {
    return fallback;
  }
});

/** All stations with live counts. */
export const stations = () => cached('bs:status', 60_000, async () => {
  const [inf, st] = await Promise.all([info(), http(`${BASE}/station_status`)]);
  const out = [];
  for (const s of st.data.stations) {
    const i = inf.get(s.station_id);
    if (!i || s.status !== 'IN_SERVICE' || !s.is_installed) continue;
    const types = Object.fromEntries((s.vehicle_types_available || []).map((v) => [v.vehicle_type_id, v.count]));
    const ebikes = (types.EFIT || 0) + (types.BOOST || 0) + (types.ASTRO || 0);
    out.push({
      id: s.station_id,
      name: i.name.replace(/\s+/g, ' ').trim(),
      lat: i.lat,
      lon: i.lon,
      capacity: i.capacity,
      bikes: s.is_renting ? s.num_bikes_available : 0,
      ebikes: s.is_renting ? Math.min(ebikes, s.num_bikes_available) : 0,
      docks: s.is_returning ? s.num_docks_available : 0,
      updated: s.last_reported,
    });
  }
  return out;
});

/** Closest stations to a point that have a bike (need='bikes') or a free dock (need='docks'). */
export async function nearest(at, need = 'bikes', { radius = 500, limit = 3 } = {}) {
  const all = await stations();
  return all
    .filter((s) => (need === 'bikes' ? s.bikes > 0 : s.docks > 0))
    .map((s) => ({ ...s, distanceM: Math.round(distM(at, s)) }))
    .filter((s) => s.distanceM <= radius)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, limit);
}

const WALK_MPS = 1.25;       // ~4.5 km/h
const DETOUR = 1.3;          // streets aren't straight lines
const BIKE_MPS = 4.2;        // ~15 km/h city riding, used only if no routed bike time is available

/**
 * Build a "Bike Share" trip option: walk to a station with bikes, ride, dock near the destination, walk.
 * Ride time is scaled from the routed direct-bike time when available.
 */
export async function bikeShareOption(from, to, { routedBike = null, departAt = Date.now() } = {}) {
  const odM = distM(from, to);
  if (odM < 1200 || odM > 15000) return null; // too short to bother, or too long for a 30-min-style ride
  const [starts, ends, price] = await Promise.all([nearest(from, 'bikes'), nearest(to, 'docks'), pricing()]);
  const a = starts[0];
  const b = ends[0];
  if (!a || !b || a.id === b.id) return null;

  const walk1 = Math.round(((a.distanceM * DETOUR) / WALK_MPS) / 60);
  const walk2 = Math.round(((b.distanceM * DETOUR) / WALK_MPS) / 60);
  const abM = distM(a, b);
  const ride = Math.max(3, Math.round(routedBike
    ? (routedBike.durationMin * abM) / Math.max(odM, 1)
    : ((abM * DETOUR) / BIKE_MPS) / 60));
  const unlockMin = 2;

  const t0 = departAt;
  const t1 = t0 + walk1 * 60000;
  const t2 = t1 + (ride + unlockMin) * 60000;
  const t3 = t2 + walk2 * 60000;
  const iso = (t) => new Date(t).toISOString();
  const pt = (p) => ({ name: p.name, lat: p.lat, lon: p.lon, track: null });
  const base = { transit: false, agency: null, route: null, color: null, alerts: [], access: [], serious: false, live: null, realTime: false };

  const classic = +(price.unlock + price.classicPerMin * ride).toFixed(2);
  return {
    kind: 'bikeshare',
    start: iso(t0),
    end: iso(t3),
    durationMin: walk1 + ride + unlockMin + walk2,
    transfers: 0,
    walkMin: walk1 + walk2,
    live: true, // station counts are live
    hasAlerts: false,
    serious: false,
    accessIssues: [],
    needsTicket: false,
    approximate: true,
    bikeshare: {
      from: { name: a.name, distanceM: a.distanceM, bikes: a.bikes, ebikes: a.ebikes },
      to: { name: b.name, distanceM: b.distanceM, docks: b.docks },
      alternatives: { from: starts.slice(1).map((s) => ({ name: s.name, bikes: s.bikes, distanceM: s.distanceM })), to: ends.slice(1).map((s) => ({ name: s.name, docks: s.docks, distanceM: s.distanceM })) },
    },
    fare: {
      total: classic,
      complete: true,
      items: [{ label: 'Bike Share (pay as you go, classic bike)', amount: classic }],
      note: `$${price.unlock.toFixed(2)} unlock + $${price.classicPerMin.toFixed(2)}/min (e-bike $${price.ebikePerMin.toFixed(2)}/min). Day pass $${price.dayPass.toFixed(2)}.`,
    },
    legs: [
      { ...base, mode: 'WALK', from: { name: 'Start', lat: from.lat, lon: from.lon }, to: pt(a), start: iso(t0), end: iso(t1), durationMin: walk1, distanceM: Math.round(a.distanceM * DETOUR), geometry: null, line: [[from.lat, from.lon], [a.lat, a.lon]] },
      { ...base, mode: 'BIKE', bikeshare: true, agency: 'Bike Share Toronto', route: 'Bike Share', color: '#2e9b47', textColor: '#fff', from: pt(a), to: pt(b), start: iso(t1), end: iso(t2), durationMin: ride + unlockMin, distanceM: Math.round(abM * DETOUR), geometry: null, line: [[a.lat, a.lon], [b.lat, b.lon]] },
      { ...base, mode: 'WALK', from: pt(b), to: { name: 'END', lat: to.lat, lon: to.lon }, start: iso(t2), end: iso(t3), durationMin: walk2, distanceM: Math.round(b.distanceM * DETOUR), geometry: null, line: [[b.lat, b.lon], [to.lat, to.lon]] },
    ],
  };
}
