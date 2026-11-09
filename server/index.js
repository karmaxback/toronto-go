import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { ttc } from './sources/ttc.js';
import { go } from './sources/go.js';
import { weather, weatherImpact } from './sources/weather.js';
import { flights } from './sources/flights.js';
import { motis } from './sources/motis.js';
import { loadLive, matchLive, hasLiveFeed } from './live.js';
import { cached } from './cache.js';
import { allAlerts, planTrip } from './planner.js';
import { pushRoutes } from './push.js';
import { startNotifier } from './notifier.js';
import { stations as bikeStations, nearest as nearestBikes } from './sources/bikeshare.js';
import { goFares } from './fares.js';
import { searchPlaces } from './sources/geocode.js';

const app = express();
const root = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(root, '..', 'public'), { maxAge: 0 })); // ETag revalidation, always fresh

// Let the Expo web build (served from another origin during development) call the API.
// The API is public, read-only data plus push endpoints that require the subscriber's secret endpoint URL,
// and no cookies are used, so allowing any origin is safe.
app.use('/api', (req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

/** Wrap an async handler so errors become JSON 502s instead of crashes. */
const route = (fn) => async (req, res) => {
  try {
    res.json(await fn(req, res));
  } catch (err) {
    console.error(`[${req.path}]`, err.message);
    res.status(err.status === 400 ? 400 : 502).json({ error: err.message });
  }
};
const bad = (msg) => Object.assign(new Error(msg), { status: 400 });

const coord = (s, name) => {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(s || '');
  if (!m) throw bad(`${name} must be "lat,lon"`);
  return { lat: Number(m[1]), lon: Number(m[2]) };
};


// ---------------------------------------------------------------- status
app.get('/api/status', route(async () => ({
  features: {
    ttcLive: true,
    goLive: go.enabled(),
    flights: flights.enabled(),
    weather: true,
    routing: config.motisUrl,
  },
  contactConfigured: Boolean(config.contact),
})));

// ---------------------------------------------------------------- weather + alerts
app.get('/api/weather', route(async () => {
  const [current, alerts] = await Promise.all([weather.current().catch(() => null), weather.alerts().catch(() => [])]);
  return { current, alerts, impact: weatherImpact(current, alerts) };
}));

app.get('/api/alerts', route(async () => {
  const a = await allAlerts();
  // Show what's happening now first, then planned work.
  a.transit.sort((x, y) => Number(y.activeNow) - Number(x.activeNow));
  // TTC publishes some alerts twice (once per direction) — keep one.
  const seen = new Set();
  a.transit = a.transit.filter((x) => !seen.has(x.source + x.header) && seen.add(x.source + x.header));
  return a;
}));

// ---------------------------------------------------------------- places
app.get('/api/geocode', route(async (req) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 3) return [];
  let near = null;
  if (req.query.near) {
    try { near = coord(req.query.near, 'near'); } catch { near = null; }
  }
  return searchPlaces(q.slice(0, 120), near);
}));

app.get('/api/reverse', route(async (req) => {
  const { lat, lon } = coord(req.query.at, 'at');
  return motis.reverse(lat, lon);
}));

// ---------------------------------------------------------------- live vehicles
app.get('/api/vehicles', route(async (req) => {
  const [minLon, minLat, maxLon, maxLat] = String(req.query.bbox || '').split(',').map(Number);
  const inBox = (v) => !Number.isFinite(minLat) ||
    (v.lat >= minLat && v.lat <= maxLat && v.lon >= minLon && v.lon <= maxLon);
  const [t, g] = await Promise.allSettled([ttc.vehicles(), go.enabled() ? go.vehicles() : Promise.resolve([])]);
  return {
    ttc: (t.value || []).filter(inBox),
    go: (g.value || []).filter(inBox),
  };
}));

// ---------------------------------------------------------------- departures near a point
const MODE_ORDER = { SUBWAY: 0, REGIONAL_RAIL: 1, RAIL: 1, LONG_DISTANCE: 1, TRAM: 2, BUS: 3, COACH: 4 };

