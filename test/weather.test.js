// Weather helpers: feels-like, rain/snow timing, travel tips, forecast-aware routing notes. No network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { feelsLike, precipKind, travelTips, upcomingPrecip, weatherImpact } from '../server/sources/weather.js';

test('feels like uses wind chill when cold and humidex when hot', () => {
  assert.equal(feelsLike(7.9, 29, 1), 4, '8 °C with a 29 km/h wind feels like 4, not -3');
  assert.equal(feelsLike(-10, 30, -15), -20);
  assert.equal(feelsLike(30, 10, 22), 39, 'humid 30 °C feels like 39');
  assert.equal(feelsLike(15, 30, 5), 15, 'mild: just the temperature');
  assert.equal(feelsLike(null, 10, 0), null);
});

test('forecast wording becomes a kind of rain/snow', () => {
  assert.equal(precipKind('Periods of freezing rain'), 'ice');
  assert.equal(precipKind('Chance of flurries'), 'snow');
  assert.equal(precipKind('Rain showers or flurries'), 'mix');
  assert.equal(precipKind('Chance of thunderstorms'), 'storm');
  assert.equal(precipKind('Light rain'), 'rain');
  assert.equal(precipKind('Mainly cloudy'), null);
});

const hour = (h, kind, pop, condition = kind ? 'Snow' : 'Cloudy') => ({ time: `2026-12-01T${String(h).padStart(2, '0')}:00:00Z`, kind, pop, condition, temp: -2, feelsLike: -8 });
const NOW = Date.parse('2026-12-01T17:10:00Z'); // 12:10 pm Toronto

test('next stretch of rain/snow: start, end, highest chance', () => {
  const hourly = [hour(17, null, 10), hour(18, null, 20), hour(19, 'snow', 70), hour(20, 'snow', 90), hour(21, 'ice', 60), hour(22, null, 20)];
  const u = upcomingPrecip(hourly, NOW);
  assert.equal(u.kind, 'ice', 'freezing rain is the most serious in the stretch');
  assert.equal(u.start, '2026-12-01T19:00:00Z');
  assert.equal(u.end, '2026-12-01T22:00:00.000Z');
  assert.equal(u.pop, 90);
  assert.equal(u.now, false);
  assert.equal(upcomingPrecip([hour(19, 'snow', 30)], NOW), null, 'a 30% chance is not a heads-up');
  assert.equal(upcomingPrecip([hour(17, 'rain', 80)], NOW).now, true, 'already raining');
});

test('a trip later today uses the forecast for that time', () => {
  const current = { feelsLike: 3, condition: 'Cloudy', hourly: [hour(17, null, 10), hour(23, 'snow', 80)] };
  const later = weatherImpact(current, [], { at: Date.parse('2026-12-01T23:20:00Z'), now: NOW });
  assert.ok(later.walkPenalty >= 1.8 && !later.bikeOk);
  assert.match(later.notes.join(' '), /Snow forecast at your trip time \(80%\)/);
  const nowTrip = weatherImpact(current, [], { now: NOW });
  assert.equal(nowTrip.walkPenalty, 1, 'dry right now');
});

test('leaving now with snow due soon gets a heads-up', () => {
  const current = { feelsLike: 1, condition: 'Cloudy', hourly: [hour(17, null, 10), hour(18, 'snow', 80)] };
  assert.match(weatherImpact(current, [], { now: NOW }).notes.join(' '), /Snow likely soon \(80%\)/);
});

test('alerts come with what they mean for getting around', () => {
  assert.match(travelTips('Freezing rain warning'), /Icy sidewalks/);
  assert.match(travelTips('Snowfall warning'), /subway is the most reliable/);
  assert.match(travelTips('Heat warning'), /air-conditioned/);
  assert.match(travelTips('Something new'), /allow extra travel time/i);
});
