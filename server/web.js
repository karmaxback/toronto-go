// Serves the website: the Expo web build (mobile/dist) when it has been built, otherwise the older app in public/.
// Also serves the privacy policy at /privacy with the CONTACT address filled in.
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(root, 'public');
export const DIST = process.env.WEB_DIST || path.join(root, 'mobile', 'dist');

const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** CONTACT may be an email, a web address or plain text. */
export function contactHtml(contact = config.contact) {
  if (!contact) return 'the contact address on the Toronto Move App Store or Google Play page.';
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) return `<a href="mailto:${esc(contact)}">${esc(contact)}</a>`;
  if (/^https?:\/\/\S+$/i.test(contact)) return `<a href="${esc(contact)}">${esc(contact)}</a>`;
  return esc(contact);
}

// Tags the Expo build doesn't add: install as an app (manifest), home-screen icon, description for link previews.
const HEAD_EXTRAS = [
  '<link rel="manifest" href="/manifest.webmanifest" />',
  '<link rel="apple-touch-icon" href="/icon-192.png" />',
  '<meta name="apple-mobile-web-app-capable" content="yes" />',
  '<meta name="description" content="Live TTC, GO, UP Express, VIA and Pearson trip planner with delay and weather alerts." />',
  '<meta property="og:title" content="Toronto Move" />',
  '<meta property="og:image" content="/icon-512.png" />',
].join('');

let indexCache = null;
function expoIndex() {
  const file = path.join(DIST, 'index.html');
  const mtime = fs.statSync(file).mtimeMs; // rebuilt while running? pick up the new file
  if (indexCache?.mtime !== mtime) {
    indexCache = { mtime, html: fs.readFileSync(file, 'utf8').replace('</head>', `${HEAD_EXTRAS}</head>`) };
  }
  return indexCache.html;
}

const hasExpoBuild = () => fs.existsSync(path.join(DIST, 'index.html'));

// Old links and notifications use "/?tab=alerts"; the Expo app has real pages for each tab.
const TAB_PAGES = { alerts: '/alerts', nearby: '/nearby', airport: '/airport' };

/** Register after the API routes. */
export function serveWebsite(app) {
  app.get('/support', (req, res) => res.redirect(302, '/privacy#contact'));
  app.get(['/privacy', '/privacy.html'], (req, res) => {
    const html = fs.readFileSync(path.join(PUBLIC, 'privacy.html'), 'utf8').replace('{{CONTACT}}', contactHtml());
    res.type('html').send(html);
  });

  if (hasExpoBuild()) {
    app.get('/', (req, res, next) => {
      const tab = TAB_PAGES[req.query.tab];
      if (tab) return res.redirect(302, tab);
      next();
    });
    app.get(['/', '/index.html'], (req, res) => res.type('html').set('Cache-Control', 'no-cache').send(expoIndex()));
    // The previous website stays available while the new one beds in.
    app.get('/classic', (req, res) => res.sendFile(path.join(PUBLIC, 'index.html')));
    // Hashed bundle files never change, so browsers can keep them for a year.
    app.use('/_expo', express.static(path.join(DIST, '_expo'), { maxAge: '365d', immutable: true }));
    app.use(express.static(DIST, { index: false, maxAge: 0 }));
  }
  app.use(express.static(PUBLIC, { maxAge: 0 })); // sw.js, icons, manifest (and the old app if there is no Expo build)

  // Any other page (/nearby, /alerts...) is a screen of the Expo app.
  if (hasExpoBuild()) app.get('/{*page}', (req, res, next) => {
    if (path.extname(req.path)) return next(); // a missing file, not a page
    res.type('html').set('Cache-Control', 'no-cache').send(expoIndex());
  });
}
