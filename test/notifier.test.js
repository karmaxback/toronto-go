// Run: npm test   (uses Node's built-in test runner; no network except the live end-to-end case)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

process.env.PUSH_DATA_FILE = path.join(os.tmpdir(), `tg-push-test-${process.pid}.json`);
const N = await import('../server/notifier.js');
const { db } = await import('../server/push.js');

test('torontoTime handles EST and EDT', () => {
  assert.equal(N.torontoTime(2026, 1, 15, 8, 30).toISOString(), '2026-01-15T13:30:00.000Z'); // EST -5
  assert.equal(N.torontoTime(2026, 7, 15, 8, 30).toISOString(), '2026-07-15T12:30:00.000Z'); // EDT -4
  assert.equal(N.torontoTime(2026, 11, 9, 8, 0).toISOString(), '2026-11-09T13:00:00.000Z');
});

test('watchWindow opens 40 min before and closes 10 min after, only on chosen days', () => {
  const w = { leaveAt: '08:00', days: [1] }; // Monday
  const mon8 = Date.parse('2026-11-09T13:00:00Z'); // Mon 8:00 Toronto
  assert.ok(N.watchWindow(w, mon8 - 39 * 60000));
  assert.equal(N.watchWindow(w, mon8 - 41 * 60000), null);
  assert.ok(N.watchWindow(w, mon8 + 9 * 60000));
  assert.equal(N.watchWindow(w, mon8 + 11 * 60000), null);
  assert.equal(N.watchWindow({ ...w, days: [2] }, mon8), null);
});

const leg = (o) => ({ mode: 'WALK', transit: false, durationMin: 5, alerts: [], ...o });
function plan(now, { startIn = 12, delay = null, serious = false, notes = [] } = {}) {
  const start = new Date(now + startIn * 60000).toISOString();
  const dep = new Date(now + (startIn + 5) * 60000).toISOString();
  return {
    weather: { impact: { notes } },
    options: [{
      kind: 'transit', start, end: new Date(now + (startIn + 40) * 60000).toISOString(), durationMin: 40,
      legs: [
        leg({ start }),
        { mode: 'SUBWAY', transit: true, route: '1', agency: 'TTC', start: dep, durationMin: 20,
          live: delay == null ? null : { time: dep, delayMin: delay },
          alerts: serious ? [{ header: 'No service between Union and St Clair', serious: true }] : [] },
        leg({}),
      ],
    }],
  };
}
const watch = { id: 'w1', name: 'Work', to: { name: 'Office', lat: 43.7, lon: -79.4 }, from: { name: 'Home', lat: 43.65, lon: -79.38 }, remindMin: 10 };
const fresh = () => ({ heads: false, reminded: false, lastDelay: 0, count: 0 });

test('quiet commute: no heads-up, then one reminder at remind time', () => {
  const now = Date.now();
  const st = fresh();
  assert.equal(N.tripPushes(watch, plan(now, { startIn: 25 }), st, now).length, 0);
  const r = N.tripPushes(watch, plan(now, { startIn: 9 }), st, now);
  assert.equal(r.length, 1);
  assert.match(r[0].payload.title, /Leave in 9 min: Work/);
  assert.match(r[0].payload.body, /Walk 5 min, then Line 1 at/);
  assert.equal(N.tripPushes(watch, plan(now, { startIn: 8 }), st, now).length, 0, 'no repeat');
});

test('disruption triggers a heads-up', () => {
  const now = Date.now();
  const r = N.tripPushes(watch, plan(now, { startIn: 30, serious: true }), fresh(), now);
  assert.equal(r.length, 1);
  assert.match(r[0].payload.title, /Heads up/);
  assert.match(r[0].payload.body, /No service between Union/);
});

test('delay change after reminder sends an update, small changes do not', () => {
  const now = Date.now();
  const st = fresh();
  N.tripPushes(watch, plan(now, { startIn: 8, delay: 1 }), st, now);
  assert.equal(st.reminded, true);
  assert.equal(N.tripPushes(watch, plan(now, { startIn: 7, delay: 3 }), st, now).length, 0);
  const r = N.tripPushes(watch, plan(now, { startIn: 7, delay: 7 }), st, now);
  assert.equal(r.length, 1);
  assert.match(r[0].payload.title, /Line 1 now 7 min late/);
});

test('daily cap is respected', () => {
  const now = Date.now();
  const st = { ...fresh(), count: 4 };
  assert.equal(N.tripPushes(watch, plan(now, { startIn: 5, serious: true }), st, now).length, 0);
});

test('weather pushes respect level and dedupe', () => {
  const sub = { prefs: { weather: true, weatherLevel: 'moderate' } };
  const alerts = [
    { name: 'Snowfall warning', severity: 'severe', issued: 'a', text: 'Up to 25 cm' },
    { name: 'Special weather statement', severity: 'minor', issued: 'b', text: '' },
  ];
  const sent = {};
  const r = N.weatherPushes(sub, alerts, sent);
  assert.equal(r.length, 1);
  assert.match(r[0].payload.title, /Snowfall warning/);
  sent[r[0].key] = 1;
  assert.equal(N.weatherPushes(sub, alerts, sent).length, 0);
  assert.equal(N.weatherPushes({ prefs: { weather: false } }, alerts, {}).length, 0);
});

