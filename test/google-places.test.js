import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

process.env.GOOGLE_USAGE_FILE = path.join(os.tmpdir(), `gp-usage-${process.pid}.json`);
const { googlePlaces, googleUsage, shortAddress, _resetGoogleUsage } = await import('../server/sources/google-places.js');

const reply = { places: [{ id: 'abc', displayName: { text: 'Fit4Less' }, formattedAddress: '4218 Lawrence Ave E, Scarborough, ON M1E 4X9, Canada', location: { latitude: 43.767, longitude: -79.187 }, primaryTypeDisplayName: { text: 'Gym' } }] };
const fake = (calls) => async (url, opts) => { calls.push({ url, opts }); return { ok: true, json: async () => reply }; };
const near = { lat: 43.77, lon: -79.19 };

test('shortAddress drops province, postal code and country', () => {
  assert.equal(shortAddress('4218 Lawrence Ave E, Scarborough, ON M1E 4X9, Canada'), '4218 Lawrence Ave E, Scarborough');
});

test('off without a key: no calls', async () => {
  delete process.env.GOOGLE_PLACES_API_KEY;
  _resetGoogleUsage();
  const calls = [];
  assert.deepEqual(await googlePlaces('Fit4Less', near, { fetchImpl: fake(calls) }), []);
  assert.equal(calls.length, 0);
});

test('returns places with Google attribution and counts the call', async () => {
  process.env.GOOGLE_PLACES_API_KEY = 'test-key';
  _resetGoogleUsage();
  const calls = [];
  const res = await googlePlaces('Fit4Less', near, { fetchImpl: fake(calls) });
  assert.equal(res.length, 1);
  assert.equal(res[0].name, 'Fit4Less');
  assert.equal(res[0].kind, 'Gym');
  assert.equal(res[0].detail, '4218 Lawrence Ave E, Scarborough');
  assert.equal(res[0].attribution, 'Google Maps');
  assert.equal(calls[0].opts.headers['X-Goog-Api-Key'], 'test-key');
  assert.equal(googleUsage().today, 1);
});

test('stops at the daily limit and resets the next day', async () => {
  process.env.GOOGLE_PLACES_API_KEY = 'test-key';
  process.env.GOOGLE_PLACES_DAILY_LIMIT = '2';
  _resetGoogleUsage();
  const calls = [];
  const now = Date.parse('2026-11-10T15:00:00Z');
  for (let i = 0; i < 4; i++) await googlePlaces('Fit4Less', near, { fetchImpl: fake(calls), now });
  assert.equal(calls.length, 2);
  await googlePlaces('Fit4Less', near, { fetchImpl: fake(calls), now: now + 86_400_000 });
  assert.equal(calls.length, 3);
  delete process.env.GOOGLE_PLACES_DAILY_LIMIT;
});

test('stops at the monthly limit', async () => {
  process.env.GOOGLE_PLACES_API_KEY = 'test-key';
  _resetGoogleUsage({ day: '2026-11-10', dayCount: 0, month: '2026-11', monthCount: 4500 });
  const calls = [];
  await googlePlaces('Fit4Less', near, { fetchImpl: fake(calls), now: Date.parse('2026-11-10T15:00:00Z') });
  assert.equal(calls.length, 0);
});

test('a failed request returns nothing instead of an error', async () => {
  process.env.GOOGLE_PLACES_API_KEY = 'test-key';
  _resetGoogleUsage();
  const res = await googlePlaces('Fit4Less', near, { fetchImpl: async () => ({ ok: false, status: 403, statusText: 'Forbidden' }) });
  assert.deepEqual(res, []);
  delete process.env.GOOGLE_PLACES_API_KEY;
});