app.get('/api/nearby', route(async (req) => {
  const { lat, lon } = coord(req.query.at, 'at');
  const radiusM = Math.min(Number(req.query.radius) || 400, 1500);
  const dLat = radiusM / 111_000;
  const dLon = radiusM / (111_000 * Math.cos((lat * Math.PI) / 180));
  const dist = (s) => Math.hypot((s.lat - lat) * 111_000, (s.lon - lon) * 111_000 * Math.cos((lat * Math.PI) / 180));

  const stops = await cached(`stops:${lat.toFixed(3)},${lon.toFixed(3)},${radiusM}`, 3600_000,
    () => motis.stopsInBox(lat - dLat, lon - dLon, lat + dLat, lon + dLon));
  const nearest = stops
    .filter((s) => !/^us-/.test(s.stopId)) // skip duplicate US-operator feeds (Amtrak/FlixBus) for the board
    .map((s) => ({ ...s, distanceM: Math.round(dist(s)) }))
    .filter((s) => s.distanceM <= radiusM)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, 10);

  const live = await loadLive();
  const now = Date.now();
  const boards = await Promise.all(nearest.map(async (s) => {
    let st;
    try { st = await motis.stoptimes(s.stopId, 10); } catch (e) { return null; }
    const departures = (st.stopTimes || [])
      .filter((x) => x.place?.pickupType !== 'NOT_ALLOWED' && !x.tripCancelled)
      .map((x) => {
        const scheduled = x.place.scheduledDeparture || x.place.departure;
        const m = matchLive(live, { stopId: x.place.stopId, routeId: x.routeId, tripId: x.tripId, scheduled });
        const motisRt = x.realTime && x.place.departure !== scheduled;
        return {
          route: x.routeShortName || x.displayName,
          headsign: x.headsign,
          mode: x.mode,
          agency: x.agencyName,
          color: x.routeColor ? `#${x.routeColor}` : null,
          textColor: x.routeTextColor ? `#${x.routeTextColor}` : null,
          scheduled,
          time: m?.time || x.place.departure || scheduled,
          live: Boolean(m) || Boolean(x.realTime),
          delayMin: m?.delayMin ?? (motisRt ? Math.round((Date.parse(x.place.departure) - Date.parse(scheduled)) / 60000) : 0),
          track: x.place.track || null,
        };
      })
      .filter((d) => Date.parse(d.time) > now - 60_000)
      .sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
    if (!departures.length) return null;
    return {
      stopId: s.stopId,
      name: s.name,
      lat: s.lat,
      lon: s.lon,
      distanceM: s.distanceM,
      liveFeed: hasLiveFeed(live, s.stopId),
      departures: departures.slice(0, 6),
    };
  }));

  // Merge platforms that share a name (e.g. both sides of a station), keep closest first.
  const byName = new Map();
  for (const b of boards.filter(Boolean)) {
    const prev = byName.get(b.name);
    if (!prev) { byName.set(b.name, b); continue; }
    prev.departures = [...prev.departures, ...b.departures]
      .sort((a, c) => Date.parse(a.time) - Date.parse(c.time)).slice(0, 8);
  }
  return [...byName.values()].sort((a, b) =>
    (MODE_ORDER[a.departures[0]?.mode] ?? 5) - (MODE_ORDER[b.departures[0]?.mode] ?? 5) || a.distanceM - b.distanceM);
}));

// ---------------------------------------------------------------- trip planner
app.get('/api/plan', route(async (req) => {
  const time = req.query.time ? new Date(String(req.query.time)) : null;
  if (time && Number.isNaN(time.getTime())) throw bad('time must be an ISO date');
  return planTrip({
    from: coord(req.query.from, 'from'),
    to: coord(req.query.to, 'to'),
    time,
    arriveBy: req.query.arriveBy === 'true',
    pref: String(req.query.pref || 'balanced'),
    accessible: req.query.accessible === 'true',
    coach: req.query.coach === 'true',
    rider: String(req.query.rider || 'adult'),
  });
}));

