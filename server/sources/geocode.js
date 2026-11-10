import { config, http } from '../config.js';
import { cached } from '../cache.js';
import { googlePlaces } from './google-places.js';
import { motis } from './motis.js';

/*
 * Place search that works the way people type in the GTA:
 *  - shops / gyms / places by name ("Fit4Less", "Dollar Tree")          -> Photon (OpenStreetMap)
 *  - "<name> <city>" ("Dollar Tree Richmond Hill", "dollar tree markham") -> city removed from the text,
 *    results ranked in/near that city first, distance shown
 *  - intersections ("Lawrence and Morningside", "Yonge & Eglinton")      -> the transit stop at that corner
 *  - a place at a corner ("Fit4Less Lawrence Ave/Morningside Ave")      -> that place nearest the corner, then the corner
 *  - addresses and transit stops                                         -> Photon + Transitous, merged
 * Results nearest to the user (or their start point) come first when `near` is given.
 *
 * Photon's public server is free for fair use (https://photon.komoot.io). For heavy traffic,
 * self-host Photon and set PHOTON_URL.
 *
 * Backup: when `more` is set (the user paused typing or pressed Enter) and the free search has no
 * result containing every typed word, Google Places is asked too (only if GOOGLE_PLACES_API_KEY is set;
 * see google-places.js for the usage limits).
 */
const PHOTON = (process.env.PHOTON_URL || 'https://photon.komoot.io').replace(/\/+$/, '');
export const GTA_BBOX = { minLon: -80.3, minLat: 43.25, maxLon: -78.75, maxLat: 44.3 };
const inGta = (lat, lon) => lat >= GTA_BBOX.minLat && lat <= GTA_BBOX.maxLat && lon >= GTA_BBOX.minLon && lon <= GTA_BBOX.maxLon;

// Municipalities / districts people add to a search, with a centre point.
const AREAS = {
  'richmond hill': [43.8828, -79.4403], markham: [43.8561, -79.337], vaughan: [43.8361, -79.4983],
  thornhill: [43.815, -79.424], woodbridge: [43.786, -79.6], 'maple': [43.853, -79.51], concord: [43.8, -79.483],
  mississauga: [43.589, -79.6441], brampton: [43.7315, -79.7624], scarborough: [43.7731, -79.2578],
  'north york': [43.7615, -79.4111], etobicoke: [43.6205, -79.5132], 'east york': [43.691, -79.3279],
  downtown: [43.651, -79.381], toronto: [43.6532, -79.3832], pickering: [43.8384, -79.0868],
  ajax: [43.8509, -79.0204], whitby: [43.8975, -78.9429], oshawa: [43.8971, -78.8658],
  oakville: [43.4675, -79.6877], burlington: [43.3255, -79.799], milton: [43.5183, -79.8774],
  newmarket: [44.0592, -79.4613], aurora: [44.0065, -79.4504], stouffville: [43.9706, -79.2441],
  caledon: [43.8668, -79.858], 'king city': [43.9285, -79.528],
};

