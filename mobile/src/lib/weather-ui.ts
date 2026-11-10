import { fmtTime } from './format';
import type { IconName } from './icons';
import type { PrecipKind, UpcomingPrecip } from './types';

export const PRECIP_NAME: Record<PrecipKind, string> = { ice: 'Freezing rain', storm: 'Thunderstorms', mix: 'Rain and snow', snow: 'Snow', rain: 'Rain' };
export const PRECIP_ICON: Record<PrecipKind, IconName> = { ice: 'sleet', storm: 'storm', mix: 'sleet', snow: 'snow', rain: 'rain' };

/** Weather icon for an Environment Canada condition ("Mainly cloudy", "Light snow"...), day or night. */
export function conditionIcon(condition: string, night = false): IconName {
  const c = condition.toLowerCase();
  if (/thunder/.test(c)) return 'storm';
  if (/freezing|ice pellets|rain.*snow|snow.*rain|showers or flurries/.test(c)) return 'sleet';
  if (/snow|flurr|blizzard/.test(c)) return 'snow';
  if (/heavy rain|downpour/.test(c)) return 'pouring';
  if (/rain|shower|drizzle/.test(c)) return 'rain';
  if (/fog|mist|haze|smoke/.test(c)) return 'fog';
  // "Partly cloudy", "Mainly sunny", "A few clouds" -> sun/moon behind a cloud; "Mainly cloudy", "Overcast" -> cloud
  if (/partly|mainly sunny|mostly sunny|mainly clear|a few clouds|mix of sun/.test(c)) return night ? 'partlyMoon' : 'partlySun';
  if (/cloud|overcast/.test(c)) return 'cloud';
  if (/sun|clear/.test(c)) return night ? 'moon' : 'sun';
  if (/wind/.test(c)) return 'wind';
  return 'cloud';
}

/** Is it dark at this time? Uses today's sunrise/sunset (UTC) and shifts by whole days for other days. */
export function isNight(iso: string, sunrise?: string | null, sunset?: string | null) {
  if (!sunrise || !sunset) { const h = new Date(iso).getHours(); return h < 7 || h >= 18; }
  const DAY = 86_400_000;
  const t = Date.parse(iso);
  const rise = Date.parse(sunrise), set = Date.parse(sunset);
  const shift = Math.floor((t - rise) / DAY) * DAY; // move sunrise to the same day as t
  return t < rise + shift || t >= set + shift;
}

/** "Snow likely from about 4 pm (80%)" / "Rain until about 7 pm". */
export function upcomingLabel(u: UpcomingPrecip) {
  const name = PRECIP_NAME[u.kind];
  if (u.now) return `${name} until about ${fmtTime(u.end)}`;
  return `${name} likely from about ${fmtTime(u.start)}${u.pop ? ` (${u.pop}%)` : ''}`;
}

/** Show a heads-up when rain/snow is falling now or likely within 3 hours. */
export const upcomingSoon = (u?: UpcomingPrecip | null, now = Date.now()): u is UpcomingPrecip =>
  Boolean(u && (u.now || ((u.pop ?? 0) >= 60 && Date.parse(u.start) - now <= 3 * 3600_000)));