// ---------------------------------------------------------------- Bike Share Toronto
app.get('/api/bikeshare', route(async (req) => {
  const [minLon, minLat, maxLon, maxLat] = String(req.query.bbox || '').split(',').map(Number);
  if (![minLon, minLat, maxLon, maxLat].every(Number.isFinite)) throw bad('bbox=minLon,minLat,maxLon,maxLat required');
  const all = await bikeStations();
  const c = { lat: (minLat + maxLat) / 2, lon: (minLon + maxLon) / 2 };
  const d = (s) => (s.lat - c.lat) ** 2 + ((s.lon - c.lon) * 0.72) ** 2;
  return all
    .filter((s) => s.lat >= minLat && s.lat <= maxLat && s.lon >= minLon && s.lon <= maxLon)
    .sort((a, b) => d(a) - d(b))
    .slice(0, 400); // closest to the centre first, so a busy view never has holes in the middle
}));

app.get('/api/bikeshare/near', route(async (req) => {
  const at = coord(req.query.at, 'at');
  const [withBikes, withDocks] = await Promise.all([
    nearestBikes(at, 'bikes', { radius: 600, limit: 4 }),
    nearestBikes(at, 'docks', { radius: 600, limit: 4 }),
  ]);
  const byId = new Map([...withBikes, ...withDocks].map((s) => [s.id, s]));
  return [...byId.values()].sort((a, b) => a.distanceM - b.distanceM).slice(0, 4);
}));

// ---------------------------------------------------------------- airport
const PEARSON_UP = { lat: 43.6817, lon: -79.6118 }; // Pearson UP Express station (Terminal 1)

app.get('/api/airport', route(async () => {
  const [board, upFromPearson, upFromUnion] = await Promise.allSettled([
    flights.enabled() ? flights.board() : Promise.resolve(null),
    upDepartures(PEARSON_UP, 'ca-on-UP-Express_'),
    upDepartures({ lat: 43.6442, lon: -79.3836 }, 'ca-on-UP-Express_UN'),
  ]);
  return {
    flightsEnabled: flights.enabled(),
    flights: board.value || null,
    flightsError: board.status === 'rejected' ? board.reason.message : null,
    upExpress: {
      fromPearson: upFromPearson.value || [],
      fromUnion: upFromUnion.value || [],
    },
    terminals: {
      T1: { name: 'Pearson Terminal 1', lat: 43.6812, lon: -79.6124 },
      T3: { name: 'Pearson Terminal 3', lat: 43.6890, lon: -79.6195 },
    },
  };
}));

async function upDepartures(at, stopPrefix) {
  const d = 0.004;
  const stops = await cached(`upstops:${at.lat},${at.lon}`, 24 * 3600_000,
    () => motis.stopsInBox(at.lat - d, at.lon - d, at.lat + d, at.lon + d));
  const stop = stops.find((s) => s.stopId.startsWith(stopPrefix));
  if (!stop) return [];
  const st = await motis.stoptimes(stop.stopId, 6);
  const live = await loadLive();
  return (st.stopTimes || []).map((x) => {
    const scheduled = x.place.scheduledDeparture || x.place.departure;
    const m = matchLive(live, { stopId: x.place.stopId, routeId: x.routeId, tripId: x.tripId, scheduled });
    return { headsign: x.headsign, scheduled, time: m?.time || x.place.departure, live: Boolean(m || x.realTime), delayMin: m?.delayMin ?? 0 };
  });
}

app.use('/api/push', pushRoutes);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
startNotifier();
goFares(); // warm the GO fare table (downloads ~10 MB on first run, then weekly)

app.listen(config.port, () => {
  console.log(`Toronto Go running at http://localhost:${config.port}`);
  console.log(`  TTC live: on | GO/UP live: ${go.enabled() ? 'on' : 'off (set METROLINX_API_KEY)'} | Flights: ${flights.enabled() ? 'on' : 'off (set AERODATABOX_RAPIDAPI_KEY)'}`);
  console.log(`  Routing: ${config.motisUrl}${config.contact ? '' : '  (set CONTACT in .env — Transitous asks for it)'}`);
});
