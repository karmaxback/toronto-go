import { getSettings } from './settings';
import type { Fare } from './types';

const TZ = 'America/Toronto';
const time12 = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true });
const time24 = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** "6:40 pm", or "18:40" when Settings → 24-hour clock is on. */
export const fmtTime = (iso?: string | null) => {
  if (!iso) return '';
  if (getSettings().clock === '24h') return time24.format(new Date(iso));
  return time12.format(new Date(iso)).replace(/\s?([ap])\.?\s?m\.?/i, (_m, x: string) => ` ${x.toLowerCase()}m`);
};

export const minsUntil = (iso: string) => Math.round((Date.parse(iso) - Date.now()) / 60000);

export const durLabel = (m: number) =>
  m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, weekday: 'long' });
const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

/** "Leave now" / "Leave in 12 min" / "Leave at 6:40 pm" / "Leave tomorrow at 9:05 am" / "Leave Friday at 8:15 am" */
export function leaveLabel(iso: string) {
  const m = minsUntil(iso);
  if (m <= 0) return 'Leave now';
  if (m < 90) return `Leave in ${durLabel(m)}`;
  const today = dateKey.format(new Date());
  const tomorrow = dateKey.format(new Date(Date.now() + 86_400_000));
  const d = dateKey.format(new Date(iso));
  const day = d === today ? '' : d === tomorrow ? 'tomorrow ' : `${dayFmt.format(new Date(iso))} `;
  return `Leave ${day}at ${fmtTime(iso)}`;
}

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
