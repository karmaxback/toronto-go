import { matchLive, stripFeedId } from './live.js';

const min = (s) => s / 60;
const isTransit = (l) => !['WALK', 'BIKE', 'CAR', 'RENTAL', 'FLEX', 'ODM', 'CAR_PARKING', 'BIKE_TO_PARK'].includes(l.mode);

/** Alerts that affect a leg (same route or a stop it uses), only while active. */
function alertsForLeg(leg, alerts) {
  const route = stripFeedId(leg.routeId);
  const stops = [leg.from?.stopId, leg.to?.stopId].map(stripFeedId).filter(Boolean);
  if (!route && !stops.length) return [];
  const source = route?.agency === 'ttc' ? 'TTC' : 'GO';
  const routeKeys = route ? [route.raw, route.raw.split('-').pop()] : [];
  return alerts.filter((a) => a.activeNow && a.source === source && (
    a.routes.some((r) => routeKeys.includes(r)) || a.stops.some((s) => stops.some((x) => x.raw === s))
  ));
}

const SERIOUS = new Set(['NO_SERVICE', 'DETOUR', 'STOP_MOVED']);

/**
 * An alert is "serious" for a leg only if it removes/moves service AND either names
 * no specific stops (whole route) or names a stop this leg boards or alights at.
 * Route-wide notices like "reduced service after 11 p.m." stay informational.
 */
function isSerious(alert, leg) {
  if (!SERIOUS.has(alert.effect)) return false;
  if (!alert.stops.length) return true;
  const mine = [leg.from?.stopId, leg.to?.stopId].map(stripFeedId).filter(Boolean).map((s) => s.raw);
  return alert.stops.some((s) => mine.includes(s));
}

/** Simplify a MOTIS itinerary for the UI and attach live times + alerts. */
function shapeItinerary(it, { live, alerts, kind }) {
  const legs = it.legs.map((l) => {
    const transit = isTransit(l);
    const liveDep = transit ? matchLive(live, {
      stopId: l.from?.stopId, routeId: l.routeId, tripId: l.tripId, scheduled: l.scheduledStartTime || l.startTime,
    }) : null;
    const legAlerts = transit ? alertsForLeg(l, alerts) : [];
    return {
      mode: l.mode,
      transit,
      agency: l.agencyName || null,
      route: l.routeShortName || l.displayName || null,
      routeName: l.routeLongName || null,
      color: l.routeColor ? `#${l.routeColor}` : null,
      textColor: l.routeTextColor ? `#${l.routeTextColor}` : null,
      headsign: l.headsign || null,
      from: { name: l.from?.name, lat: l.from?.lat, lon: l.from?.lon, track: l.from?.track || null },
      to: { name: l.to?.name, lat: l.to?.lat, lon: l.to?.lon, track: l.to?.track || null },
      start: l.startTime,
      end: l.endTime,
      scheduledStart: l.scheduledStartTime || l.startTime,
      realTime: Boolean(l.realTime || liveDep),
      live: liveDep,
      durationMin: Math.round(min(l.duration)),
      distanceM: l.distance ? Math.round(l.distance) : null,
      stops: l.intermediateStops?.length ?? null,
      geometry: l.legGeometry ? { points: l.legGeometry.points, precision: l.legGeometry.precision ?? 6 } : null,
      fareUrl: l.agencyFareUrl || null,
      alerts: legAlerts.map((a) => ({ id: a.id, header: a.header, effect: a.effect, serious: isSerious(a, l) })),
      serious: legAlerts.some((a) => isSerious(a, l)),
      cancelled: Boolean(l.cancelled),
    };
  });

  // If the first vehicle is running late/early per live data, shift the whole trip's departure.
  const firstTransit = legs.find((l) => l.transit);
  const shiftMin = firstTransit?.live?.delayMin ?? 0;
  const lastTransit = [...legs].reverse().find((l) => l.transit);
  const arrivalDelay = lastTransit?.live?.delayMin ?? shiftMin; // best guess: delays propagate
  const start = new Date(Date.parse(it.startTime) + shiftMin * 60000).toISOString();
  const end = new Date(Date.parse(it.endTime) + Math.max(0, arrivalDelay) * 60000).toISOString();

  return {
    kind, // transit | walk | bike | car
    start,
    end,
    durationMin: Math.round((Date.parse(end) - Date.parse(start)) / 60000),
    transfers: it.transfers ?? Math.max(0, legs.filter((l) => l.transit).length - 1),
    walkMin: Math.round(legs.filter((l) => l.mode === 'WALK').reduce((s, l) => s + l.durationMin, 0)),
    legs,
    live: legs.some((l) => l.live),
    hasAlerts: legs.some((l) => l.alerts.length),
    serious: legs.some((l) => l.serious || l.cancelled),
    needsTicket: legs.some((l) => ['COACH', 'LONG_DISTANCE', 'HIGHSPEED_RAIL', 'NIGHT_RAIL'].includes(l.mode)),
  };
}

