import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coverage, queryWords, splitArea, splitIntersection } from '../server/sources/geocode.js';

test('city names at the end of a search are understood', () => {
  assert.deepEqual(splitArea('Dollar Tree Richmond Hill'), { text: 'dollar tree', area: 'richmond hill' });
  assert.deepEqual(splitArea('dollar tree markham'), { text: 'dollar tree', area: 'markham' });
  assert.deepEqual(splitArea('Fit4Less in Scarborough'), { text: 'fit4less', area: 'scarborough' });
  assert.deepEqual(splitArea('walmart, Mississauga ON'), { text: 'walmart', area: 'mississauga' });
  assert.equal(splitArea('Markham').area, null, 'a city on its own is a normal search');
  assert.equal(splitArea('Markham Street').area, null);
});

test('intersections are recognised, addresses are not', () => {
  assert.deepEqual(splitIntersection('Lawrence and Morningside').slice(0, 2), ['lawrence', 'morningside']);
  assert.deepEqual(splitIntersection('Yonge & Eglinton').slice(0, 2), ['yonge', 'eglinton']);
  assert.deepEqual(splitIntersection('Lawrence Ave E & Morningside Ave').slice(0, 2), ['lawrence', 'morningside']);
  assert.deepEqual(splitIntersection('Bloor/Spadina').slice(0, 2), ['bloor', 'spadina']);
  assert.equal(splitIntersection('100 Queen St W'), null);
  assert.equal(splitIntersection('Union Station'), null);
});

test('query words glue split brand names and drop filler words', () => {
  assert.deepEqual(queryWords('Fit 4 Less Lawrence'), ['fit4less', 'lawrence']);
  assert.deepEqual(queryWords('Lawrence and Morningside'), ['lawrence', 'morningside']);
});

test('coverage prefers results containing all the typed words', () => {
  const w = queryWords('Lawrence and Morningside');
  assert.equal(coverage(w, 'Morningside Ave at Lawrence Ave E'), 1);
  assert.equal(coverage(w, 'St. Lawrence Convenience'), 0.5);
  assert.equal(coverage(queryWords('Fit 4 Less'), 'Fit4Less'), 1);
});
