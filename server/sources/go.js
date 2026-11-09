import { config } from '../config.js';
import { cached } from '../cache.js';
import { addTripUpdates, emptyIndex, fetchFeed, finishIndex, parseAlerts, parseVehicles } from './gtfsrt.js';

// Metrolinx Open Data API (GO Transit + UP Express). Needs a free key:
// https://api.openmetrolinx.com/OpenDataAPI/Help/Registration/en
const BASE = 'https://api.openmetrolinx.com/OpenDataAPI/api/V1/Gtfs/Feed';
const url = (feed) => `${BASE}/${feed}?key=${encodeURIComponent(config.metrolinxKey)}`;

export const go = {
  enabled: () => Boolean(config.metrolinxKey),

  tripUpdates: () => cached('go:trips', 30_000, async () =>
    finishIndex(addTripUpdates(emptyIndex(), await fetchFeed(url('TripUpdates'))))),

  vehicles: () => cached('go:vehicles', 20_000, async () =>
    parseVehicles(await fetchFeed(url('VehiclePosition')))),

  alerts: () => cached('go:alerts', 60_000, async () =>
    parseAlerts(await fetchFeed(url('Alerts')), 'GO')),
};