const R = 6371;
const km = (a, b) => {
  const toRad = (x) => (x * Math.PI) / 180;
  const h = Math.sin(toRad(b.lat - a.lat) / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(toRad(b.lon - a.lon) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

/** "dollar tree richmond hill" -> { text: "dollar tree", area: "richmond hill" } */
export function splitArea(q) {
  const lower = q.toLowerCase().replace(/[,]+/g, ' ').replace(/\s+/g, ' ').trim();
  for (const name of Object.keys(AREAS).sort((a, b) => b.length - a.length)) {
    const m = new RegExp(`^(.*?)\\s*(?:\\bin\\s+|\\bnear\\s+)?\\b${name}\\b\\s*(?:on|ontario)?$`).exec(lower);
    if (m && m[1].trim().length >= 2) return { text: m[1].trim(), area: name };
  }
  return { text: q.trim(), area: null };
}

/** "Lawrence and Morningside" -> ["lawrence", "morningside"]; null if not an intersection. */
export function splitIntersection(q) {
  if (/\d{2,}/.test(q)) return null; // "100 Queen St" is an address, not a corner
  const m = /^\s*(.+?)\s+(?:and|&|at|@|\/|x)\s+(.+?)\s*$/i.exec(q.replace(/\s*&\s*/g, ' & ').replace(/\s*\/\s*/g, ' / '));
  if (!m) return null;
  const clean = (s) => s.toLowerCase().replace(/\b(ave|avenue|st|street|rd|road|dr|drive|blvd|boulevard|e|w|east|west|n|s|north|south)\b\.?/g, '').trim();
  const a = clean(m[1]);
  const b = clean(m[2]);
  return a.length >= 3 && b.length >= 3 ? [a, b, m[1].trim(), m[2].trim()] : null;
}

const STOP_WORDS = new Set(['and', 'at', 'the', 'of', 'in', 'near', 'on', 'st', 'ave', 'rd', 'dr', 'blvd', 'e', 'w', 'n', 's', 'east', 'west', 'street', 'avenue', 'road']);
const norm = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ');
/** Significant words of a query: "Fit 4 Less Lawrence" -> ["fit4less", "lawrence"] (joins short split brand names). */
export function queryWords(text) {
  const raw = norm(text).split(' ').filter(Boolean);
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    // glue "fit 4 less" -> "fit4less" so it matches the brand as written in OpenStreetMap
    if (raw[i + 1] && /^\d$/.test(raw[i + 1]) && raw[i + 2]) { out.push(raw[i] + raw[i + 1] + raw[i + 2]); i += 2; continue; }
    if (!STOP_WORDS.has(raw[i]) && raw[i].length >= 2) out.push(raw[i]);
  }
  return out;
}
/** Share of query words found in a result's text (0..1); compares with spaces removed too. */
export function coverage(words, text) {
  const t = norm(text);
  const squashed = t.replace(/ /g, '');
  const hits = words.filter((w) => t.includes(w) || squashed.includes(w)).length;
  return hits / words.length;
}

const KIND = {
  bus_stop: 'Stop', platform: 'Stop', station: 'Station', stop: 'Stop', tram_stop: 'Stop', subway_entrance: 'Station',
  city: 'City', town: 'Town', suburb: 'Area', neighbourhood: 'Area', village: 'Area', district: 'Area',
  fitness_centre: 'Gym', sports_centre: 'Gym', supermarket: 'Grocery', convenience: 'Shop', variety_store: 'Shop',
  mall: 'Mall', department_store: 'Shop', restaurant: 'Restaurant', cafe: 'Cafe', fast_food: 'Restaurant',
  hospital: 'Hospital', clinic: 'Clinic', pharmacy: 'Pharmacy', school: 'School', university: 'University', college: 'College',
  library: 'Library', park: 'Park', place_of_worship: 'Worship', bank: 'Bank', hotel: 'Hotel', aerodrome: 'Airport',
};

function photonToPlace(f) {
  const p = f.properties || {};
  const [lon, lat] = f.geometry?.coordinates || [];
  const street = [p.housenumber, p.street].filter(Boolean).join(' ');
  const city = p.city || p.district || p.county || '';
  const isAddress = !p.name && street;
  const name = p.name || street || city;
  const kind = isAddress ? 'Address' : KIND[p.osm_value] || (p.osm_key === 'shop' ? 'Shop' : p.osm_key === 'highway' && p.type === 'street' ? 'Street' : 'Place');
  return {
    name,
    type: kind === 'Stop' || kind === 'Station' ? 'STOP' : isAddress ? 'ADDRESS' : 'PLACE',
    kind,
    detail: [street !== name ? street : '', city !== name ? city : ''].filter(Boolean).join(', '),
    city: city.toLowerCase(),
    lat,
    lon,
    source: 'photon',
  };
}

async function photon(text, bias, { zoom = 12, scale = 0.4 } = {}) {
  const qs = new URLSearchParams({
    q: text,
    limit: '12',
    lang: 'en',
    bbox: `${GTA_BBOX.minLon},${GTA_BBOX.minLat},${GTA_BBOX.maxLon},${GTA_BBOX.maxLat}`,
    lat: String(bias.lat),
    lon: String(bias.lon),
    zoom: String(zoom),
    location_bias_scale: String(scale),
  });
  const res = await http(`${PHOTON}/api/?${qs}`, { timeout: 8000 });
  return (res.features || []).map(photonToPlace).filter((p) => Number.isFinite(p.lat) && inGta(p.lat, p.lon));
}

async function transitous(text) {
  const res = await motis.geocode(text);
  return res.map((r) => ({ ...r, kind: r.type === 'STOP' ? 'Stop' : r.type === 'ADDRESS' ? 'Address' : 'Place', city: (r.detail || '').toLowerCase(), source: 'transitous' }));
}

/** Find the stop at a corner: a stop whose name mentions both streets ("Lawrence Ave East at Morningside Ave"). */
async function intersection([a, b, rawA, rawB]) {
  const both = (n) => { const s = n.toLowerCase(); return s.includes(a) && s.includes(b); };
  const lists = await Promise.allSettled([transitous(`${rawA} at ${rawB}`), transitous(`${rawB} at ${rawA}`), photon(`${rawA} ${rawB}`, { lat: 43.7, lon: -79.4 })]);
  const hits = lists.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])).filter((p) => both(p.name));
  if (!hits.length) return null;
  const lat = hits.reduce((s, p) => s + p.lat, 0) / hits.length;
  const lon = hits.reduce((s, p) => s + p.lon, 0) / hits.length;
  const title = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());
  const city = hits.find((h) => h.city)?.city || '';
  return { name: `${title(rawA)} & ${title(rawB)}`, type: 'PLACE', kind: 'Intersection', detail: title(city), lat, lon, source: 'intersection' };
}

