import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync, strFromU8 } from 'fflate';
import { http } from './config.js';

/*
 * Fare estimates, paying with PRESTO / debit / credit tap (what most riders use).
 *
 * Sources (checked Nov 2026):
 *  - TTC: ttc.ca/Fares-and-passes — adult $3.30, youth $2.35, senior $2.25, 12 & under free.
 *  - GO:  station-to-station adult fares from GO's own GTFS fare tables (downloaded weekly);
 *         PRESTO discounts: adult 15.7%, youth 40%, senior 55%, 12 & under free (gotransit.com).
 *  - UP Express: Union/Bloor/Weston/Mount Dennis <-> Pearson, PRESTO adult $9.25, senior $5.80,
 *         youth 40% off the $12.35 standard fare. Other UP trips use the GO fare table.
 *  - One Fare (Ontario): free transfers between TTC and GO, MiWay, Brampton, YRT, Durham with PRESTO/tap.
 *         UP Express is NOT part of One Fare.
 * Update FARES below when prices change.
 */
export const FARES = {
  ttc: { adult: 3.30, youth: 2.35, senior: 2.25, child: 0 },
  goPresto: { adult: 1 - 0.157, youth: 0.60, senior: 0.45, child: 0 }, // multiplier on GO's full adult fare
  upPearson: { adult: 9.25, youth: +(12.35 * 0.6).toFixed(2), senior: 5.80, child: 0 },
};
export const RIDERS = ['adult', 'youth', 'senior', 'child'];

const ONE_FARE_LOCAL = /miway|mississauga|brampton|york region|^yrt|durham/i;
const GO_COFARE_LOCAL = /oakville transit/i; // free when connecting to/from GO

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'go-fares.json');
const GO_GTFS = 'https://assets.metrolinx.com/raw/upload/Documents/Metrolinx/Open%20Data/GO-GTFS.zip';
const WEEK = 7 * 24 * 3600_000;

function parseCsv(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
  const head = lines.shift().split(',');
  return lines.map((line) => {
    const cells = [];
    let cur = '', q = false;
    for (const ch of line) {
      if (ch === '"') q = !q;
      else if (ch === ',' && !q) { cells.push(cur); cur = ''; }
      else cur += ch;
    }
    cells.push(cur);
    return Object.fromEntries(head.map((h, i) => [h, cells[i] ?? '']));
  });
}

let goTable = null; // { zones: {stopId: zone}, prices: {"o-d": price}, fetched }
let loading = null;

async function downloadGoTable() {
  const zip = await http(GO_GTFS, { as: 'buffer', timeout: 120000 });
  const files = unzipSync(zip, { filter: (f) => ['stops.txt', 'fare_attributes.txt', 'fare_rules.txt'].includes(f.name) });
  const zones = {};
  for (const s of parseCsv(strFromU8(files['stops.txt']))) if (s.zone_id) zones[s.stop_id] = s.zone_id;
  const priceById = {};
  for (const f of parseCsv(strFromU8(files['fare_attributes.txt']))) priceById[f.fare_id] = Number(f.price);
  const prices = {};
  for (const r of parseCsv(strFromU8(files['fare_rules.txt']))) {
    if (priceById[r.fare_id] != null) prices[`${r.origin_id}-${r.destination_id}`] = priceById[r.fare_id];
  }
  const table = { zones, prices, fetched: Date.now() };
  fs.mkdirSync(path.dirname(DATA), { recursive: true });
  fs.writeFileSync(DATA, JSON.stringify(table));
  console.log(`[fares] GO fare table: ${Object.keys(prices).length} zone pairs, ${Object.keys(zones).length} stops`);
  return table;
}

/** GO fare table, from disk if fresh, otherwise downloaded (in the background if we have an old copy). */
export async function goFares() {
  if (!goTable) {
    try { goTable = JSON.parse(fs.readFileSync(DATA, 'utf8')); } catch { /* first run */ }
  }
  const stale = !goTable || Date.now() - goTable.fetched > WEEK;
  if (stale && !loading) {
    loading = downloadGoTable().then((t) => { goTable = t; return t; })
      .catch((err) => { console.warn('[fares] GO fare download failed:', err.message); return goTable; })
      .finally(() => { loading = null; });
  }
  return goTable || loading;
}

