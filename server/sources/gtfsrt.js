import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { http } from '../config.js';

const { FeedMessage } = GtfsRealtimeBindings.transit_realtime;

const num = (v) => (v == null ? null : typeof v === 'number' ? v : Number(v));

export async function fetchFeed(url, opts = {}) {
  const buf = await http(url, { as: 'buffer', ...opts });
  return FeedMessage.toObject(FeedMessage.decode(buf), { enums: String, longs: Number, defaults: false });
}

const text = (t) => t?.translation?.find((x) => !x.language || x.language.startsWith('en'))?.text
  ?? t?.translation?.[0]?.text ?? '';

const REMOVED = new Set(['CANCELED', 'CANCELLED', 'DELETED']);

/** Empty live index; merge feeds into it with addTripUpdates(). */
export function emptyIndex() {
  return { byTripStop: new Map(), byStopRoute: new Map(), cancelledTrips: new Set(), timestamp: null };
}

/**
 * Index a trip-update feed two ways:
 *  - byTripStop  `${tripId}|${stopId}` -> { time, delay }   (when trip IDs match the static schedule)
 *  - byStopRoute `${stopId}|${routeId}` -> sorted [{ time, delay, tripId }]
 *    (TTC's live trip IDs differ from its published schedule, so we match by stop + route + time)
 */
export function addTripUpdates(idx, feed) {
  for (const e of feed.entity || []) {
    const tu = e.tripUpdate;
    if (!tu?.trip) continue;
    const tripId = tu.trip.tripId ? String(tu.trip.tripId) : null;
    const routeId = tu.trip.routeId ? String(tu.trip.routeId) : null;
    if (REMOVED.has(tu.trip.scheduleRelationship)) {
      if (tripId) idx.cancelledTrips.add(tripId);
      continue;
    }
    let lastDelay = num(tu.delay);
    for (const s of tu.stopTimeUpdate || []) {
      if (!s.stopId || s.scheduleRelationship === 'SKIPPED' || s.scheduleRelationship === 'NO_DATA') continue;
      const ev = s.departure?.time ? s.departure : s.arrival;
      const time = num(ev?.time);
      const delay = num(ev?.delay) ?? lastDelay;
      if (delay != null) lastDelay = delay;
      if (time == null) continue;
      const rec = { time, delay, tripId };
      if (tripId) idx.byTripStop.set(`${tripId}|${s.stopId}`, rec);
      if (routeId) {
        const key = `${s.stopId}|${routeId}`;
        let list = idx.byStopRoute.get(key);
        if (!list) idx.byStopRoute.set(key, (list = []));
        list.push(rec);
      }
    }
  }
  idx.timestamp = Math.max(idx.timestamp || 0, num(feed.header?.timestamp) || 0);
  return idx;
}

export function finishIndex(idx) {
  for (const list of idx.byStopRoute.values()) list.sort((a, b) => a.time - b.time);
  return idx;
}

export function parseAlerts(feed, source) {
  const out = [];
  for (const e of feed.entity || []) {
    const a = e.alert;
    if (!a) continue;
    const routes = [...new Set((a.informedEntity || []).map((x) => x.routeId).filter(Boolean).map(String))];
    const stops = [...new Set((a.informedEntity || []).map((x) => x.stopId).filter(Boolean).map(String))];
    const now = Date.now() / 1000;
    const periods = (a.activePeriod || []).map((p) => ({ start: num(p.start), end: num(p.end) }));
    const activeNow = !periods.length || periods.some((p) => (!p.start || p.start <= now) && (!p.end || p.end >= now));
    out.push({
      id: `${source}:${e.id}`,
      source,
      header: text(a.headerText),
      description: text(a.descriptionText),
      effect: a.effect || null,
      cause: a.cause || null,
      severity: a.severityLevel || null,
      routes,
      stops,
      activeNow,
      periods,
      url: text(a.url) || null,
    });
  }
  return out;
}

export function parseVehicles(feed) {
  const out = [];
  for (const e of feed.entity || []) {
    const v = e.vehicle;
    if (!v?.position) continue;
    out.push({
      id: String(v.vehicle?.id ?? e.id),
      route: v.trip?.routeId ? String(v.trip.routeId) : null,
      tripId: v.trip?.tripId ? String(v.trip.tripId) : null,
      lat: v.position.latitude,
      lon: v.position.longitude,
      bearing: v.position.bearing ?? null,
      speed: v.position.speed ?? null,
      ts: num(v.timestamp),
      occupancy: v.occupancyStatus || null,
    });
  }
  return out;
}