test('weather: updated alerts say so, ended alerts get a closing note', () => {
  const sub = { prefs: { weather: true, weatherLevel: 'moderate' } };
  const now = Date.parse('2026-12-01T17:00:00Z');
  const first = [{ name: 'Snowfall warning', severity: 'severe', issued: 'a', expires: '2026-12-01T23:00:00Z', tips: 'Allow extra time.' }];
  const sent = {};
  const [j] = N.weatherPushes(sub, first, sent, now);
  assert.match(j.payload.body, /^Until 6:00 pm\. Allow extra time\./);
  sent[j.key] = 1; Object.assign(sent, j.also);
  const [u] = N.weatherPushes(sub, [{ ...first[0], issued: 'b' }], sent, now);
  assert.match(u.payload.title, /Updated: Snowfall warning/);
  sent[u.key] = 1; Object.assign(sent, u.also);
  assert.equal(N.weatherEnded(sub, first, sent).length, 0, 'still active');
  const [e] = N.weatherEnded(sub, [], sent);
  assert.equal(e.payload.title, 'Ended: Snowfall warning');
  assert.deepEqual(e.clear, ['wxname:Snowfall warning']);
});

test('rain/snow heads-up: likely, 20 min to 3 h away, once per 6 h, can be turned off', () => {
  const sub = { prefs: { precip: true } };
  const now = Date.parse('2026-12-01T17:00:00Z');
  const up = { kind: 'snow', start: '2026-12-01T19:00:00Z', end: '2026-12-01T22:00:00Z', pop: 80, now: false };
  const [j] = N.precipPushes(sub, up, {}, now);
  assert.equal(j.payload.title, 'Snow around 2:00 pm');
  assert.match(j.payload.body, /80% chance, until about 5:00 pm/);
  assert.equal(N.precipPushes(sub, up, j.also, now).length, 0, 'not again within 6 h');
  assert.equal(N.precipPushes(sub, { ...up, pop: 40 }, {}, now).length, 0);
  assert.equal(N.precipPushes(sub, { ...up, start: '2026-12-01T23:00:00Z' }, {}, now).length, 0, 'too far ahead');
  assert.equal(N.precipPushes(sub, { ...up, now: true }, {}, now).length, 0, 'already falling');
  assert.equal(N.precipPushes({ prefs: { precip: false } }, up, {}, now).length, 0);
});

test('quiet hours are 10 pm to 7 am Toronto time', () => {
  assert.ok(N.inQuietHours(Date.parse('2026-12-01T04:00:00Z'))); // 11 pm
  assert.ok(N.inQuietHours(Date.parse('2026-12-01T11:30:00Z'))); // 6:30 am
  assert.equal(N.inQuietHours(Date.parse('2026-12-01T12:30:00Z')), false); // 7:30 am
});

test('route alerts: baseline existing, then push only new ones on followed routes', () => {
  const sub = { prefs: { routes: ['1', 'LW'] } };
  const a1 = { source: 'TTC', header: 'Line 1 delays', routes: ['1'], activeNow: true, effect: 'SIGNIFICANT_DELAYS' };
  const a2 = { source: 'TTC', header: '504 detour', routes: ['504'], activeNow: true, effect: 'DETOUR' };
  const a3 = { source: 'GO', header: 'Lakeshore West delays', routes: ['09261126-LW'], activeNow: true, effect: 'SIGNIFICANT_DELAYS' };
  const sent = {};
  const first = N.routePushes(sub, [a1, a2], sent);
  assert.equal(first.pushes.length, 0);
  assert.equal(first.baseline.length, 1);
  for (const k of first.baseline) sent[k] = 1;
  sent.__routes = first.routesKey;
  const next = N.routePushes(sub, [a1, a2, a3], sent);
  assert.equal(next.pushes.length, 1);
  assert.match(next.pushes[0].payload.title, /GO 09261126-LW/);
});

test('end-to-end: watched trip leaving soon gets a real plan and a reminder', { timeout: 60000 }, async () => {
  const sent = [];
  N.setDeliver(async (sub, payload) => { sent.push(payload); return true; });
  const t = N.torontoParts(new Date(Date.now() + 8 * 60000));
  db.subs.s1 = { id: 's1', subscription: {}, prefs: { weather: false, routes: [] } };
  db.watches.w9 = {
    id: 'w9', subId: 's1', name: 'Test commute', remindMin: 30, pref: 'balanced', accessible: false,
    from: { name: '100 Queen St W', lat: 43.6520, lon: -79.3841 }, to: { name: 'Yonge & Eglinton', lat: 43.7068, lon: -79.3984 },
    leaveAt: `${String(t.hh).padStart(2, '0')}:${String(t.mm).padStart(2, '0')}`, days: [t.weekday],
  };
  await N.checkTrips();
  console.log('   sent:', sent.map((p) => `${p.title} | ${p.body}`));
  assert.ok(sent.some((p) => /Leave (in \d+ min|now): Test commute/.test(p.title)), 'reminder sent');
});
