import { http } from '../config.js';
import { cached } from '../cache.js';

// Environment and Climate Change Canada — MSC GeoMet OGC API (free, no key).
const CITY = 'https://api.weather.gc.ca/collections/citypageweather-realtime/items?f=json&identifier=on-143'; // Toronto
const ALERTS = 'https://api.weather.gc.ca/collections/weather-alerts/items?f=json&limit=50&bbox=-79.9,43.4,-79.0,44.0'; // GTA

const en = (x) => (x && typeof x === 'object' && 'en' in x ? x.en : x);
const val = (x) => en(x?.value);
/** Sunrise / sunset time from the city page (ISO), if present. */
const riseSet = (p, which) => en(p.riseSet?.[which]) || null;

function severityOf(a) {
  const colour = (a.risk_colour_en || '').toLowerCase();
  const type = (a.alert_type || '').toLowerCase();
  if (colour === 'red' || type === 'warning') return 'severe';
  if (colour === 'orange' || type === 'watch') return 'moderate';
  return 'minor';
}

/**
 * "Feels like" the way Environment Canada defines it: wind chill at 10 °C and below (with wind),
 * humidex at 20 °C and above (needs the dew point), otherwise the air temperature.
 * (We compute it because the feed sometimes carries a stale wind-chill value.)
 */
export function feelsLike(t, windKmh, dewpoint) {
  if (t == null || !Number.isFinite(t)) return null;
  if (t <= 10 && windKmh != null && windKmh >= 5) {
    const v = windKmh ** 0.16;
    return Math.round(13.12 + 0.6215 * t - 11.37 * v + 0.3965 * t * v);
  }
  if (t >= 20 && dewpoint != null && Number.isFinite(dewpoint)) {
    const e = 6.11 * Math.exp(5417.753 * (1 / 273.16 - 1 / (273.15 + dewpoint)));
    const h = t + 0.5555 * (e - 10);
    if (h >= t + 1) return Math.round(h);
  }
  return Math.round(t);
}

/** What falls from the sky, from a forecast condition: 'ice' | 'storm' | 'mix' | 'snow' | 'rain' | null. */
export function precipKind(condition = '') {
  const c = condition.toLowerCase();
  if (/freezing|ice pellets|\bice\b/.test(c)) return 'ice';
  if (/thunder/.test(c)) return 'storm';
  const snow = /snow|flurr|blizzard/.test(c);
  const rain = /rain|shower|drizzle/.test(c);
  if (snow && rain) return 'mix';
  if (snow) return 'snow';
  if (rain) return 'rain';
  return null;
}

export const PRECIP_NAME = { ice: 'Freezing rain', storm: 'Thunderstorms', mix: 'Rain and snow', snow: 'Snow', rain: 'Rain' };

/**
 * The next stretch of rain/snow in the hourly forecast (within `hours`), or what's falling now.
 * Returns { kind, start, end, pop, now } or null. `pop` is the highest chance (%) in that stretch.
 */
export function upcomingPrecip(hourly, now = Date.now(), { hours = 12, minPop = 40 } = {}) {
  const wet = (h) => h.kind && (h.pop == null || h.pop >= minPop);
  const list = (hourly || []).filter((h) => Date.parse(h.time) + 3600_000 > now && Date.parse(h.time) < now + hours * 3600_000);
  const i = list.findIndex(wet);
  if (i < 0) return null;
  let j = i;
  while (j + 1 < list.length && wet(list[j + 1])) j++;
  const stretch = list.slice(i, j + 1);
  // the most serious kind in the stretch wins (freezing rain beats rain)
  const order = ['ice', 'storm', 'mix', 'snow', 'rain'];
  const kind = order.find((k) => stretch.some((h) => h.kind === k));
  return {
    kind,
    start: stretch[0].time,
    end: new Date(Date.parse(stretch[stretch.length - 1].time) + 3600_000).toISOString(),
    pop: Math.max(...stretch.map((h) => h.pop ?? 0)) || null,
    now: Date.parse(stretch[0].time) <= now,
  };
}