const SUFFIX = /^(ave|avenue|st|street|rd|road|dr|drive|blvd|boulevard|cres|crescent|pkwy|parkway|e|w|n|s|east|west|north|south)\.?$/i;

/**
 * Work out whether the text names a corner, possibly with a place in front of it:
 *   "Lawrence and Morningside"                 -> { name: null, corner }
 *   "Fit4Less Lawrence Ave / Morningside Ave"  -> { name: "Fit4Less", corner: Lawrence & Morningside }
 *   "Fit4Less at Lawrence and Morningside"     -> { name: "Fit4Less", corner: Lawrence & Morningside }
 * Returns null when no corner is found. `corner` is the intersection place (with lat/lon).
 */
export async function resolveCorner(text) {
  const plain = splitIntersection(text);
  if (!plain) return null;
  const found = await intersection(plain);
  if (found) return { name: null, corner: found };

  const tries = [];
  // "<place> at|near <street> and <street>"
  const at = /^(.+?)\s+(?:at|@|near|by)\s+(.+)$/i.exec(text);
  if (at && splitIntersection(at[2])) tries.push({ name: at[1].trim(), streets: splitIntersection(at[2]) });
  // "<place> <street> / <street>": the street is the last one or two words before the separator
  for (const n of placeStreetSplits(plain[2])) {
    const streets = splitIntersection(`${n.street} and ${plain[3]}`);
    if (streets) tries.push({ name: n.name, streets });
  }
  const results = await Promise.all(tries.map(async (t) => ({ name: t.name, corner: await intersection(t.streets).catch(() => null) })));
  return results.find((r) => r.corner) ?? null;
}

/** "Fit4Less Lawrence Ave E" -> [{name:"Fit4Less", street:"Lawrence Ave E"}, {name:null..}] (one- and two-word street names). */
export function placeStreetSplits(left) {
  const tokens = left.trim().split(/\s+/);
  let end = tokens.length;
  while (end > 0 && SUFFIX.test(tokens[end - 1])) end--; // skip "Ave", "E"...
  const out = [];
  for (const k of [1, 2]) {
    const cut = end - k;
    const name = tokens.slice(0, cut).join(' ');
    if (cut >= 1 && name.replace(/[^a-z0-9]/gi, '').length >= 3) out.push({ name, street: tokens.slice(cut).join(' ') });
  }
  return out;
}

