import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fareFor, FARES } from '../server/fares.js';
import { rankPlan } from '../server/rank.js';

// Minimal GO fare table: Union (zone 02) <-> Oakville (13) $9.70, Union <-> Bloor (01) $4.40
const table = { zones: { UN: '02', OA: '13', BL: '01' }, prices: { '02-13': 9.70, '13-02': 9.70, '02-01': 4.40 } };
const leg = (agency, from, to, mode = 'BUS') => ({ transit: true, agency, mode, fromStopId: from, toStopId: to });
const opt = (...legs) => ({ kind: 'transit', legs });

test('TTC only: one adult fare covers transfers', () => {
  const f = fareFor(opt(leg('TTC', 'ca-on-TTC_1', 'ca-on-TTC_2', 'SUBWAY'), leg('TTC', 'ca-on-TTC_3', 'ca-on-TTC_4')), 'adult', table);
  assert.equal(f.total, 3.30);
  assert.equal(f.complete, true);
});

test('GO with TTC connection: GO PRESTO fare, TTC free (One Fare)', () => {
  const f = fareFor(opt(
    leg('TTC', 'ca-on-TTC_1', 'ca-on-TTC_2', 'SUBWAY'),
    leg('GO Transit', 'ca-on-Metrolinx-gotransit_UN', 'ca-on-Metrolinx-gotransit_OA', 'REGIONAL_RAIL'),
  ), 'adult', table);
  assert.equal(f.total, 8.18); // 9.70 less 15.7%
  assert.deepEqual(f.items.map((i) => [i.label, i.amount]), [['GO Transit', 8.18], ['TTC', 0]]);
});

test('GO senior and child discounts', () => {
  const go = opt(leg('GO Transit', 'x_UN', 'x_OA', 'REGIONAL_RAIL'));
  assert.equal(fareFor(go, 'senior', table).total, 4.37); // 55% off
  assert.equal(fareFor(go, 'youth', table).total, 5.82);  // 40% off
  assert.equal(fareFor(go, 'child', table).total, 0);
});

test('UP Express to Pearson is a fixed fare and not part of One Fare', () => {
  const f = fareFor(opt(leg('TTC', 'ca-on-TTC_1', 'ca-on-TTC_2', 'SUBWAY'), leg('UP Express', 'ca-on-UP-Express_UN', 'ca-on-UP-Express_PA', 'REGIONAL_RAIL')), 'adult', table);
  assert.equal(f.total, +(FARES.upPearson.adult + FARES.ttc.adult).toFixed(2));
});

test('UP Express to Bloor uses the GO fare table', () => {
  const f = fareFor(opt(leg('UP Express', 'ca-on-UP-Express_UN', 'ca-on-UP-Express_BL', 'REGIONAL_RAIL')), 'adult', table);
  assert.equal(f.total, 3.71); // 4.40 less 15.7%
});

test('VIA and unknown local agencies make the fare incomplete', () => {
  const f = fareFor(opt(leg('VIA Rail', 'a_1', 'a_2', 'LONG_DISTANCE'), leg('Burlington Transit', 'b_1', 'b_2')), 'adult', table);
  assert.equal(f.complete, false);
  assert.equal(f.items.length, 2);
});

test('MiWay + TTC: one fare under One Fare', () => {
  const f = fareFor(opt(leg('MiWay', 'm_1', 'm_2'), leg('TTC', 'ca-on-TTC_1', 'ca-on-TTC_2', 'SUBWAY')), 'adult', table);
  assert.equal(f.total, 3.30);
  assert.equal(f.items.find((i) => i.label === 'MiWay').amount, 0);
});

test('walk/bike/car have no fare', () => {
  assert.equal(fareFor({ kind: 'walk', legs: [{ transit: false, mode: 'WALK' }] }, 'adult', table), null);
});

// ---------------------------------------------------------------- accessibility
const t0 = Date.parse('2026-11-09T13:00:00Z');
const iso = (m) => new Date(t0 + m * 60000).toISOString();
const motisLeg = (route, fromStop, fromName, toStop, toName, start, end) => ({
  mode: 'SUBWAY', routeShortName: route, routeId: `ca-on-TTC_${route}`, agencyName: 'TTC', tripId: 't',
  from: { stopId: `ca-on-TTC_${fromStop}`, name: fromName }, to: { stopId: `ca-on-TTC_${toStop}`, name: toName },
  startTime: iso(start), endTime: iso(end), scheduledStartTime: iso(start), duration: (end - start) * 60,
});
const plan = {
  itineraries: [
    { startTime: iso(0), endTime: iso(20), transfers: 0, legs: [motisLeg('1', '100', 'Union Station - Northbound Platform', '200', 'Cedarvale Station - Southbound Platform', 0, 20)] },
    { startTime: iso(2), endTime: iso(26), transfers: 0, legs: [motisLeg('1', '101', 'Union Station - Northbound Platform', '300', 'St Clair West Station - Northbound Platform', 2, 26)] },
  ],
};
const access = [{ station: 'Cedarvale', stops: ['999'], kind: 'elevator', header: 'Cedarvale: Elevator ELV01 out of service' }];
const ctx = { live: { ttc: null, go: null, used: new Set() }, alerts: [], access, impact: { walkPenalty: 1, bikeOk: true, notes: [] }, departAt: iso(0) };

test('elevator outage is attached by station name and only penalised for step-free trips', () => {
  const normal = rankPlan(plan, { ...ctx, accessible: false });
  assert.equal(normal[0].legs[0].to.name.startsWith('Cedarvale'), true, 'faster Cedarvale route still first normally');
  assert.equal(normal[0].accessIssues[0].kind, 'elevator');

  const stepFree = rankPlan(plan, { ...ctx, accessible: true });
  assert.match(stepFree[0].legs[0].to.name, /St Clair West/, 'step-free trip avoids the broken elevator');
  const ced = stepFree.find((o) => o.accessIssues.length);
  assert.match(ced.warnings.join(' '), /Elevator out of service at Cedarvale/);
});

test('station name match is exact ("Bay" does not match "Bayview")', () => {
  const p = { itineraries: [{ startTime: iso(0), endTime: iso(10), transfers: 0, legs: [motisLeg('4', '1', 'Bayview Station - Platform', '2', 'Sheppard-Yonge Station', 0, 10)] }] };
  const r = rankPlan(p, { ...ctx, access: [{ station: 'Bay', stops: [], kind: 'escalator', header: 'Bay: escalator' }] });
  assert.equal(r[0].accessIssues.length, 0);
});
