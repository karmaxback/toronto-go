// Integration test against a running dev server: `npm run dev` first, then `npm test`.
// Uses a well-formed but fake push endpoint, so nothing is actually delivered.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as webpush from 'web-push';

const BASE = process.env.TG_URL || 'http://localhost:3000';
const up = await fetch(`${BASE}/api/status`).then((r) => r.ok).catch(() => false);

const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
const subscription = {
  endpoint: `https://push.invalid/send/${crypto.randomBytes(8).toString('hex')}`,
  keys: { p256dh: ecdh.getPublicKey('base64url'), auth: crypto.randomBytes(16).toString('base64url') },
};
const post = (path, body) => fetch(`${BASE}/api/push/${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: subscription.endpoint, ...body }),
}).then(async (r) => ({ status: r.status, body: await r.json() }));

test('payload encryption + VAPID signing work for a browser-shaped subscription', async () => {
  const { publicKey } = await fetch(`${BASE}/api/push/key`).then((r) => r.json()).catch(() => ({ publicKey: null }));
  const vapid = webpush.generateVAPIDKeys();
  const req = webpush.generateRequestDetails(subscription, JSON.stringify({ title: 'hi' }), {
    vapidDetails: { subject: 'mailto:test@example.com', ...vapid }, TTL: 60, urgency: 'high',
  });
  assert.equal(req.headers['Content-Encoding'], 'aes128gcm');
  assert.match(req.headers.Authorization, /^vapid t=.+, k=/);
  assert.equal(req.headers.Urgency, 'high');
  assert.ok(req.body.length > 0);
  if (publicKey) assert.equal(webpush.generateVAPIDKeys().publicKey.length, publicKey.length);
});

test('subscribe → prefs → watch → me → delete → unsubscribe', { skip: !up && 'dev server not running' }, async () => {
  let r = await post('subscribe', { subscription, prefs: { weather: true, weatherLevel: 'severe', routes: 'line 1, 504, lw, <script>' } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.prefs, { weather: true, weatherLevel: 'severe', precip: true, quiet: true, routes: ['1', '504', 'LW'] });

  r = await post('watch', { watch: { leaveAt: '25:00', days: [1], from: { lat: 1, lon: 1 }, to: { lat: 2, lon: 2 } } });
  assert.equal(r.status, 400, 'bad time rejected');

  r = await post('watch', { watch: { name: 'Work', leaveAt: '08:15', days: [1, 2, 3, 4, 5], remindMin: 10,
    from: { name: 'Home', lat: 43.652, lon: -79.384 }, to: { name: 'Office', lat: 43.7068, lon: -79.3984 } } });
  assert.equal(r.status, 200);
  assert.equal(r.body.watches.length, 1);
  const wid = r.body.watches[0].id;

  r = await post('me');
  assert.equal(r.body.watches[0].leaveAt, '08:15');

  r = await post('test');
  assert.equal(r.status, 502, 'fake endpoint cannot receive');
  r = await post('me');
  assert.equal(r.status, 200, 'network failure does not delete the subscription');

  r = await post('watch/delete', { id: wid });
  assert.equal(r.body.watches.length, 0);

  r = await post('unsubscribe');
  assert.equal(r.status, 200);
  r = await post('me');
  assert.equal(r.status, 404);
});

test('cannot touch another subscriber without their endpoint', { skip: !up && 'dev server not running' }, async () => {
  const r = await fetch(`${BASE}/api/push/prefs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: 'https://push.invalid/guess', prefs: {} }) });
  assert.equal(r.status, 404);
});

test('phone app: subscribe with an Expo push token, watch a trip, unsubscribe', { skip: !up && 'dev server not running' }, async () => {
  const expoToken = `ExponentPushToken[${crypto.randomBytes(11).toString('base64url')}]`;
  const call = (path, body) => fetch(`${BASE}/api/push/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expoToken, ...body }),
  }).then(async (r) => ({ status: r.status, body: await r.json() }));

  let r = await call('subscribe', { expoToken: 'not-a-token' });
  assert.equal(r.status, 400, 'bad token rejected');
  r = await call('subscribe', { platform: 'ios', prefs: { weather: true, routes: '504' } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.prefs.routes, ['504']);
  r = await call('watch', { watch: { name: 'Work', leaveAt: '08:00', days: [1, 2, 3, 4, 5], from: { lat: 43.65, lon: -79.38 }, to: { lat: 43.7, lon: -79.4 } } });
  assert.equal(r.body.watches.length, 1);
  r = await call('test');
  assert.equal(r.status, 502, 'fake token is rejected by Expo, not silently accepted');
  r = await call('unsubscribe');
  assert.equal(r.status, 200);
  r = await call('me');
  assert.equal(r.status, 404);
});
