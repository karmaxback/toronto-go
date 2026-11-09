import { config, http } from '../config.js';
import { cached } from '../cache.js';

// Toronto Pearson (CYYZ) live arrivals/departures via AeroDataBox (RapidAPI).
// Free plan has a small monthly quota, so results are cached for 5 minutes for everyone.
const HOST = 'aerodatabox.p.rapidapi.com';

/** "YYYY-MM-DDTHH:mm" in Toronto local time. */
function torontoLocal(date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

const pickTime = (m) => ({
  scheduled: m?.scheduledTime?.utc || null,
  revised: m?.revisedTime?.utc || m?.predictedTime?.utc || m?.runwayTime?.utc || null,
});

function mapFlight(f, direction) {
  const here = direction === 'arrival' ? f.arrival : f.departure;
  const other = direction === 'arrival' ? f.departure : f.arrival;
  const t = pickTime(here);
  const delayMin = t.scheduled && t.revised ? Math.round((Date.parse(t.revised) - Date.parse(t.scheduled)) / 60000) : null;
  return {
    number: f.number,
    airline: f.airline?.name || null,
    status: f.status || null,
    direction,
    city: other?.airport?.municipalityName || other?.airport?.name || null,
    airport: other?.airport?.iata || other?.airport?.icao || null,
    terminal: here?.terminal || null,
    gate: here?.gate || null,
    baggage: here?.baggageBelt || null,
    scheduled: t.scheduled,
    estimated: t.revised,
    delayMin,
    codeshare: f.codeshareStatus === 'IsCodeshared',
  };
}

export const flights = {
  enabled: () => Boolean(config.aeroDataBoxKey),

  board: () => cached('flights:yyz', 5 * 60_000, async () => {
    const now = new Date();
    const from = torontoLocal(new Date(now.getTime() - 60 * 60_000));
    const to = torontoLocal(new Date(now.getTime() + 6 * 60 * 60_000));
    const url = `https://${HOST}/flights/airports/icao/CYYZ/${from}/${to}` +
      '?withLeg=true&direction=Both&withCancelled=true&withCodeshared=false&withCargo=false&withPrivate=false';
    const data = await http(url, { headers: { 'X-RapidAPI-Key': config.aeroDataBoxKey, 'X-RapidAPI-Host': HOST } });
    const sortKey = (x) => Date.parse(x.estimated || x.scheduled || 0);
    return {
      updated: new Date().toISOString(),
      arrivals: (data.arrivals || []).map((f) => mapFlight(f, 'arrival')).sort((a, b) => sortKey(a) - sortKey(b)),
      departures: (data.departures || []).map((f) => mapFlight(f, 'departure')).sort((a, b) => sortKey(a) - sortKey(b)),
    };
  }),
};