const round2 = (n) => Math.round(n * 100) / 100;
const rawId = (id) => (id ? id.slice(id.indexOf('_') + 1) : null); // "ca-on-Metrolinx-gotransit_UN" -> "UN"

function goPrice(table, fromStop, toStop) {
  const zo = table?.zones[fromStop];
  const zd = table?.zones[toStop];
  if (!zo || !zd) return null;
  return table.prices[`${zo}-${zd}`] ?? null;
}

/** Fare estimate for one shaped itinerary. Returns null when no fare applies (walk/bike/car). */
export function fareFor(o, rider, table) {
  if (o.fare) return o.fare; // e.g. Bike Share, already priced
  const legs = o.legs.filter((l) => l.transit);
  if (!legs.length) return null;
  const r = RIDERS.includes(rider) ? rider : 'adult';
  const items = [];
  let complete = true;

  const go = legs.filter((l) => l.agency === 'GO Transit');
  const up = legs.filter((l) => l.agency === 'UP Express');
  const ttc = legs.filter((l) => l.agency === 'TTC');
  const others = legs.filter((l) => !['GO Transit', 'UP Express', 'TTC'].includes(l.agency));
  const localOneFare = others.filter((l) => ONE_FARE_LOCAL.test(l.agency || ''));

  if (go.length) {
    const base = goPrice(table, rawId(go[0].fromStopId), rawId(go[go.length - 1].toStopId));
    if (base == null) { complete = false; items.push({ label: 'GO Transit', amount: null, note: 'fare not found' }); }
    else items.push({ label: 'GO Transit', amount: round2(base * FARES.goPresto[r]) });
  }
  if (up.length) {
    const a = rawId(up[0].fromStopId);
    const b = rawId(up[up.length - 1].toStopId);
    if (a === 'PA' || b === 'PA') items.push({ label: 'UP Express', amount: FARES.upPearson[r] });
    else {
      const base = goPrice(table, a, b);
      if (base == null) { complete = false; items.push({ label: 'UP Express', amount: null }); }
      else items.push({ label: 'UP Express', amount: round2(base * FARES.goPresto[r]) });
    }
  }
  if (ttc.length) {
    // With GO, the TTC part is free. With MiWay/YRT/Brampton/Durham you pay once: we count the TTC fare
    // and make the local agency the free transfer (prices are similar; you pay whichever you board first).
    if (go.length) items.push({ label: 'TTC', amount: 0, note: 'free transfer (One Fare)' });
    else items.push({ label: 'TTC', amount: FARES.ttc[r], note: localOneFare.length ? 'one fare covers the transfer' : undefined });
  }
  const seen = new Set();
  for (const l of others) {
    if (seen.has(l.agency)) continue;
    seen.add(l.agency);
    const isLong = ['LONG_DISTANCE', 'HIGHSPEED_RAIL', 'NIGHT_RAIL', 'COACH'].includes(l.mode) || /via rail|flixbus|megabus|ontario northland/i.test(l.agency || '');
    if (isLong) { complete = false; items.push({ label: l.agency || 'Intercity', amount: null, note: 'ticket required' }); continue; }
    if (go.length && (ONE_FARE_LOCAL.test(l.agency) || GO_COFARE_LOCAL.test(l.agency))) {
      items.push({ label: l.agency, amount: 0, note: 'free with GO' });
    } else if (ttc.length && ONE_FARE_LOCAL.test(l.agency)) {
      items.push({ label: l.agency, amount: 0, note: 'free transfer (One Fare)' });
    } else {
      complete = false;
      items.push({ label: l.agency || 'Local transit', amount: null, note: 'fare not included' });
    }
  }
  const total = round2(items.reduce((s, i) => s + (i.amount || 0), 0));
  return {
    total,
    complete,
    rider: r,
    items,
    note: 'Paying with PRESTO or a tap of debit/credit. Cash fares are higher.',
  };
}

export async function addFares(options, rider = 'adult') {
  let table = null;
  try { table = await goFares(); } catch { /* fares for GO just won't be found */ }
  for (const o of options) o.fare = fareFor(o, rider, table);
  return options;
}
