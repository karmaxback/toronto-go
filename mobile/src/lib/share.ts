import { Platform, Share } from 'react-native';

import { webBase } from './config';
import type { Place } from './types';

/** Same link format as the website: ?from=lat,lon,name&to=lat,lon,name */
const enc = (p: Place) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)},${encodeURIComponent(p.name)}`;
export const tripLink = (from: Place, to: Place) => `${webBase()}/?from=${enc(from)}&to=${enc(to)}`;

/** Parse "43.65,-79.38,Union Station" (name may contain commas). */
export function parsePlaceParam(s?: string | string[]): Place | null {
  const v = Array.isArray(s) ? s[0] : s;
  if (!v) return null;
  const [lat, lon, ...name] = v.split(',');
  const p = { lat: Number(lat), lon: Number(lon), name: decodeURIComponent(name.join(',')) || 'Pinned location' };
  return Number.isFinite(p.lat) && Number.isFinite(p.lon) ? p : null;
}

/** Share sheet on phones; on web use the browser share sheet or copy the link. Returns what happened. */
export async function shareTrip(from: Place, to: Place): Promise<'shared' | 'copied' | 'failed'> {
  const url = tripLink(from, to);
  const message = `Trip from ${from.name} to ${to.name} on Toronto Go: ${url}`;
  try {
    if (Platform.OS === 'web') {
      const nav = typeof navigator !== 'undefined' ? navigator : null;
      if (nav?.share) { await nav.share({ title: 'Toronto Go trip', text: message, url }); return 'shared'; }
      if (nav?.clipboard) { await nav.clipboard.writeText(url); return 'copied'; }
      return 'failed';
    }
    await Share.share({ message, url });
    return 'shared';
  } catch {
    return 'failed';
  }
}
