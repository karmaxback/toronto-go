import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { userAgent } from '../config.js';

/*
 * Google Places (New) Text Search, used only as a BACKUP when the free OpenStreetMap search can't
 * find a business (e.g. a gym or shop that isn't mapped yet). Off unless GOOGLE_PLACES_API_KEY is set.
 *
 * Cost control: every call is counted and saved to data/google-usage.json. Calls stop for the rest of
 * the day / month once GOOGLE_PLACES_DAILY_LIMIT / GOOGLE_PLACES_MONTHLY_LIMIT is reached, so usage
 * stays inside Google's free monthly amount (5,000 "Text Search Pro" calls) unless you raise the limits.
 * Results must be shown with "Google Maps" attribution (the app does this).
 */
const URL_ = 'https://places.googleapis.com/v1/places:searchText';
const FIELDS = 'places.id,places.displayName,places.formattedAddress,places.location,places.primaryTypeDisplayName';
const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'data');
const FILE = process.env.GOOGLE_USAGE_FILE || path.join(DATA_DIR, 'google-usage.json');

const key = () => (process.env.GOOGLE_PLACES_API_KEY || '').trim();
const limits = () => ({
  day: Number(process.env.GOOGLE_PLACES_DAILY_LIMIT) || 150,
  month: Number(process.env.GOOGLE_PLACES_MONTHLY_LIMIT) || 4500,
});

// Toronto dates, so the counters reset at local midnight / on the 1st.
const torontoDay = (now) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(new Date(now)); // 2026-11-10
let usage = null;
function load() {
  if (usage) return usage;
  try { usage = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { usage = {}; }
  return usage;
}
function save() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(usage));
  } catch (e) { console.warn('[google] could not save usage:', e.message); }
}

/** Calls made today / this month, and whether another one is allowed. */
export function googleUsage(now = Date.now()) {
  const u = load();
  const day = torontoDay(now);
  const month = day.slice(0, 7);
  const today = u.day === day ? u.dayCount || 0 : 0;
  const thisMonth = u.month === month ? u.monthCount || 0 : 0;
  const lim = limits();
  return { enabled: Boolean(key()), today, thisMonth, limits: lim, allowed: Boolean(key()) && today < lim.day && thisMonth < lim.month };
}

function count(now) {
  const u = load();
  const day = torontoDay(now);
  const month = day.slice(0, 7);
  if (u.day !== day) { u.day = day; u.dayCount = 0; }
  if (u.month !== month) { u.month = month; u.monthCount = 0; }
  u.dayCount++; u.monthCount++;
  save();
}

/** For tests. */
export function _resetGoogleUsage(value = {}) { usage = value; }

/** Short address: "4218 Lawrence Ave E, Scarborough, ON M1E 4X9, Canada" -> "4218 Lawrence Ave E, Scarborough". */
export function shortAddress(a = '') {
  return a.replace(/,\s*Canada$/i, '').replace(/,\s*ON(\s+[A-Z]\d[A-Z]\s?\d[A-Z]\d)?$/i, '').trim();
}

/**
 * Search Google for `text` near `bias` ({lat, lon}) within about `radiusKm`.
 * Returns places in the app's shape (with attribution: 'Google Maps'), or [] if Google is off,
 * over the limit, or fails.
 */
export async function googlePlaces(text, bias, { radiusKm = 15, max = 5, now = Date.now(), fetchImpl = fetch } = {}) {
  if (!googleUsage(now).allowed || !text.trim()) return [];
  count(now);
  try {
    const res = await fetchImpl(URL_, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key(), 'X-Goog-FieldMask': FIELDS, 'User-Agent': userAgent },
      body: JSON.stringify({
        textQuery: text,
        pageSize: max,
        regionCode: 'CA',
        languageCode: 'en',
        locationBias: { circle: { center: { latitude: bias.lat, longitude: bias.lon }, radius: Math.min(radiusKm * 1000, 50000) } },
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const data = await res.json();
    return (data.places || [])
      .filter((p) => p.location && p.displayName?.text)
      .map((p) => ({
        id: `google:${p.id}`,
        name: p.displayName.text,
        type: 'PLACE',
        kind: p.primaryTypeDisplayName?.text || 'Place',
        detail: shortAddress(p.formattedAddress),
        city: (p.formattedAddress || '').toLowerCase(),
        lat: p.location.latitude,
        lon: p.location.longitude,
        source: 'google',
        attribution: 'Google Maps',
      }));
  } catch (e) {
    console.warn('[google] places search failed:', e.message);
    return [];
  }
}
