import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as webpush from 'web-push';
import { config } from './config.js';

/*
 * Web Push subscriptions + watched trips, persisted to data/push.json.
 * Good for a single server and a few thousand users; move to a database (e.g. Postgres/Supabase) beyond that.
 *
 * A subscription's push endpoint is an unguessable URL, so we use it as the bearer secret:
 * every mutating call must send the endpoint, and the record id is a hash of it.
 */
const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const FILE = process.env.PUSH_DATA_FILE || path.join(DATA_DIR, 'push.json');

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return {}; }
}
export const db = { vapid: null, subs: {}, watches: {}, sent: {}, state: {}, ...load() };

let saveTimer;
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const tmp = `${FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
    fs.renameSync(tmp, FILE);
  }, 500);
}

// VAPID keys identify this server to browser push services. Generated once, then reused.
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  db.vapid = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
} else if (!db.vapid) {
  db.vapid = webpush.generateVAPIDKeys();
  save();
}
const subject = /^(mailto:|https:\/\/)/.test(config.contact) ? config.contact
  : config.contact.includes('@') ? `mailto:${config.contact}` : 'mailto:toronto-move@example.com';
webpush.setVapidDetails(subject, db.vapid.publicKey, db.vapid.privateKey);

export const subId = (endpoint) => crypto.createHash('sha256').update(endpoint).digest('hex').slice(0, 24);

const DEFAULT_PREFS = { weather: true, weatherLevel: 'moderate', precip: true, quiet: true, routes: [] };

function cleanPrefs(p = {}) {
  return {
    weather: p.weather !== false,
    weatherLevel: ['minor', 'moderate', 'severe'].includes(p.weatherLevel) ? p.weatherLevel : 'moderate',
    precip: p.precip !== false, // "snow around 4 pm" heads-ups
    quiet: p.quiet !== false,   // hold non-urgent notifications 10 pm to 7 am
    routes: [...new Set((Array.isArray(p.routes) ? p.routes : String(p.routes || '').split(/[\s,]+/))
      .map((r) => String(r).trim().toUpperCase().replace(/^LINE\s*/, ''))
      .filter((r) => /^[A-Z0-9-]{1,12}$/.test(r)))].slice(0, 20),
  };
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const place = (p) => {
  const lat = Number(p?.lat), lon = Number(p?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw bad('from/to must have lat and lon');
  return { name: String(p.name || 'Pinned location').slice(0, 120), lat, lon };
};
function cleanWatch(w = {}) {
  if (!TIME_RE.test(w.leaveAt || '')) throw bad('leaveAt must be HH:MM (24h)');
  const days = [...new Set((w.days || []).map(Number).filter((d) => d >= 0 && d <= 6))].sort();
  if (!days.length) throw bad('Pick at least one day');
  return {
    name: String(w.name || '').slice(0, 60) || null,
    from: place(w.from),
    to: place(w.to),
    leaveAt: w.leaveAt,
    days,
    remindMin: Math.min(60, Math.max(0, Number(w.remindMin) || 10)),
    pref: ['balanced', 'fastest', 'fewer_transfers', 'less_walking'].includes(w.pref) ? w.pref : 'balanced',
    accessible: Boolean(w.accessible),
  };
}

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });

const EXPO_PUSH = 'https://exp.host/--/api/v2/push/send';
export const isExpoToken = (t) => typeof t === 'string' && /^Expo(nent)?PushToken\[[^\]]{10,}\]$/.test(t);

/** Phones (iOS/Android apps) get notifications through Expo's push service. */
async function sendExpo(sub, payload, { urgency, ttl }) {
  const res = await fetch(EXPO_PUSH, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: sub.expoToken,
      title: payload.title,
      body: payload.body,
      data: { url: payload.url || '/', tag: payload.tag || null },
      sound: 'default',
      priority: urgency === 'high' ? 'high' : 'default',
      channelId: 'default',
      ttl,
      ...(payload.tag ? { collapseId: payload.tag } : {}),
    }),
    signal: AbortSignal.timeout(15000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.errors?.[0]?.message || `Expo push ${res.status}`), { statusCode: res.status });
  const ticket = Array.isArray(body.data) ? body.data[0] : body.data;
  if (ticket?.status === 'error') {
    const gone = ticket.details?.error === 'DeviceNotRegistered';
    throw Object.assign(new Error(ticket.message || 'Expo push error'), { statusCode: gone ? 410 : 400 });
  }
}

/** Send one notification (browser Web Push or phone Expo push). Removes subscriptions that are gone. */
export async function send(sub, payload, { urgency = 'normal', ttl = 900 } = {}) {
  try {
    if (sub.expoToken) {
      await sendExpo(sub, payload, { urgency, ttl });
      sub.lastSent = new Date().toISOString();
      return true;
    }
    await webpush.sendNotification(sub.subscription, JSON.stringify(payload), { TTL: ttl, urgency });
    sub.lastSent = new Date().toISOString();
    return true;
  } catch (err) {
    if (err.statusCode === 404 || err.statusCode === 410) {
      console.log(`[push] subscription ${sub.id} expired, removing`);
      removeSub(sub.id);
    } else {
      console.warn(`[push] send to ${sub.id} failed: ${err.statusCode || ''} ${err.body || err.message}`);
    }
    return false;
  }
}

function removeSub(id) {
  delete db.subs[id];
  delete db.sent[id];
  for (const [wid, w] of Object.entries(db.watches)) if (w.subId === id) { delete db.watches[wid]; delete db.state[wid]; }
  save();
}

const view = (sub) => ({
  id: sub.id,
  prefs: sub.prefs,
  watches: Object.values(db.watches).filter((w) => w.subId === sub.id),
});

// ---------------------------------------------------------------- HTTP API
export const pushRoutes = express.Router();
pushRoutes.use(express.json({ limit: '16kb' }));

const handle = (fn) => async (req, res) => {
  try { res.json(await fn(req)); } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};
const MAX_SUBS = 5000;
const MAX_WATCHES_PER_SUB = 5;

function findSub(req) {
  // browsers identify with their push endpoint URL, phone apps with their Expo push token
  const endpoint = req.body?.endpoint || req.body?.subscription?.endpoint || req.body?.expoToken;
  if (!endpoint) throw bad('endpoint required');
  const sub = db.subs[subId(endpoint)];
  if (!sub) throw bad('Not subscribed', 404);
  return sub;
}

pushRoutes.get('/key', (req, res) => res.json({ publicKey: db.vapid.publicKey }));

pushRoutes.post('/subscribe', handle(async (req) => {
  // Phone app: { expoToken: "ExponentPushToken[...]" }. The token is the secret, like a browser endpoint.
  const expoToken = req.body?.expoToken;
  if (expoToken) {
    if (!isExpoToken(expoToken)) throw bad('Invalid Expo push token');
    const id = subId(expoToken);
    const existing = db.subs[id];
    if (!existing && Object.keys(db.subs).length >= MAX_SUBS) throw bad('Subscription limit reached', 503);
    db.subs[id] = {
      id,
      expoToken,
      platform: String(req.body.platform || 'app').slice(0, 10),
      prefs: cleanPrefs(req.body.prefs ?? existing?.prefs ?? DEFAULT_PREFS),
      created: existing?.created || new Date().toISOString(),
    };
    save();
    return view(db.subs[id]);
  }
  const s = req.body?.subscription;
  if (!s?.endpoint || !/^https:\/\//.test(s.endpoint) || !s.keys?.p256dh || !s.keys?.auth) throw bad('Invalid push subscription');
  const id = subId(s.endpoint);
  const existing = db.subs[id];
  if (!existing && Object.keys(db.subs).length >= MAX_SUBS) throw bad('Subscription limit reached', 503);
  db.subs[id] = {
    id,
    subscription: { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } },
    prefs: cleanPrefs(req.body.prefs ?? existing?.prefs ?? DEFAULT_PREFS),
    created: existing?.created || new Date().toISOString(),
  };
  save();
  return view(db.subs[id]);
}));

pushRoutes.post('/me', handle(async (req) => view(findSub(req))));

pushRoutes.post('/prefs', handle(async (req) => {
  const sub = findSub(req);
  sub.prefs = cleanPrefs(req.body.prefs);
  save();
  return view(sub);
}));

pushRoutes.post('/watch', handle(async (req) => {
  const sub = findSub(req);
  const mine = Object.values(db.watches).filter((w) => w.subId === sub.id);
  if (mine.length >= MAX_WATCHES_PER_SUB) throw bad(`You can watch up to ${MAX_WATCHES_PER_SUB} trips`);
  const id = crypto.randomBytes(6).toString('hex');
  db.watches[id] = { id, subId: sub.id, ...cleanWatch(req.body.watch), created: new Date().toISOString() };
  save();
  return view(sub);
}));

pushRoutes.post('/watch/delete', handle(async (req) => {
  const sub = findSub(req);
  const w = db.watches[req.body.id];
  if (w?.subId === sub.id) { delete db.watches[w.id]; delete db.state[w.id]; save(); }
  return view(sub);
}));

pushRoutes.post('/test', handle(async (req) => {
  const sub = findSub(req);
  const ok = await send(sub, { title: 'Toronto Move notifications are on', body: 'You will get weather warnings, route alerts and trip reminders here.', tag: 'test' });
  if (!ok) throw bad('The push service rejected the test message', 502);
  return { ok };
}));

pushRoutes.post('/unsubscribe', handle(async (req) => {
  const endpoint = req.body?.endpoint || req.body?.expoToken;
  if (endpoint && db.subs[subId(endpoint)]) removeSub(subId(endpoint));
  return { ok: true };
}));