/** "Fit4Less" near a corner: matches for the name, nearest to the corner first, then the corner itself. */
async function placeNearCorner(name, corner, near, more = false) {
  const [ph, tr] = await Promise.allSettled([photon(queryWords(name).join(' ') || name, corner, { zoom: 15, scale: 0.1 }), transitous(name)]);
  const words = queryWords(name);
  const cornerLabel = corner.name;
  const rate = (list) => list
    .map((p) => ({ p, fromCorner: km(corner, p), match: coverage(words, `${p.name} ${p.detail || ''}`) }))
    .filter((x) => x.match >= 0.5);
  let found = rate([...(ph.value || []), ...(tr.value || [])]);
  // nothing by that name near the corner in the free data: ask Google (backup)
  if (more && !found.some((x) => x.fromCorner <= 2)) {
    found = [...rate(await googlePlaces(`${name} near ${cornerLabel}`, corner, { radiusKm: 3 })), ...found];
  }
  const list = found.sort((a, b) => (b.match - a.match) * 10 + (a.fromCorner - b.fromCorner));
  const seen = new Set();
  const out = [];
  for (const { p, fromCorner } of list) {
    const key = `${p.name.toLowerCase()}|${p.lat.toFixed(4)},${p.lon.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const howFar = fromCorner < 1 ? `${Math.round(fromCorner * 1000 / 10) * 10} m from ${cornerLabel}` : `${fromCorner.toFixed(1)} km from ${cornerLabel}`;
    out.push({ ...p, detail: [p.detail, howFar].filter(Boolean).join(' · '), fromCorner });
  }
  // places at the corner first, then the corner itself, then the same name further away
  const close = out.filter((p) => p.fromCorner <= 2);
  const far = out.filter((p) => p.fromCorner > 2);
  return [...close, corner, ...far].slice(0, 8).map(({ fromCorner, city, source, ...p }) => ({
    ...p, distanceKm: near ? Math.round(km(near, p) * 10) / 10 : null,
  }));
}

/**
 * @param {string} q  what the user typed
 * @param {{lat:number, lon:number}|null} near  user's location or trip start, used for ranking
 */
export function searchPlaces(q, near = null, { more = false } = {}) {
  const nearKey = near ? `${near.lat.toFixed(2)},${near.lon.toFixed(2)}` : '-';
  return cached(`places:${q.toLowerCase()}|${nearKey}|${more ? 'more' : ''}`, 12 * 3600_000, async () => {
    const { text, area } = splitArea(q);
    const areaPt = area ? { lat: AREAS[area][0], lon: AREAS[area][1] } : null;
    const bias = areaPt || near || { lat: 43.6532, lon: -79.3832 };
    const cornerHit = await resolveCorner(text).catch(() => null);
    if (cornerHit?.name) return placeNearCorner(cornerHit.name, cornerHit.corner, near, more);

    const [ph, tr] = await Promise.allSettled([
      photon(text, bias),
      transitous(area ? `${text} ${area}` : text),
    ]);
    const ix = { value: cornerHit?.corner ?? null };
    if (ph.status === 'rejected') console.warn('[geocode] photon failed:', ph.reason?.message);

    // Merge, dropping duplicates: same name close together (a station has many entrances; a city
    // appears as both a boundary and a point), or anything else within 80 m of the same type.
    const out = [];
    const big = (p) => ['City', 'Town', 'Area'].includes(p.kind);
    const add = (p) => {
      if (!p || !p.name) return;
      const dup = out.some((o) => {
        const d = km(o, p);
        if (o.name.toLowerCase() === p.name.toLowerCase()) return d < (big(o) || big(p) ? 5 : 0.4);
        return d < 0.08 && o.type === p.type;
      });
      if (!dup) out.push(p);
    };
    add(ix.value);
    (ph.value || []).forEach(add);
    (tr.value || []).forEach(add);

    // Backup: no free result has every typed word (a business missing from OpenStreetMap) -> ask Google.
    const words0 = queryWords(text);
    const isAddress = /^\s*\d+[a-z]?\s+\S/i.test(text);
    const complete = out.some((p) => p.kind !== 'Intersection' && coverage(words0, `${p.name} ${p.detail || ''}`) >= 1);
    if (more && !isAddress && !cornerHit && words0.length && !complete) {
      (await googlePlaces(area ? `${text} ${area}` : text, bias)).forEach(add);
    }

    // Rank: corner first; then results in the requested area; then by distance from the bias point
    // (only re-ordering when the user gave an area or a location, otherwise keep the search engine's order).
    const ref = areaPt || near;
    const downtown = { lat: 43.6532, lon: -79.3832 };
    const looksLikeAddress = /^\s*\d+[a-z]?\s+\S/i.test(text);
    const words = queryWords(text);
    const scored = out.map((p, i) => {
      const d = ref ? km(ref, p) : null;
      const inArea = area ? (p.city.includes(area) || (d != null && d < 6)) : false;
      let score = i; // engine order
      if (p.kind === 'Intersection') score -= 1000;
      if (area && inArea) score -= 100;
      // How many of the typed words the result actually contains matters more than being close by.
      if (words.length) score -= 12 * coverage(words, `${p.name} ${p.detail || ''}`);
      if (ref && d != null) score += Math.min(d, 60) * (area ? 0.3 : 0.25);
      else score += km(downtown, p) * 0.15; // no location given: gently prefer the city over far-off towns
      if (looksLikeAddress && p.type === 'ADDRESS') score -= 3;
      if (p.name.toLowerCase() === text.toLowerCase()) score -= big(p) ? 6 : 2; // exact name: "Markham" the city
      return { ...p, distanceKm: d != null ? Math.round(d * 10) / 10 : null, score };
    });
    scored.sort((x, y) => x.score - y.score);
    return scored.slice(0, 8).map(({ score, city, source, ...p }) => p);
  });
}