const PREFS = {
  balanced: { transfer: 5, walk: 0.5 },
  fastest: { transfer: 1, walk: 0 },
  fewer_transfers: { transfer: 15, walk: 0.3 },
  less_walking: { transfer: 4, walk: 2 },
};

/**
 * Rank all options. Score = minutes until arrival + penalties for transfers, walking
 * (heavier in bad weather), service alerts, and tickets/reservations.
 */
export function rankPlan(plan, { live, alerts, impact, pref = 'balanced', departAt }) {
  const p = PREFS[pref] || PREFS.balanced;
  const t0 = departAt ? Date.parse(departAt) : Date.now();
  const options = [
    ...(plan.itineraries || []).map((it) => shapeItinerary(it, { live, alerts, kind: 'transit' })),
    ...(plan.direct || []).map((it) => shapeItinerary(it, { live, alerts, kind: (it.legs[0]?.mode || 'walk').toLowerCase() })),
  ];

  for (const o of options) {
    const reasons = [];
    let score = (Date.parse(o.end) - t0) / 60000;
    score += o.transfers * p.transfer;
    score += o.walkMin * (p.walk + (impact.walkPenalty - 1));
    if (o.kind === 'bike') {
      const bikeMin = o.durationMin;
      if (!impact.bikeOk) { score += 25 + bikeMin * 0.5; reasons.push('Weather is poor for cycling'); }
    }
    if (o.kind === 'walk' && o.durationMin > 25) score += (o.durationMin - 25) * 0.5;
    if (o.kind === 'car') reasons.push('Drive/taxi estimate: live traffic and parking not included');
    if (o.serious) { score += 30; reasons.push('Service disruption affects this trip'); } else if (o.hasAlerts) { score += 3; }
    if (o.needsTicket) { score += 20; reasons.push('Intercity service, ticket or reservation needed'); }
    o.score = Math.round(score);
    o.warnings = reasons;
  }

  // Car is shown for comparison only, after the transit/walk/bike options.
  options.sort((a, b) => Number(a.kind === 'car') - Number(b.kind === 'car') || a.score - b.score);
  // de-duplicate options that look identical (same routes, same departure minute)
  const seen = new Set();
  const unique = options.filter((o) => {
    const sig = `${o.kind}|${o.start.slice(0, 16)}|${o.legs.filter((l) => l.transit).map((l) => l.route).join('>')}`;
    if (seen.has(sig)) return false;
    seen.add(sig);
    return true;
  });

  const tag = (fn, label) => {
    const transit = unique.filter((o) => o.kind === 'transit');
    if (transit.length < 2) return;
    const values = transit.map(fn);
    if (Math.min(...values) === Math.max(...values)) return; // tag only when it actually distinguishes
    const best = transit.reduce((a, b) => (fn(b) < fn(a) ? b : a));
    (best.tags ||= []).push(label);
  };
  if (unique[0] && unique[0].kind !== 'car') (unique[0].tags ||= []).push('Recommended');
  tag((o) => Date.parse(o.end), 'Arrives first');
  tag((o) => o.transfers, 'Fewest transfers');
  tag((o) => o.walkMin, 'Least walking');
  for (const o of unique) o.tags = [...new Set(o.tags || [])];
  const cars = unique.filter((o) => o.kind === 'car').slice(0, 1);
  return [...unique.filter((o) => o.kind !== 'car').slice(0, 7), ...cars];
}
