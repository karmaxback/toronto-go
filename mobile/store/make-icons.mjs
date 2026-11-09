// Rerun: cd mobile/store && npm i --no-save @resvg/resvg-js@2.6.2 && node make-icons.mjs "<project folder>"
// Draws the Toronto Move icon (a white train front on rails, on brand green) and writes every size the app needs.
import { Resvg } from '@resvg/resvg-js';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.argv[2]; // F:/Toronto Move
const IMG = path.join(ROOT, 'mobile/assets/images');
const GREEN_TOP = '#14846f', GREEN_BOTTOM = '#0b5547', BRAND = '#0f6b5c';

// The artwork in a 512 x 512 box, centred. Window and headlights are cut out (mask) so it works as a monochrome icon too.
const art = (fill = '#fff') => `
  <defs><mask id="cut" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
    <rect width="512" height="512" fill="#fff"/>
    <rect x="186" y="134" width="140" height="94" rx="22" fill="#000"/>
    <circle cx="208" cy="290" r="17" fill="#000"/>
    <circle cx="304" cy="290" r="17" fill="#000"/>
    <rect x="232" y="282" width="48" height="16" rx="8" fill="#000"/>
  </mask></defs>
  <g fill="${fill}" stroke="${fill}">
    <rect x="156" y="96" width="200" height="252" rx="62" mask="url(#cut)" stroke="none"/>
    <path d="M202 362 L172 408 M310 362 L340 408" stroke-width="26" stroke-linecap="round" fill="none"/>
    <path d="M128 412 H384" stroke-width="22" stroke-linecap="round" fill="none"/>
  </g>`;

const bg = (rx = 0) => `
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${GREEN_TOP}"/><stop offset="1" stop-color="${GREEN_BOTTOM}"/>
  </linearGradient></defs>
  <rect width="512" height="512" rx="${rx}" fill="url(#g)"/>`;

const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${body}</svg>`;
// Scale the art around the centre (for Android's safe zone and the splash screen).
const scaled = (s, fill) => `<g transform="translate(256 256) scale(${s}) translate(-256 -256)">${art(fill)}</g>`;

function png(file, svgText, size) {
  const out = new Resvg(svgText, { fitTo: { mode: 'width', value: size } }).render().asPng();
  fs.writeFileSync(file, out);
  console.log(path.relative(ROOT, file), size, `${(out.length / 1024).toFixed(1)} KB`);
}

// App icon (iOS fallback, Expo default): full square, the stores round the corners themselves.
png(path.join(IMG, 'icon.png'), svg(bg() + art()), 1024);
// Android adaptive icon: art inside the 66% safe circle, separate background and monochrome (themed icons) layers.
png(path.join(IMG, 'android-icon-foreground.png'), svg(scaled(0.74)), 1024);
png(path.join(IMG, 'android-icon-background.png'), svg(bg()), 1024);
png(path.join(IMG, 'android-icon-monochrome.png'), svg(scaled(0.74)), 1024);
// Splash: white art on the green splash background (set in app.json).
png(path.join(IMG, 'splash-icon.png'), svg(art()), 1024);
// Website favicon and the old website / service worker icon.
png(path.join(IMG, 'favicon.png'), svg(bg(112) + art()), 96);
fs.writeFileSync(path.join(ROOT, 'public/icon.svg'), svg(bg(112) + art()).replace(/\n\s*/g, '') + '\n');
png(path.join(ROOT, 'public/icon-192.png'), svg(bg(112) + art()), 192);
png(path.join(ROOT, 'public/icon-512.png'), svg(bg(112) + art()), 512);
png(path.join(ROOT, 'public/icon-maskable-512.png'), svg(bg() + scaled(0.8)), 512);
// Store listing icon for Google Play (512 x 512, square, no transparency).
fs.mkdirSync(path.join(ROOT, 'mobile/store'), { recursive: true });
png(path.join(ROOT, 'mobile/store/play-icon-512.png'), svg(bg() + art()), 512);
// Google Play feature graphic (1024 x 500).
const feature = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 500">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${GREEN_TOP}"/><stop offset="1" stop-color="${GREEN_BOTTOM}"/></linearGradient></defs>
  <rect width="1024" height="500" fill="url(#g)"/>
  <g transform="translate(40 -6) scale(1)">${art()}</g>
  <text x="540" y="225" font-family="Segoe UI, Arial, sans-serif" font-size="76" font-weight="700" fill="#fff">Toronto Move</text>
  <text x="542" y="290" font-family="Segoe UI, Arial, sans-serif" font-size="32" fill="#d7efe9">Live TTC, GO, UP Express</text>
  <text x="542" y="336" font-family="Segoe UI, Arial, sans-serif" font-size="32" fill="#d7efe9">and Pearson, in one planner</text>
</svg>`;
png(path.join(ROOT, 'mobile/store/play-feature-graphic.png'), feature, 1024);

// iOS 26 Icon Composer file: white art layer on a green fill (system adds the glass effect).
const iconDir = path.join(ROOT, 'mobile/assets/expo.icon');
for (const f of fs.readdirSync(path.join(iconDir, 'Assets'))) fs.rmSync(path.join(iconDir, 'Assets', f));

// Art cropped to its own bounds (x 128-384, y 96-424), drawn at 2x for the 1024 pt canvas.
fs.writeFileSync(path.join(iconDir, 'Assets/train.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="656" viewBox="128 96 256 328">${art()}</svg>\n`);
fs.writeFileSync(path.join(iconDir, 'icon.json'), JSON.stringify({
  fill: { 'automatic-gradient': 'extended-srgb:0.05882,0.41961,0.36078,1.00000' },
  groups: [{
    layers: [{ 'image-name': 'train.svg', name: 'train', position: { scale: 1, 'translation-in-points': [0, 8] } }],
    shadow: { kind: 'neutral', opacity: 0.5 },
    translucency: { enabled: true, value: 0.5 },
  }],
  'supported-platforms': { circles: ['watchOS'], squares: 'shared' },
}, null, 2) + '\n');
console.log('expo.icon updated');