/** Plain-language "what this means for getting around" for an Environment Canada alert. */
export function travelTips(name = '') {
  const n = name.toLowerCase();
  if (/freezing|ice|frost/.test(n)) return 'Icy sidewalks, stairs and platforms. Buses and streetcars run slower and GO trains may be delayed. Allow extra time and watch your step.';
  if (/snow squall|blizzard|winter storm|snowfall|snow/.test(n)) return 'Buses and streetcars run slower in snow and GO trains may be delayed. The subway is the most reliable. Allow extra time.';
  if (/thunder|tornado/.test(n)) return 'Lightning can pause streetcars and GO trains, and roads may flood. Wait indoors and check service alerts before leaving.';
  if (/rain/.test(n)) return 'Heavy rain can flood underpasses and slow buses. The subway and GO trains are the most reliable. Allow extra time.';
  if (/wind/.test(n)) return 'Falling branches can block streetcar and bus routes. Cycling and Bike Share are not recommended. Check service alerts.';
  if (/heat|humid/.test(n)) return 'Take water, wait in shade, and choose routes with less walking. Subway and GO trains are air-conditioned.';
  if (/cold/.test(n)) return 'Cover exposed skin and limit time waiting outside. Use heated shelters and stations, and choose routes with less walking.';
  if (/fog/.test(n)) return 'Low visibility can slow GO trains, UP Express and flights at Pearson. Check times before you leave.';
  if (/air quality|smoke|smog/.test(n)) return 'Consider limiting time outdoors; the subway and GO trains are a good way to avoid walking and cycling.';
  return 'Check service alerts and allow extra travel time.';
}

export const weather = {
  current: () => cached('wx:city', 10 * 60_000, async () => {
    const data = await http(CITY);
    const p = data.features?.[0]?.properties;
    if (!p) throw new Error('No Toronto weather data');
    const c = p.currentConditions || {};
    const forecasts = (p.forecastGroup?.forecasts || []).slice(0, 4).map((f) => ({
      period: en(f.period?.textForecastName) || en(f.period?.value),
      summary: en(f.textSummary) || [en(f.abbreviatedForecast?.textSummary), en(f.temperatures?.textSummary)].filter(Boolean).join(' '),
      precip: (f.precipitation?.precipPeriods || []).map((x) => en(x.value)).filter(Boolean),
    }));
    const hourly = (p.hourlyForecastGroup?.hourlyForecasts || []).map((h) => {
      const temp = val(h.temperature);
      const windKmh = Number(val(h.wind?.speed)) || null;
      const condition = en(h.condition) || '';
      return {
        time: h.timestamp,
        condition,
        temp,
        feelsLike: feelsLike(temp, windKmh, null),
        pop: val(h.lop) ?? null, // chance of precipitation, %
        windKmh,
        kind: precipKind(condition),
      };
    }).filter((h) => h.time && h.temp != null);
    const temperature = val(c.temperature);
    return {
      updated: en(p.lastUpdated) || en(c.timestamp),
      station: 'Toronto (Pearson)',
      condition: en(c.condition) || '',
      temperature,
      feelsLike: feelsLike(temperature, val(c.wind?.speed), val(c.dewpoint)),
      windKmh: val(c.wind?.speed),
      gustKmh: val(c.wind?.gust),
      windDir: val(c.wind?.direction),
      humidity: val(c.relativeHumidity),
      icon: c.iconCode?.url || null,
      forecasts,
      hourly,
      sunrise: riseSet(p, 'sunrise'),
      sunset: riseSet(p, 'sunset'),
      url: 'https://weather.gc.ca/en/location/index.html?coords=43.655,-79.383',
    };
  }),

  alerts: () => cached('wx:alerts', 5 * 60_000, async () => {
    const data = await http(ALERTS);
    const seen = new Set();
    const out = [];
    for (const f of data.features || []) {
      const a = f.properties || {};
      if ((a.status_en || '').toLowerCase().includes('ended')) continue;
      const exp = a.expiration_datetime && Date.parse(a.expiration_datetime);
      if (exp && exp < Date.now()) continue;
      const key = `${a.alert_name_en}|${a.alert_text_en}`;
      if (seen.has(key)) continue; // same alert repeats for each sub-region
      seen.add(key);
      out.push({
        id: `wx:${a.feature_id || out.length}`,
        source: 'Environment Canada',
        name: a.alert_name_en || a.alert_short_name_en || 'Weather alert',
        type: a.alert_type || null,
        severity: severityOf(a),
        colour: a.risk_colour_en || null,
        area: a.feature_name_en || null,
        text: a.alert_text_en || '',
        impact: a.impact_en || null,
        issued: a.publication_datetime || null,
        expires: a.expiration_datetime || null,
        status: a.status_en || null,
        tips: travelTips(a.alert_name_en || a.alert_short_name_en || ''),
        url: 'https://weather.gc.ca/en/location/index.html?coords=43.655,-79.383',
      });
    }
    return out;
  }),
};

