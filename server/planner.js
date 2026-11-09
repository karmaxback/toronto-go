import { ttc } from './sources/ttc.js';
import { go } from './sources/go.js';
import { weather, weatherImpact } from './sources/weather.js';
import { motis } from './sources/motis.js';
import { loadLive } from './live.js';
import { rankPlan } from './rank.js';

/** TTC + GO service alerts and Environment Canada weather alerts. Each source fails independently. */
export async function allAlerts() {
  const [t, g, w] = await Promise.allSettled([
    ttc.alerts(),
    go.enabled() ? go.alerts() : Promise.resolve([]),
    weather.alerts(),
  ]);
  return {
    transit: [...(t.value || []), ...(g.value || [])],
    weather: w.value || [],
    errors: [t, g, w].filter((r) => r.status === 'rejected').map((r) => r.reason.message),
  };
}

const TRANSIT_MODES = 'SUBWAY,TRAM,BUS,FERRY,RAIL,REGIONAL_RAIL,REGIONAL_FAST_RAIL,SUBURBAN,LONG_DISTANCE,HIGHSPEED_RAIL,NIGHT_RAIL';

/**
 * Plan + rank a trip.
 * @param {{from:{lat,lon}, to:{lat,lon}, time?:Date|null, arriveBy?:boolean, pref?:string, accessible?:boolean, coach?:boolean}} p
 */
export async function planTrip({ from, to, time = null, arriveBy = false, pref = 'balanced', accessible = false, coach = false }) {
  const [plan, wx, alerts, live] = await Promise.all([
    motis.plan({
      fromPlace: `${from.lat},${from.lon}`,
      toPlace: `${to.lat},${to.lon}`,
      time: time?.toISOString(),
      arriveBy: arriveBy || undefined,
      numItineraries: 6,
      transitModes: coach ? `${TRANSIT_MODES},COACH` : TRANSIT_MODES,
      directModes: 'WALK,BIKE,CAR',
      maxDirectTime: 5400,
      pedestrianProfile: accessible ? 'WHEELCHAIR' : undefined,
    }),
    Promise.all([weather.current().catch(() => null), weather.alerts().catch(() => [])]),
    allAlerts(),
    loadLive(),
  ]);
  const impact = weatherImpact(wx[0], wx[1]);
  const options = rankPlan(plan, {
    live, alerts: alerts.transit, impact, pref,
    departAt: !arriveBy && time ? time.toISOString() : null,
  });
  return {
    from: plan.from,
    to: plan.to,
    options,
    weather: { current: wx[0], alerts: wx[1], impact },
    attribution: 'Routing © Transitous / MOTIS, data from TTC, Metrolinx, VIA Rail and OpenStreetMap contributors',
  };
}
