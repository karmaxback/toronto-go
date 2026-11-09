import { http } from '../config.js';
import { cached } from '../cache.js';

// Environment and Climate Change Canada — MSC GeoMet OGC API (free, no key).
const CITY = 'https://api.weather.gc.ca/collections/citypageweather-realtime/items?f=json&identifier=on-143'; // Toronto
const ALERTS = 'https://api.weather.gc.ca/collections/weather-alerts/items?f=json&limit=50&bbox=-79.9,43.4,-79.0,44.0'; // GTA

const en = (x) => (x && typeof x === 'object' && 'en' in x ? x.en : x);
const val = (x) => en(x?.value);

function severityOf(a) {
  const colour = (a.risk_colour_en || '').toLowerCase();
  const type = (a.alert_type || '').toLowerCase();
  if (colour === 'red' || type === 'warning') return 'severe';
  if (colour === 'orange' || type === 'watch') return 'moderate';
  return 'minor';
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
    return {
      updated: en(p.lastUpdated) || en(c.timestamp),
      station: 'Toronto (Pearson)',
      condition: en(c.condition) || '',
      temperature: val(c.temperature),
      feelsLike: val(c.windChill) ?? val(c.humidex) ?? val(c.temperature),
      windKmh: val(c.wind?.speed),
      gustKmh: val(c.wind?.gust),
      windDir: val(c.wind?.direction),
      humidity: val(c.relativeHumidity),
      icon: c.iconCode?.url || null,
      forecasts,
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
      });
    }
    return out;
  }),
};

/**
 * Turn weather into routing preferences: how much to penalise walking/biking and why.
 */
export function weatherImpact(current, alerts) {
  const notes = [];
  let walkPenalty = 1; // multiplier on walking minutes
  let bikeOk = true;
  const t = current?.feelsLike;
  const cond = (current?.condition || '').toLowerCase();
  if (t != null && t <= -15) { walkPenalty = 2.2; bikeOk = false; notes.push(`Extreme cold (feels like ${t}°C): routes with less walking are preferred.`); }
  else if (t != null && t <= -5) { walkPenalty = 1.5; notes.push(`Cold (feels like ${t}°C): walking is weighted more heavily.`); }
  else if (t != null && t >= 32) { walkPenalty = 1.5; notes.push(`Heat (feels like ${t}°C): routes with less walking are preferred.`); }
  if (/snow|freezing|ice|blizzard/.test(cond)) { walkPenalty = Math.max(walkPenalty, 1.8); bikeOk = false; notes.push(`${current.condition}: icy sidewalks, cycling not recommended.`); }
  else if (/rain|shower|drizzle|thunder/.test(cond)) { walkPenalty = Math.max(walkPenalty, 1.4); bikeOk = false; notes.push(`${current.condition}: less walking preferred.`); }
  if ((current?.gustKmh ?? 0) >= 60) { bikeOk = false; notes.push(`Wind gusts of ${current.gustKmh} km/h.`); }
  const severe = (alerts || []).filter((a) => a.severity !== 'minor');
  if (severe.length) {
    walkPenalty = Math.max(walkPenalty, 1.8);
    bikeOk = false;
    notes.push(`Active weather alert: ${severe.map((a) => a.name).join(', ')}. Allow extra travel time.`);
  }
  return { walkPenalty, bikeOk, notes };
}
