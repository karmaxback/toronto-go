// Website serving: Expo build at /, tab redirects, app pages, privacy page with CONTACT filled in.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-dist-'));
fs.writeFileSync(path.join(dist, 'index.html'), '<html><head><title>Toronto Move</title></head><body><div id="root"></div></body></html>');
fs.mkdirSync(path.join(dist, '_expo'));
fs.writeFileSync(path.join(dist, '_expo', 'entry-abc.js'), 'console.log(1)');
process.env.WEB_DIST = dist;
process.env.CONTACT = 'help@example.com';
const { serveWebsite, contactHtml } = await import('../server/web.js');

let server, base;
before(async () => {
  const app = express();
  app.get('/api/status', (req, res) => res.json({ ok: true }));
  serveWebsite(app);
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); fs.rmSync(dist, { recursive: true, force: true }); });

const get = (p) => fetch(base + p, { redirect: 'manual' });

test('contact address becomes a safe link or text', () => {
  assert.equal(contactHtml('a@b.ca'), '<a href="mailto:a@b.ca">a@b.ca</a>');
  assert.equal(contactHtml('https://x.ca/help'), '<a href="https://x.ca/help">https://x.ca/help</a>');
  assert.equal(contactHtml('<script>'), '&lt;script&gt;');
  assert.match(contactHtml(''), /App Store or Google Play/);
});

test('home page is the Expo app with install tags added', async () => {
  const r = await get('/');
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.match(html, /<div id="root">/);
  assert.match(html, /<link rel="manifest" href="\/manifest.webmanifest" \/><link rel="apple-touch-icon"[^>]*>.*<\/head>/);
});

test('old ?tab= links go to the matching app page', async () => {
  const r = await get('/?tab=alerts');
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), '/alerts');
  assert.equal((await get('/?tab=bogus')).status, 200);
});

test('app pages load the app; missing files are 404', async () => {
  assert.match(await (await get('/nearby')).text(), /id="root"/);
  assert.equal((await get('/nope.js')).status, 404);
});

test('bundle files are cached long-term', async () => {
  const r = await get('/_expo/entry-abc.js');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('cache-control'), /max-age=31536000/);
});

test('privacy page has the contact address; /support jumps to it', async () => {
  const html = await (await get('/privacy')).text();
  assert.match(html, /mailto:help@example.com/);
  assert.doesNotMatch(html, /\{\{CONTACT\}\}/);
  const s = await get('/support');
  assert.equal(s.headers.get('location'), '/privacy#contact');
});

test('service worker, icons and the old website are still served', async () => {
  assert.equal((await get('/sw.js')).status, 200);
  assert.equal((await get('/icon-192.png')).status, 200);
  assert.match(await (await get('/classic')).text(), /<title>Toronto Move<\/title>/);
});
