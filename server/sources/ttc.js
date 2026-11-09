import { cached } from '../cache.js';
import { addTripUpdates, emptyIndex, fetchFeed, finishIndex, parseAlerts, parseVehicles } from './gtfsrt.js';

// Official TTC GTFS-Realtime feeds: https://gtfsrt.ttc.ca/
const BASE = 'https://gtfsrt.ttc.ca';

export const ttc = {
  /** Bus + streetcar trip updates and subway trip updates, merged into one index. */
  tripUpdates: () => cached('ttc:trips', 20_000, async () => {
    const results = await Promise.allSettled([
      fetchFeed(`${BASE}/trips/update?format=binary`),
      fetchFeed(`${BASE}/trips/subway?format=binary`),
    ]);
    const idx = emptyIndex();
    for (const r of results) {
      if (r.status === 'fulfilled') addTripUpdates(idx, r.value);
      else console.warn('[ttc] trip feed failed:', r.reason?.message);
    }
    if (!idx.byStopRoute.size) throw new Error('No TTC trip updates available');
    return finishIndex(idx);
  }),

  vehicles: () => cached('ttc:vehicles', 15_000, async () =>
    parseVehicles(await fetchFeed(`${BASE}/vehicles/position?format=binary`))),

  alerts: () => cached('ttc:alerts', 60_000, async () =>
    parseAlerts(await fetchFeed(`${BASE}/alerts/all?format=binary`), 'TTC')),
};
