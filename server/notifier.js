import { db, save, send as realSend } from './push.js';
import { weather } from './sources/weather.js';
import { allAlerts, planTrip } from './planner.js';

/*
 * Background loop (every minute) that decides who gets which push notification:
 *  1. Weather  — new Environment Canada alerts for Toronto at or above the user's chosen level.
 *  2. Routes   — new TTC / GO service alerts on routes the user follows (e.g. "1", "504", "LW").
 *  3. Trips    — watched commutes: a heads-up if something is wrong, a "leave in N min" reminder,
 *                and an update if the live delay changes after that.
 * Every notification has a dedupe key so nobody gets the same thing twice.
 */

const TZ = 'America/Toronto';
const TICK_MS = 60_000;
const WINDOW_BEFORE_MIN = 40;   // start watching a trip this long before its leave time
const WINDOW_AFTER_MIN = 10;
const REPLAN_EVERY_MS = 4 * 60_000; // keeps Transitous usage at ~13 plans per watched trip per day
const MAX_TRIP_PUSHES_PER_DAY = 4;
const DELAY_CHANGE_MIN = 4;
const LEVELS = { minor: 0, moderate: 1, severe: 2 };

// ---------------------------------------------------------------- Toronto time helpers
const partsFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
});
const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function torontoParts(date = new Date()) {
  const p = Object.fromEntries(partsFmt.formatToParts(date).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour, mm: +p.minute, weekday: WEEKDAYS[p.weekday], date: `${p.year}-${p.month}-${p.day}` };
}

/** Wall-clock time in Toronto -> Date (handles EST/EDT). */
export function torontoTime(y, m, d, hh, mm) {
  let guess = Date.UTC(y, m - 1, d, hh, mm);
  for (let i = 0; i < 2; i++) {
    const p = torontoParts(new Date(guess));
    const diff = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm) - Date.UTC(y, m - 1, d, hh, mm);
    guess -= diff;
  }
  return new Date(guess);
}

const clock = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, hour: 'numeric', minute: '2-digit' })
  .format(new Date(iso)).replace(/\s?([ap])\.?m\.?/i, (m, x) => ` ${x}m`);
const minsUntil = (iso, now) => Math.round((Date.parse(iso) - now) / 60000);
const modeName = (m) => ({ BUS: 'Bus', TRAM: 'Streetcar', SUBWAY: 'Line', REGIONAL_RAIL: 'Train', RAIL: 'Train', LONG_DISTANCE: 'Train', COACH: 'Coach', FERRY: 'Ferry' }[m] || '');

function legLabel(l) {
  if (!l) return '';
  if (l.mode === 'SUBWAY') return `Line ${l.route}`;
  if (l.agency === 'UP Express') return 'UP Express';
  if (l.agency === 'GO Transit') return `GO ${l.route}`;
  return `${modeName(l.mode)} ${l.route || ''}`.trim();
}

function tripSummary(o) {
  const first = o.legs.find((l) => l.transit);
  const walk = o.legs[0]?.mode === 'WALK' && o.legs[0].durationMin >= 1 ? `Walk ${o.legs[0].durationMin} min, then ` : '';
  if (!first) return `${o.kind === 'walk' ? 'Walk' : 'Ride'} ${o.durationMin} min, arrive ${clock(o.end)}`;
  const dep = first.live?.time || first.start;
  const late = first.live?.delayMin >= 2 ? ` (${first.live.delayMin} min late)` : first.live ? ' (live)' : '';
  const rest = o.legs.filter((l) => l.transit).slice(1).map(legLabel);
  return `${walk}${legLabel(first)} at ${clock(dep)}${late}${rest.length ? ` → ${rest.join(' → ')}` : ''}. Arrive ${clock(o.end)}.`;
}

