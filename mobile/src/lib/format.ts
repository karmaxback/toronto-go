import type { Fare } from './types';

const TZ = 'America/Toronto';
const timeFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });

export const fmtTime = (iso?: string | null) =>
  iso ? timeFmt.format(new Date(iso)).replace(/\s?([ap])\.?\s?m\.?/i, (_m, x: string) => ` ${x.toLowerCase()}m`) : '';

export const minsUntil = (iso: string) => Math.round((Date.parse(iso) - Date.now()) / 60000);

export const durLabel = (m: number) =>
  m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;

export function inLabel(iso: string) {
  const m = minsUntil(iso);
  if (m <= 0) return 'Now';
  if (m < 60) return `${m} min`;
  return fmtTime(iso);
}

export function delayText(d?: number | null) {
  if (d == null || Math.abs(d) < 1) return 'on time';
  return d > 0 ? `${d} min late` : `${-d} min early`;
}

export const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export const money = (n: number) => `$${n.toFixed(2)}`;
export function fareText(f?: Fare | null) {
  if (!f) return '';
  if (f.total === 0 && f.complete) return 'Free';
  return `${money(f.total)}${f.complete ? '' : '+'}`;
}

export const modeName = (m: string) =>
  ({ WALK: 'Walk', BIKE: 'Bike', CAR: 'Drive', BUS: 'Bus', TRAM: 'Streetcar', SUBWAY: 'Subway', REGIONAL_RAIL: 'Train', RAIL: 'Train', LONG_DISTANCE: 'Train', COACH: 'Coach', FERRY: 'Ferry' } as Record<string, string>)[m] || m;

/** "Union Station GO 06:34 - Bramalea GO 07:12" -> "Bramalea GO" */
export function cleanHeadsign(h?: string | null) {
  if (!h) return '';
  const m = /^.+? \d{1,2}:\d{2} - (.+?) \d{1,2}:\d{2}$/.exec(h);
  return m ? m[1] : h;
}

export function decodePolyline(str: string, precision = 6): [number, number][] {
  const factor = 10 ** precision;
  let lat = 0, lon = 0, i = 0;
  const out: [number, number][] = [];
  while (i < str.length) {
    for (const which of [0, 1]) {
      let shift = 0, result = 0, b: number;
      do { b = str.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += d; else lon += d;
    }
    out.push([lat / factor, lon / factor]);
  }
  return out;
}