/**
 * Turn weather into routing preferences: how much to penalise walking/biking and why.
 * For a trip later on (`at`), the hourly forecast for that time is used instead of the weather right now.
 */
export function weatherImpact(current, alerts, { at = null, now = Date.now() } = {}) {
  const notes = [];
  let walkPenalty = 1; // multiplier on walking minutes
  let bikeOk = true;
  const later = at && at - now > 45 * 60_000;
  const hour = later ? (current?.hourly || []).find((h) => Math.abs(Date.parse(h.time) + 1800_000 - at) <= 1800_000) : null;
  const t = hour ? hour.feelsLike : current?.feelsLike;
  const condition = hour ? hour.condition : current?.condition || '';
  const kind = hour ? (hour.pop == null || hour.pop >= 40 ? hour.kind : null) : precipKind(condition);
  const when = hour ? 'at your trip time' : 'now';
  const forecast = hour ? `forecast ${when}${hour.pop ? ` (${hour.pop}%)` : ''}` : 'now';

  if (t != null && t <= -15) { walkPenalty = 2.2; bikeOk = false; notes.push(`Extreme cold ${when} (feels like ${t}°C): routes with less walking are preferred.`); }
  else if (t != null && t <= -5) { walkPenalty = 1.5; notes.push(`Cold ${when} (feels like ${t}°C): walking is weighted more heavily.`); }
  else if (t != null && t >= 32) { walkPenalty = 1.5; notes.push(`Heat ${when} (feels like ${t}°C): routes with less walking are preferred.`); }
  if (kind === 'ice' || kind === 'snow' || kind === 'mix') {
    walkPenalty = Math.max(walkPenalty, 1.8); bikeOk = false;
    notes.push(`${PRECIP_NAME[kind]} ${forecast}: slippery sidewalks, cycling not recommended.`);
  } else if (kind === 'rain' || kind === 'storm') {
    walkPenalty = Math.max(walkPenalty, 1.4); bikeOk = false;
    notes.push(`${PRECIP_NAME[kind]} ${forecast}: less walking preferred.`);
  } else if (!later) {
    // leaving now and it's dry: warn if rain/snow is due within the next two hours
    const next = upcomingPrecip(current?.hourly, now, { hours: 2, minPop: 60 });
    if (next && !next.now) notes.push(`${PRECIP_NAME[next.kind]} likely soon (${next.pop}%). Take an umbrella or allow extra time.`);
  }
  if (!hour && (current?.gustKmh ?? 0) >= 60) { bikeOk = false; notes.push(`Wind gusts of ${current.gustKmh} km/h.`); }
  const severe = (alerts || []).filter((a) => a.severity !== 'minor');
  if (severe.length) {
    walkPenalty = Math.max(walkPenalty, 1.8);
    bikeOk = false;
    notes.push(`Active weather alert: ${severe.map((a) => a.name).join(', ')}. Allow extra travel time.`);
  }
  return { walkPenalty, bikeOk, notes };
}