const tripUrl = (w) => {
  const enc = (p) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)},${encodeURIComponent(p.name)}`;
  return `/?from=${enc(w.from)}&to=${enc(w.to)}`;
};

// ---------------------------------------------------------------- pure decision functions (unit-testable)

/** Which weather alerts should this subscriber get? */
export function weatherPushes(sub, alerts, sent) {
  if (!sub.prefs.weather) return [];
  const min = LEVELS[sub.prefs.weatherLevel] ?? 1;
  return alerts
    .filter((a) => (LEVELS[a.severity] ?? 0) >= min)
    .map((a) => ({ key: `wx:${a.name}|${a.issued || a.id}`, a }))
    .filter(({ key }) => !sent[key])
    .map(({ key, a }) => ({
      key,
      urgency: a.severity === 'severe' ? 'high' : 'normal',
      payload: {
        title: `${a.severity === 'severe' ? '⚠️ ' : ''}${a.name}${a.area ? ` · ${a.area}` : ''}`,
        body: (a.impact ? `${a.impact}. ` : '') + (a.text || '').replace(/\s+/g, ' ').slice(0, 180),
        tag: `wx-${a.name}`,
        url: '/?tab=alerts',
        urgent: a.severity === 'severe',
      },
    }));
}

const routeMatches = (alertRoutes, followed) =>
  alertRoutes.some((r) => followed.includes(r.toUpperCase()) || followed.includes(r.toUpperCase().split('-').pop()));

/**
 * Which service alerts should this subscriber get? When the followed-routes list changes we
 * "baseline": mark what's already active as seen, so following a route doesn't dump old alerts.
 */
export function routePushes(sub, alerts, sent) {
  const followed = sub.prefs.routes || [];
  if (!followed.length) return { pushes: [], baseline: [] };
  const relevant = alerts.filter((a) => a.activeNow && routeMatches(a.routes, followed));
  const keyOf = (a) => `alert:${a.source}:${a.header}`;
  if (sent.__routes !== followed.join(',')) {
    return { pushes: [], baseline: relevant.map(keyOf), routesKey: followed.join(',') };
  }
  const pushes = relevant.filter((a) => !sent[keyOf(a)]).map((a) => ({
    key: keyOf(a),
    urgency: a.effect === 'NO_SERVICE' ? 'high' : 'normal',
    payload: {
      title: `${a.source} ${a.routes.slice(0, 3).join(', ')}: ${(a.effect || 'Service alert').replace(/_/g, ' ').toLowerCase()}`,
      body: a.header.slice(0, 200),
      tag: `alert-${a.source}-${a.routes[0] || ''}`,
      url: '/?tab=alerts',
    },
  }));
  return { pushes, baseline: [] };
}

/** Is a watched trip active right now? Returns its target leave time for today or null. */
export function watchWindow(w, now = Date.now()) {
  const t = torontoParts(new Date(now));
  if (!w.days.includes(t.weekday)) return null;
  const [hh, mm] = w.leaveAt.split(':').map(Number);
  const leave = torontoTime(t.y, t.m, t.d, hh, mm).getTime();
  if (now < leave - WINDOW_BEFORE_MIN * 60000 || now > leave + WINDOW_AFTER_MIN * 60000) return null;
  return { leave, date: t.date };
}

/** Pick the option to follow: best transit option leaving no earlier than now (walk/bike only as a fallback). */
export function pickOption(options, now) {
  const upcoming = options.filter((o) => o.kind !== 'car' && Date.parse(o.start) >= now - 60000);
  return upcoming.find((o) => o.kind === 'transit') || upcoming[0] || null;
}

/**
 * Decide trip notifications. `st` is this watch's state for today
 * ({ heads, reminded, lastDelay, count }), mutated in place.
 */
export function tripPushes(w, plan, st, now) {
  const out = [];
  const o = pickOption(plan.options, now);
  if (!o || st.count >= MAX_TRIP_PUSHES_PER_DAY) return out;
  const first = o.legs.find((l) => l.transit);
  const delay = first?.live?.delayMin ?? 0;
  const label = w.name || `trip to ${w.to.name}`;
  const leaveIn = minsUntil(o.start, now);
  const issues = [
    ...o.legs.flatMap((l) => l.alerts.filter((a) => a.serious).map((a) => a.header)),
    ...(plan.weather?.impact?.notes || []),
    ...(delay >= 5 ? [`${legLabel(first)} is running ${delay} min late`] : []),
  ];

  // 1) Heads-up as soon as the window opens, only if something is off.
  if (!st.heads) {
    st.heads = true;
    if (issues.length) {
      out.push({
        urgency: 'normal',
        payload: { title: `Heads up: ${label}`, body: `${issues[0].slice(0, 140)} Best now: ${tripSummary(o)}`, tag: `trip-${w.id}`, url: tripUrl(w) },
      });
    }
  }

  // 2) Leave reminder.
  if (!st.reminded && leaveIn <= w.remindMin && leaveIn >= -2) {
    st.reminded = true;
    st.lastDelay = delay;
    out.push({
      urgency: 'high',
      payload: {
        title: leaveIn <= 0 ? `Leave now: ${label}` : `Leave in ${leaveIn} min: ${label}`,
        body: tripSummary(o),
        tag: `trip-${w.id}`,
        url: tripUrl(w),
        urgent: true,
      },
    });
  } else if (st.reminded && first?.live && Math.abs(delay - (st.lastDelay ?? 0)) >= DELAY_CHANGE_MIN && leaveIn >= -1) {
    // 3) Delay changed noticeably after the reminder.
    st.lastDelay = delay;
    out.push({
      urgency: 'high',
      payload: {
        title: delay > 0 ? `${legLabel(first)} now ${delay} min late` : `${legLabel(first)} back on time`,
        body: `${label}: ${leaveIn <= 0 ? 'leave now' : `leave in ${leaveIn} min`}. ${tripSummary(o)}`,
        tag: `trip-${w.id}`,
        url: tripUrl(w),
      },
    });
  }
  st.count += out.length;
  return out;
}

// ---------------------------------------------------------------- the loop
let deliver = realSend;
export function setDeliver(fn) { deliver = fn; } // for tests

async function checkAlerts() {
  const subs = Object.values(db.subs);
  if (!subs.length) return;
  const [wx, transit] = await Promise.all([
    weather.alerts().catch(() => null),
    allAlerts().then((a) => a.transit).catch(() => null),
  ]);
  for (const sub of subs) {
    const sent = (db.sent[sub.id] ||= {});
    const jobs = [];
    if (wx) jobs.push(...weatherPushes(sub, wx, sent));
    if (transit) {
      const r = routePushes(sub, transit, sent);
      for (const k of r.baseline) sent[k] = Date.now();
      if (r.routesKey !== undefined) sent.__routes = r.routesKey;
      jobs.push(...r.pushes);
    }
    for (const j of jobs.slice(0, 3)) { // never burst more than 3 at once
      sent[j.key] = Date.now();
      if (db.subs[sub.id]) await deliver(sub, j.payload, { urgency: j.urgency });
    }
    if (jobs.length) save();
  }
}

async function checkTrips(now = Date.now()) {
  for (const w of Object.values(db.watches)) {
    const sub = db.subs[w.subId];
    if (!sub) continue;
    const win = watchWindow(w, now);
    if (!win) continue;
    let st = db.state[w.id];
    if (!st || st.date !== win.date) st = db.state[w.id] = { date: win.date, heads: false, reminded: false, lastDelay: 0, count: 0, lastPlan: 0 };
    if (st.count >= MAX_TRIP_PUSHES_PER_DAY) continue;
    // Re-plan every few minutes, and every minute once we're close to the reminder time.
    const close = now >= win.leave - (w.remindMin + 3) * 60000;
    if (!close && now - st.lastPlan < REPLAN_EVERY_MS) continue;
    if (close && now - st.lastPlan < 60_000) continue;
    st.lastPlan = now;
    try {
      const plan = await planTrip({
        from: w.from, to: w.to, pref: w.pref, accessible: w.accessible,
        time: new Date(Math.max(now, win.leave - 10 * 60000)),
      });
      for (const p of tripPushes(w, plan, st, now)) await deliver(sub, p.payload, { urgency: p.urgency });
    } catch (err) {
      console.warn(`[notifier] trip ${w.id} plan failed: ${err.message}`);
    }
    save();
  }
}

export function startNotifier() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await checkAlerts();
      await checkTrips();
    } catch (err) {
      console.warn('[notifier]', err.message);
    } finally {
      running = false;
    }
  };
  setTimeout(tick, 5000);
  setInterval(tick, TICK_MS);
}

export { checkAlerts, checkTrips };
