import { ttc } from './sources/ttc.js';
import { go } from './sources/go.js';
import { weather, weatherImpact } from './sources/weather.js';
import { motis } from './sources/motis.js';
import { loadLive } from './live.js';
import { rankPlan } from './rank.js';
import { bikeShareOption } from './sources/bikeshare.js';
import { addFares } from './fares.js';

/** TTC + GO service alerts and Environment Canada weather alerts. Each source fails independently. */
export async function allAlerts() {
  const [t, g, w, a] = await Promise.allSettled([
    ttc.alerts(),
    go.enabled() ? go.alerts() : Promise.resolve([]),
    weather.alerts(),
    ttc.accessibility(),
  ]);
  return {
    transit: [...(t.value || []), ...(g.value || [])],
    weather: w.value || [],
    accessibility: a.value || [],
    errors: [t, g, w, a].filter((r) => r.status === 'rejected').map((r) => r.reason.message),
  };
}

const TRANSIT_MODES = 'SUBWAY,TRAM,BUS,FERRY,RAIL,REGIONAL_RAIL,REGIONAL_FAST_RAIL,SUBURBAN,LONG_DISTANCE,HIGHSPEED_RAIL,NIGHT_RAIL';

/**
 * Plan + rank a trip.
 * @param {{from:{lat,lon}, to:{lat,lon}, time?:Date|null, arriveBy?:boolean, pref?:string, accessible?:boolean, coach?:boolean}} p
 */
function shiftOption(o, ms) {
  const sh = (iso) => new Date(Date.parse(iso) + ms).toISOString();
  o.start = sh(o.start);
  o.end = sh(o.end);
  for (const l of o.legs) { l.start = sh(l.start); l.end = sh(l.end); }
}

export async function planTrip({ from, to, time = null, arriveBy = false, pref = 'balanced', accessible = false, coach = false, rider = 'adult' }) {
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

  // Bike Share Toronto option, built from live station availability (not offered for step-free trips).
  const extra = [];
  if (!accessible) {
    const rawBike = (plan.direct || []).find((d) => d.legs?.[0]?.mode === 'BIKE');
    try {
      const bs = await bikeShareOption(from, to, {
        routedBike: rawBike ? { durationMin: rawBike.duration / 60 } : null,
        departAt: (!arriveBy && time ? time.getTime() : Date.now()),
      });
      if (bs) {
        if (arriveBy && time) shiftOption(bs, time.getTime() - Date.parse(bs.end));
        extra.push(bs);
      }
    } catch (err) {
      console.warn('[bikeshare]', err.message);
    }
  }

  const options = rankPlan(plan, {
    live, alerts: alerts.transit, access: alerts.accessibility, accessible, impact, pref,
    departAt: !arriveBy && time ? time.toISOString() : null,
    extra,
  });
  await addFares(options, rider);
  return {
    from: plan.from,
    to: plan.to,
    options,
    weather: { current: wx[0], alerts: wx[1], impact },
    attribution: 'Routing © Transitous / MOTIS, data from TTC, Metrolinx, VIA Rail and OpenStreetMap contributors',
  };
}
