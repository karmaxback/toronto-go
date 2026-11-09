import { ttc } from './sources/ttc.js';
import { go } from './sources/go.js';

/**
 * Overlays official live predictions onto schedule data that comes from MOTIS/Transitous.
 *
 * MOTIS prefixes IDs with its feed name, e.g.
 *   stopId  "ca-on-TTC_13819"                       -> TTC stop "13819"
 *   routeId "ca-on-Metrolinx-gotransit_09261126-LW" -> GO route "09261126-LW"
 *   tripId  "20261109_06:40_ca-on-Metrolinx-gotransit_20261109-LW-1605" -> GO trip "20261109-LW-1605"
 */
const FEEDS = [
  { prefix: 'ca-on-TTC_', agency: 'ttc' },
  { prefix: 'ca-on-Metrolinx-gotransit_', agency: 'go' },
  { prefix: 'ca-on-UP-Express_', agency: 'go' },
];

function strip(id) {
  if (!id) return null;
  for (const f of FEEDS) {
    const i = id.indexOf(f.prefix);
    if (i >= 0) return { agency: f.agency, raw: id.slice(i + f.prefix.length) };
  }
  return null;
}

/** Load live indexes once per request (they're cached upstream). Failures just mean "no live data". */
export async function loadLive() {
  const [t, g] = await Promise.allSettled([ttc.tripUpdates(), go.enabled() ? go.tripUpdates() : Promise.resolve(null)]);
  if (t.status === 'rejected') console.warn('[live] TTC unavailable:', t.reason?.message);
  if (g.status === 'rejected') console.warn('[live] GO unavailable:', g.reason?.message);
  return {
    ttc: t.status === 'fulfilled' ? t.value : null,
    go: g.status === 'fulfilled' ? g.value : null,
    used: new Set(),
  };
}

const WINDOW_S = 12 * 60; // a prediction must be within 12 min of the scheduled time to be matched

/**
 * Find the live departure for one scheduled departure.
 * @returns {{time: string, delayMin: number}|null}
 */
export function matchLive(live, { stopId, routeId, tripId, scheduled }) {
  const stop = strip(stopId);
  if (!stop || !scheduled) return null;
  const idx = live[stop.agency];
  if (!idx) return null;
  const sched = Math.round(Date.parse(scheduled) / 1000);

  // 1) exact trip match (works for GO, whose live trip IDs match the published schedule)
  const trip = strip(tripId);
  if (trip) {
    const rec = idx.byTripStop.get(`${trip.raw}|${stop.raw}`);
    if (rec) return toResult(rec.time, sched);
  }

  // 2) same stop + same route, closest prediction in time not already claimed by another row
  const route = strip(routeId);
  if (!route) return null;
  const candidates = [route.raw, route.raw.split('-').pop()];
  for (const r of candidates) {
    const list = idx.byStopRoute.get(`${stop.raw}|${r}`);
    if (!list) continue;
    let best = null;
    for (const rec of list) {
      const key = `${stop.raw}|${r}|${rec.tripId}|${rec.time}`;
      if (live.used.has(key)) continue;
      const diff = Math.abs(rec.time - sched);
      if (diff <= WINDOW_S && (!best || diff < best.diff)) best = { rec, diff, key };
    }
    if (best) {
      live.used.add(best.key);
      return toResult(best.rec.time, sched);
    }
  }
  return null;
}

function toResult(time, sched) {
  return { time: new Date(time * 1000).toISOString(), delayMin: Math.round((time - sched) / 60) };
}

/** Does this stop belong to a feed we have live data for right now? */
export function hasLiveFeed(live, stopId) {
  const s = strip(stopId);
  return Boolean(s && live[s.agency]);
}

export { strip as stripFeedId };
