/* Toronto Go — front end. Plain ES modules + Leaflet, no build step. */

const TZ = 'America/Toronto';
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(`tg:${k}`)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`tg:${k}`, JSON.stringify(v)); } catch { /* private mode */ } },
};

async function api(path) {
  const res = await fetch(`/api/${path}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

function toast(msg, ms = 3200) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, ms);
}

// ------------------------------------------------------------------ time helpers
const timeFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
const fmtTime = (iso) => (iso ? timeFmt.format(new Date(iso)).replace(/\s?([ap])\.?m\.?/i, (m, x) => ` ${x}m`).replace('.', '') : '');
const minsUntil = (iso) => Math.round((Date.parse(iso) - Date.now()) / 60000);
function inLabel(iso) {
  const m = minsUntil(iso);
  if (m <= 0) return 'Now';
  if (m < 60) return `${m} min`;
  return fmtTime(iso);
}
const durLabel = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ''}`.trim());
function delayLabel(d) {
  if (d == null || Math.abs(d) < 1) return '<span class="early">on time</span>';
  return d > 0 ? `<span class="late">${d} min late</span>` : `<span class="early">${-d} min early</span>`;
}

// ------------------------------------------------------------------ icons
const ICON_PATHS = {
  WALK: 'M13.5 5.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM9.8 8.9 7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3A7.3 7.3 0 0 0 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5 0-.8.1L6 8.3V13h2V9.6l1.8-.7',
  BIKE: 'M15.5 5.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM5 12a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 8.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Zm5.8-10L13.2 8l.8.8A7 7 0 0 0 19 11V9a5 5 0 0 1-3.6-1.5l-1.9-1.9c-.5-.4-1-.6-1.6-.6s-1.1.2-1.4.6L7.8 8.4a2 2 0 0 0 0 2.8L11 14v5h2v-6.2l-2.2-2.3ZM19 12a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 8.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z',
  CAR: 'M18.9 6c-.2-.6-.8-1-1.4-1h-11c-.7 0-1.2.4-1.4 1L3 12v8c0 .6.4 1 1 1h1c.6 0 1-.4 1-1v-1h12v1c0 .6.4 1 1 1h1c.6 0 1-.4 1-1v-8l-2.1-6ZM6.5 16a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm11 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3ZM5 11l1.5-4.5h11L19 11H5Z',
  BUS: 'M4 16c0 .9.4 1.7 1 2.2V20c0 .6.4 1 1 1h1c.6 0 1-.4 1-1v-1h8v1c0 .6.4 1 1 1h1c.6 0 1-.4 1-1v-1.8c.6-.5 1-1.3 1-2.2V6c0-3.5-3.6-4-8-4s-8 .5-8 4v10Zm3.5 1a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm9 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm1.5-6H6V6h12v5Z',
  TRAM: 'M19 16.9V8c0-2.8-2.6-3.4-6.2-3.5L13.6 3H17V1.5H7V3h4.8L11 4.5C7.9 4.6 5 5.2 5 8v8.9c0 1.4 1.2 2.7 2.6 3l-1.6 1.6v.5h2.2l2-2H14l2 2h2v-.5L16.5 20h-.1c1.5 0 2.6-1.4 2.6-3.1ZM12 18.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm5-4.5H7V9h10v5Z',
  SUBWAY: 'M12 2c-4 0-8 .5-8 4v9.5A3.5 3.5 0 0 0 7.5 19L6 20.5v.5h12v-.5L16.5 19a3.5 3.5 0 0 0 3.5-3.5V6c0-3.5-3.6-4-8-4ZM7.5 17a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm3.5-7H6V6h5v4Zm2 0V6h5v4h-5Zm3.5 7a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z',
  RAIL: 'M12 2C8 2 4 2.5 4 6v9.5A3.5 3.5 0 0 0 7.5 19L6 20.5v.5h2.2l2-2H14l2 2h2v-.5L16.5 19a3.5 3.5 0 0 0 3.5-3.5V6c0-3.5-3.6-4-8-4ZM7.5 17a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm3.5-6H6V7h5v4Zm5.5 6a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm1.5-6h-5V7h5v4Z',
  FERRY: 'M20 21c-1.4 0-2.8-.5-4-1.3a7 7 0 0 1-8 0A6.9 6.9 0 0 1 4 21H2v2h2c1.4 0 2.7-.3 4-1a8.2 8.2 0 0 0 8 0c1.3.7 2.6 1 4 1h2v-2h-2ZM3.9 19H4c1.6 0 3-.9 4-2 1 1.1 2.4 2 4 2s3-.9 4-2c1 1.1 2.4 2 4 2h.1l1.9-6.7c.1-.3 0-.5-.1-.8-.1-.2-.4-.4-.7-.4L20 10.6V6c0-1.1-.9-2-2-2h-3V1H9v3H6a2 2 0 0 0-2 2v4.6l-1.3.4c-.3.1-.5.2-.6.5-.1.2-.2.5-.1.8L3.9 19ZM6 6h12v4l-6-2-6 2V6Z',
  PLANE: 'M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5Z',
};
const modeIcon = (mode) => {
  const k = { REGIONAL_RAIL: 'RAIL', REGIONAL_FAST_RAIL: 'RAIL', LONG_DISTANCE: 'RAIL', HIGHSPEED_RAIL: 'RAIL', NIGHT_RAIL: 'RAIL', SUBURBAN: 'RAIL', COACH: 'BUS', METRO: 'SUBWAY' }[mode] || mode;
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON_PATHS[k] || ICON_PATHS.BUS}"/></svg>`;
};
const modeName = (m) => ({ WALK: 'Walk', BIKE: 'Bike', CAR: 'Drive', BUS: 'Bus', TRAM: 'Streetcar', SUBWAY: 'Subway', REGIONAL_RAIL: 'Train', RAIL: 'Train', LONG_DISTANCE: 'Train', COACH: 'Coach', FERRY: 'Ferry' }[m] || m);

/** Clean GO-style headsigns like "Union Station GO 06:34 - Bramalea GO 07:12" -> "Bramalea GO". */
function cleanHeadsign(h) {
  if (!h) return '';
  const m = /^.+? \d{1,2}:\d{2} - (.+?) \d{1,2}:\d{2}$/.exec(h);
  return m ? m[1] : h;
}

// ------------------------------------------------------------------ map
const TORONTO = [43.6532, -79.3832];
const map = L.map('map', { zoomControl: false, preferCanvas: true }).setView(TORONTO, 13);
L.control.zoom({ position: 'bottomright' }).addTo(map);
// If the map has no size yet (background tab, hidden panel), remember the fit and apply it once it does.
let pendingFit = null;
function fitTo(bounds, padding = 50) {
  const s = map.getSize();
  if (!s.x || !s.y) { pendingFit = { bounds, padding }; return; }
  pendingFit = null;
  if (bounds.length === 1) map.setView(bounds[0], Math.max(map.getZoom(), 14));
  else map.fitBounds(bounds, { padding: [padding, padding] });
}
new ResizeObserver(() => { // phone rotate / layout switch / tab becomes visible
  map.invalidateSize();
  if (pendingFit) fitTo(pendingFit.bounds, pendingFit.padding);
}).observe(document.getElementById('map'));
// OpenStreetMap's own tiles are fine for development/light use. For a public launch,
// switch to a tile provider with a plan (MapTiler, Stadia, Mapbox, or self-hosted Protomaps).
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

const layers = {
  route: L.layerGroup().addTo(map),
  ends: L.layerGroup().addTo(map),
  stops: L.layerGroup().addTo(map),
  vehicles: L.layerGroup().addTo(map),
  bikes: L.layerGroup().addTo(map),
};

const endIcon = (cls) => L.divIcon({ className: '', html: `<div style="width:16px;height:16px;border-radius:${cls === 'to' ? '3px' : '50%'};background:var(--${cls});border:3px solid #fff;box-shadow:0 1px 4px rgb(0 0 0/.4)"></div>`, iconSize: [16, 16], iconAnchor: [8, 8] });

function decodePolyline(str, precision = 6) {
  const factor = 10 ** precision;
  let lat = 0, lon = 0, i = 0;
  const out = [];
  while (i < str.length) {
    for (const which of [0, 1]) {
      let shift = 0, result = 0, b;
      do { b = str.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += d; else lon += d;
    }
    out.push([lat / factor, lon / factor]);
  }
  return out;
}

// ------------------------------------------------------------------ places (from / to)
const state = {
  from: null, to: null,
  options: [], selected: 0,
  status: null, weather: null,
};

function setPlace(role, place, { fit = true } = {}) {
  state[role] = place;
  const input = $(`#${role}Input`);
  input.value = place?.name || '';
  layers.ends.clearLayers();
  for (const r of ['from', 'to']) {
    if (state[r]) L.marker([state[r].lat, state[r].lon], { icon: endIcon(r), keyboard: false }).addTo(layers.ends);
  }
  if (fit) {
    const pts = ['from', 'to'].filter((r) => state[r]).map((r) => [state[r].lat, state[r].lon]);
    if (pts.length) fitTo(pts, 60);
  }
  saveUrl();
  if (state.from && state.to) planTrip();
}

function saveUrl() {
  const enc = (p) => (p ? `${p.lat.toFixed(5)},${p.lon.toFixed(5)},${p.name}` : null);
  const q = new URLSearchParams();
  if (state.from) q.set('from', enc(state.from));
  if (state.to) q.set('to', enc(state.to));
  const s = q.toString().replace(/%2C/g, ',').replace(/\+/g, '%20');
  history.replaceState(null, '', s ? `?${s}` : location.pathname);
}

function loadUrl() {
  const q = new URLSearchParams(location.search);
  const dec = (s) => {
    if (!s) return null;
    const [lat, lon, ...name] = s.split(',');
    const p = { lat: Number(lat), lon: Number(lon), name: name.join(',') || 'Pinned location' };
    return Number.isFinite(p.lat) && Number.isFinite(p.lon) ? p : null;
  };
  return { from: dec(q.get('from')), to: dec(q.get('to')) };
}

// Autocomplete for each input
for (const field of $$('.field.place')) {
  const role = field.dataset.role;
  const input = $('input', field);
  const list = $('.suggest', field);
  let items = [];
  let active = -1;
  let timer;
  let seq = 0;

  const close = () => { list.hidden = true; active = -1; };
  const choose = (p) => { close(); setPlace(role, { name: p.name, lat: p.lat, lon: p.lon }); };
  const render = () => {
    list.innerHTML = items.map((p, i) => `<li data-i="${i}" class="${i === active ? 'active' : ''}">
      <span class="kind">${esc(p.type === 'STOP' ? 'Stop' : p.type === 'ADDRESS' ? 'Address' : p.type === 'SAVED' ? 'Saved' : 'Place')}</span>
      <span>${esc(p.name)}<span class="detail">${esc(p.detail || '')}</span></span></li>`).join('');
    list.hidden = !items.length;
  };

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 3) {
      const saved = savedPlaces().filter((s) => !q || s.label.toLowerCase().startsWith(q.toLowerCase()));
      items = saved.map((s) => ({ ...s.place, type: 'SAVED', detail: s.label }));
      render();
      return;
    }
    timer = setTimeout(async () => {
      const my = ++seq;
      try {
        const res = await api(`geocode?q=${encodeURIComponent(q)}`);
        if (my !== seq) return;
        const seen = new Set();
        items = res.filter((r) => { const k = r.name + r.detail; if (seen.has(k)) return false; seen.add(k); return true; });
        active = -1;
        render();
      } catch (e) { /* keep typing */ }
    }, 280);
  });
  input.addEventListener('focus', () => { if (!input.value) input.dispatchEvent(new Event('input')); });
  input.addEventListener('keydown', (e) => {
    if (list.hidden) return;
    if (e.key === 'ArrowDown') { active = Math.min(items.length - 1, active + 1); render(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { active = Math.max(0, active - 1); render(); e.preventDefault(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (items[active] || items[0]) choose(items[active] || items[0]); }
    else if (e.key === 'Escape') close();
  });
  list.addEventListener('mousedown', (e) => {
    const li = e.target.closest('li');
    if (li) { e.preventDefault(); choose(items[Number(li.dataset.i)]); }
  });
  input.addEventListener('blur', () => setTimeout(close, 150));
}

$('#swapBtn').addEventListener('click', () => {
  const { from, to } = state;
  state.from = null; state.to = null;
  setPlace('from', to, { fit: false });
  setPlace('to', from);
});

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Location is not available in this browser'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => reject(new Error('Location permission was denied')),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  });
}

$('#locateBtn').addEventListener('click', async () => {
  try {
    const pos = await getPosition();
    let name = 'My location';
    try { name = (await api(`reverse?at=${pos.lat},${pos.lon}`)).name || name; } catch { /* fine */ }
    setPlace('from', { ...pos, name });
  } catch (e) { toast(e.message); }
});

// Right-click / long-press on map
map.on('contextmenu', (e) => {
  const { lat, lng } = e.latlng;
  const html = `<div><b>Pinned location</b><div class="popup-btns">
    <button data-act="from">Start here</button><button data-act="to">Go here</button><button data-act="near">Departures</button></div></div>`;
  const pop = L.popup().setLatLng(e.latlng).setContent(html).openOn(map);
  pop.getElement().addEventListener('click', async (ev) => {
    const act = ev.target.dataset?.act;
    if (!act) return;
    map.closePopup();
    if (act === 'near') { showTab('nearby'); loadNearby({ lat, lon: lng }); return; }
    let name = 'Pinned location';
    try { name = (await api(`reverse?at=${lat},${lng}`)).name || name; } catch { /* fine */ }
    setPlace(act, { lat, lon: lng, name });
  });
});

// ------------------------------------------------------------------ saved places
function savedPlaces() {
  const s = store.get('saved', {});
  return Object.entries(s).map(([label, place]) => ({ label, place }));
}
function renderSaved() {
  const saved = store.get('saved', {});
  if (typeof renderHome === 'function' && $('#homeCard')) setTimeout(renderHome);
  const row = $('#savedRow');
  const pills = ['Home', 'Work'].map((label) => saved[label]
    ? `<button class="pill" type="button" data-go="${label}" title="Route to ${label} (right-click to remove)">${label === 'Home' ? '⌂' : '◼'} ${label}</button>`
    : `<button class="pill add" type="button" data-save="${label}" title="Save the destination (or start) as ${label}">+ Set ${label}</button>`);
  const recents = store.get('recent', []).slice(0, 3).map((p, i) =>
    `<button class="pill" type="button" data-recent="${i}" title="${esc(p.name)}">↺ ${esc(p.name.length > 22 ? `${p.name.slice(0, 21)}…` : p.name)}</button>`);
  row.innerHTML = [...pills, ...recents].join('');
}
$('#savedRow').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const saved = store.get('saved', {});
  if (b.dataset.save) {
    const p = state.to || state.from;
    if (!p) return toast(`Choose a place first, then tap "Set ${b.dataset.save}".`);
    saved[b.dataset.save] = p;
    store.set('saved', saved);
    toast(`${b.dataset.save} saved: ${p.name}`);
    renderSaved();
  } else if (b.dataset.go) {
    setPlace('to', saved[b.dataset.go]);
  } else if (b.dataset.recent) {
    setPlace('to', store.get('recent', [])[Number(b.dataset.recent)]);
  }
});
$('#savedRow').addEventListener('contextmenu', (e) => {
  const b = e.target.closest('[data-go]');
  if (!b) return;
  e.preventDefault();
  const saved = store.get('saved', {});
  delete saved[b.dataset.go];
  store.set('saved', saved);
  renderSaved();
  toast(`${b.dataset.go} removed`);
});
function rememberRecent(p) {
  if (!p) return;
  const saved = Object.values(store.get('saved', {}));
  if (saved.some((s) => s.name === p.name)) return;
  const list = store.get('recent', []).filter((r) => r.name !== p.name);
  store.set('recent', [p, ...list].slice(0, 5));
  renderSaved();
}

// ------------------------------------------------------------------ trip planning
$('#whenSel').addEventListener('change', () => {
  const t = $('#whenTime');
  t.hidden = $('#whenSel').value === 'now';
  if (!t.hidden && !t.value) {
    const d = new Date(Date.now() + 30 * 60000);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    t.value = local;
  }
});
$('#riderSel').value = store.get('rider', 'adult');
$('#riderSel').addEventListener('change', () => store.set('rider', $('#riderSel').value));
for (const id of ['#prefSel', '#accessible', '#coach', '#whenTime', '#riderSel']) {
  $(id).addEventListener('change', () => { if (state.from && state.to) planTrip(); });
}
$('#planForm').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!state.from) return toast('Choose where you are starting from (or tap the location button).');
  if (!state.to) return toast('Choose a destination.');
  planTrip();
});

let planSeq = 0;
async function planTrip({ quiet = false } = {}) {
  const my = ++planSeq;
  const when = $('#whenSel').value;
  const q = new URLSearchParams({
    from: `${state.from.lat},${state.from.lon}`,
    to: `${state.to.lat},${state.to.lon}`,
    pref: $('#prefSel').value,
    accessible: $('#accessible').checked,
    coach: $('#coach').checked,
    rider: $('#riderSel').value,
  });
  if (when !== 'now' && $('#whenTime').value) {
    q.set('time', new Date($('#whenTime').value).toISOString());
    if (when === 'arrive') q.set('arriveBy', 'true');
  }
  $('#planEmpty').hidden = true;
  if (!quiet) {
    $('#planBtn').disabled = true;
    $('#results').innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
    $('#planNotes').innerHTML = '';
  }
  try {
    const res = await api(`plan?${q}`);
    if (my !== planSeq) return;
    rememberRecent(state.to);
    const prevSig = state.options[state.selected]?.start;
    state.options = res.options;
    state.selected = Math.max(0, quiet ? res.options.findIndex((o) => o.start === prevSig) : 0);
    renderNotes(res.weather?.impact);
    renderOptions();
    drawOption(state.options[state.selected], { fit: !quiet });
  } catch (e) {
    if (my !== planSeq) return;
    if (!quiet) $('#results').innerHTML = `<div class="err">Couldn't plan this trip: ${esc(e.message)}</div>`;
  } finally {
    if (my === planSeq) $('#planBtn').disabled = false;
  }
}

function renderNotes(impact) {
  const notes = impact?.notes || [];
  $('#planNotes').innerHTML = notes.map((n) => `<div class="note">${esc(n)}</div>`).join('');
}

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const money = (n) => `$${Number(n).toFixed(2)}`;
function fareText(f) {
  if (!f) return '';
  if (f.total === 0 && f.complete) return 'Free';
  return `${money(f.total)}${f.complete ? '' : '+'}`;
}
function fareBlock(f) {
  if (!f) return '';
  const rows = f.items.map((i) => `<div>${esc(i.label)}: <b>${i.amount == null ? 'not included' : i.amount === 0 ? 'free' : money(i.amount)}</b>${i.note ? ` <span class="muted">· ${esc(i.note)}</span>` : ''}</div>`).join('');
  return `<div class="fare-box"><div class="fare-total">Fare ${fareText(f)}${f.rider && f.rider !== 'adult' ? ` <span class="muted">(${esc(f.rider)})</span>` : ''}</div>${rows}<div class="muted small">${esc(f.note || '')}</div></div>`;
}
const accessIcon = '<span class="acc" aria-label="Accessibility">♿</span>';

function legChip(l) {
  if (l.bikeshare) return `<span class="chip" style="background:#2e9b47;color:#fff" title="Bike Share Toronto">${modeIcon('BIKE')}Bike Share</span>`;
  if (!l.transit) {
    if (l.mode === 'WALK' && l.durationMin < 1) return '';
    return `<span class="chip walk">${modeIcon(l.mode)}${l.durationMin}</span>`;
  }
  const style = l.color ? `style="background:${esc(l.color)};color:${esc(l.textColor || '#fff')}"` : '';
  return `<span class="chip" ${style} title="${esc(l.agency)} ${esc(l.routeName || '')}">${modeIcon(l.mode)}${esc(l.route || modeName(l.mode))}</span>`;
}

function renderOptions() {
  const el = $('#results');
  if (!state.options.length) {
    el.innerHTML = '<div class="err">No routes found. Try a different time, or turn on intercity coaches for long trips.</div>';
    return;
  }
  el.innerHTML = state.options.map((o, i) => {
    const first = o.legs.find((l) => l.transit);
    const leaveMins = minsUntil(o.start);
    const title = o.kind === 'transit' ? '' : `<b>${o.kind === 'bikeshare' ? 'Bike Share' : modeName(o.kind.toUpperCase())}</b> · `;
    const bs = o.bikeshare;
    const leave = first
      ? `<span class="leave ${first.live ? 'live' : ''}">${first.live ? '<span class="livedot"></span>' : ''}${leaveMins <= 0 ? 'Leave now' : `Leave in ${durLabel(leaveMins)}`}</span>
         <span>${esc(modeName(first.mode))} ${esc(first.route || '')} at ${fmtTime(first.live?.time || first.start)}${first.live ? ` · ${delayLabel(first.live.delayMin)}` : ' · scheduled'}</span>`
      : bs
        ? `<span class="leave live"><span class="livedot"></span>${plural(bs.from.bikes, 'bike')}${bs.from.ebikes ? ` (${plural(bs.from.ebikes, 'e-bike')})` : ''} at ${esc(bs.from.name)}</span><span>${plural(bs.to.docks, 'free dock')} at ${esc(bs.to.name)}</span>`
        : `<span class="leave">Leave any time</span>`;
    const fare = o.fare ? `<span class="fare-chip" title="Estimated fare with PRESTO / tap">${fareText(o.fare)}</span>` : '';
    const elevators = (o.accessIssues || []).filter((a) => a.kind === 'elevator');
    const accNote = elevators.length
      ? `<div class="acc-note">${accessIcon} Elevator out at ${esc([...new Set(elevators.map((a) => a.station))].join(', '))}</div>`
      : (o.accessIssues || []).length ? `<div class="acc-note minor">${accessIcon} Escalator out at ${esc([...new Set(o.accessIssues.map((a) => a.station))].join(', '))}</div>` : '';
    const chips = o.legs.map(legChip).filter(Boolean).join('<span class="chev">›</span>');
    const tags = (o.tags || []).map((t) => `<span class="tag ${t === 'Recommended' ? 'rec' : ''}">${esc(t)}</span>`).join('');
    const warns = (o.warnings || []).map((w) => `<div>${esc(w)}</div>`).join('');
    return `<article class="opt ${i === state.selected ? 'sel' : ''}" data-i="${i}" tabindex="0">
      ${tags ? `<div class="tags">${tags}</div>` : ''}
      <div class="opt-head">
        <div class="opt-time">${title}${fmtTime(o.start)} – ${fmtTime(o.end)}</div>
        <div class="opt-dur">${durLabel(o.durationMin)}${fare}</div>
      </div>
      <div class="opt-meta">${leave}${o.kind === 'transit' ? `<span>${o.transfers} transfer${o.transfers === 1 ? '' : 's'} · ${o.walkMin} min walk</span>` : ''}</div>
      <div class="chips">${chips}</div>
      ${warns ? `<div class="warns">${warns}</div>` : ''}
      ${accNote}
      <div class="steps">${renderSteps(o)}</div>
    </article>`;
  }).join('');
}

function renderSteps(o) {
  const rows = o.legs.map((l) => {
    if (l.bikeshare) {
      const bs = o.bikeshare;
      const alt = bs.alternatives?.from?.length ? `<div class="sub2">If empty: ${bs.alternatives.from.map((s) => `${esc(s.name)} (${s.bikes} bikes, ${s.distanceM} m)`).join(', ')}</div>` : '';
      return `<div class="step" style="--c:#2e9b47"><div class="t">${fmtTime(l.start)}</div><div class="bar"></div>
        <div class="body"><b>${esc(bs.from.name)}</b>
          <div>${legChip(l)} <span class="sub2"><span class="livedot"></span>${plural(bs.from.bikes, 'bike')} now${bs.from.ebikes ? `, ${plural(bs.from.ebikes, 'e-bike')}` : ''}</span></div>
          <div class="sub2">Ride about ${l.durationMin} min · dock at <b>${esc(bs.to.name)}</b> (${bs.to.docks} free docks now)</div>
          ${alt}
        </div></div>`;
    }
    if (!l.transit) {
      if (l.durationMin < 1) return '';
      const dist = l.distanceM ? ` · ${l.distanceM >= 1000 ? `${(l.distanceM / 1000).toFixed(1)} km` : `${l.distanceM} m`}` : '';
      return `<div class="step walking"><div class="t">${fmtTime(l.start)}</div><div class="bar"></div>
        <div class="body">${modeName(l.mode)} ${l.durationMin} min${dist}<div class="sub2">to ${esc(l.to.name === 'END' ? 'destination' : l.to.name)}</div></div></div>`;
    }
    const alerts = l.alerts.map((a) => `<div class="alert ${a.serious ? 'serious' : ''}">${esc(a.header)}</div>`).join('')
      + (l.access || []).map((a) => `<div class="alert ${a.kind === 'elevator' ? 'serious' : ''}">${accessIcon} ${esc(a.header)}</div>`).join('');
    const liveLine = l.live
      ? `<div class="sub2"><span class="livedot"></span>Live: departs ${fmtTime(l.live.time)} (${delayLabel(l.live.delayMin)})</div>`
      : '<div class="sub2">Scheduled time</div>';
    const track = l.from.track ? ` · Platform ${esc(l.from.track)}` : '';
    return `<div class="step" style="--c:${esc(l.color || '#888')}"><div class="t">${fmtTime(l.live?.time || l.start)}</div><div class="bar"></div>
      <div class="body"><b>${esc(l.from.name)}</b>${track}
        <div>${legChip(l)} ${esc(cleanHeadsign(l.headsign) || l.routeName || '')}</div>
        ${liveLine}
        <div class="sub2">${l.durationMin} min${l.stops ? ` · ${l.stops} stops` : ''} · get off at <b>${esc(l.to.name)}</b> (${fmtTime(l.end)})</div>
        ${l.fareUrl ? `<a class="fare" href="${esc(l.fareUrl)}" target="_blank" rel="noopener">${esc(l.agency)} fares</a>` : ''}
        ${alerts}
      </div></div>`;
  }).join('');
  const watch = o.kind === 'transit'
    ? `<button class="ghost watch-btn" type="button" data-watch>🔔 Watch this trip: remind me & alert me to delays</button><div class="watch-slot"></div>`
    : '';
  const approx = o.approximate ? '<p class="muted small" style="margin:6px 0 0">Times are estimated from distance; bike and dock counts are live.</p>' : '';
  return `${rows}<div class="arrive"><div class="t">${fmtTime(o.end)}</div><div></div><div>Arrive · ${esc(state.to?.name || '')}</div></div>${approx}${fareBlock(o.fare)}${watch}`;
}

$('#results').addEventListener('click', (e) => {
  if (e.target.closest('a, .watch-form')) return;
  if (e.target.closest('[data-watch]')) { openWatchForm(e.target.closest('.opt')); return; }
  const card = e.target.closest('.opt');
  if (!card) return;
  const i = Number(card.dataset.i);
  if (i === state.selected) return;
  state.selected = i;
  $$('.opt').forEach((c) => c.classList.toggle('sel', Number(c.dataset.i) === i));
  drawOption(state.options[i]);
});

function drawOption(o, { fit = true } = {}) {
  layers.route.clearLayers();
  if (!o) return;
  const all = [];
  for (const l of o.legs) {
    const pts = l.geometry?.points ? decodePolyline(l.geometry.points, l.geometry.precision) : l.line;
    if (!pts?.length) continue;
    all.push(...pts);
    if (l.bikeshare) {
      L.polyline(pts, { color: '#2e9b47', weight: 5, opacity: 0.9, dashArray: '10 6' }).addTo(layers.route)
        .bindTooltip('Bike Share (approximate path)', { sticky: true });
      for (const [p, label] of [[pts[0], o.bikeshare.from.name], [pts[pts.length - 1], o.bikeshare.to.name]]) {
        L.circleMarker(p, { radius: 6, color: '#fff', weight: 2, fillColor: '#2e9b47', fillOpacity: 1 }).bindTooltip(label).addTo(layers.route);
      }
    } else if (l.transit) {
      L.polyline(pts, { color: '#fff', weight: 9, opacity: 0.9 }).addTo(layers.route);
      L.polyline(pts, { color: l.color || '#0f6b5c', weight: 6, opacity: 1 }).addTo(layers.route)
        .bindTooltip(`${modeName(l.mode)} ${l.route || ''} · ${cleanHeadsign(l.headsign) || ''}`, { sticky: true });
      L.circleMarker(pts[0], { radius: 5, color: '#fff', weight: 2, fillColor: l.color || '#0f6b5c', fillOpacity: 1 })
        .bindTooltip(l.from.name).addTo(layers.route);
    } else {
      L.polyline(pts, { color: '#5e6b67', weight: 4, dashArray: '2 8', lineCap: 'round' }).addTo(layers.route);
    }
  }
  if (fit && all.length) fitTo(all, 50);
}

// refresh live predictions on the shown trip every minute when leaving now
setInterval(() => {
  if (state.from && state.to && $('#whenSel').value === 'now' && !document.hidden && currentTab === 'plan') planTrip({ quiet: true });
}, 60_000);

// ------------------------------------------------------------------ nearby departures
let nearbyAt = null;
async function loadNearby(at = nearbyAt, { quiet = false } = {}) {
  if (!at) { const c = map.getCenter(); at = { lat: c.lat, lon: c.lng }; }
  nearbyAt = at;
  loadBikeNear(at);
  const list = $('#nearbyList');
  if (!quiet) list.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div>';
  try {
    const boards = await api(`nearby?at=${at.lat.toFixed(5)},${at.lon.toFixed(5)}&radius=450`);
    $('#nearbyWhere').textContent = boards.length ? `${boards.length} stops within 450 m` : 'No departures within 450 m.';
    layers.stops.clearLayers();
    L.circle([at.lat, at.lon], { radius: 450, color: '#0f6b5c', weight: 1, fillOpacity: 0.04, interactive: false }).addTo(layers.stops);
    for (const b of boards) {
      L.circleMarker([b.lat, b.lon], { radius: 6, color: '#fff', weight: 2, fillColor: b.departures[0]?.color || '#0f6b5c', fillOpacity: 1 })
        .bindTooltip(b.name).addTo(layers.stops);
    }
    list.innerHTML = boards.map((b) => `<div class="board">
      <div class="board-h" data-lat="${b.lat}" data-lon="${b.lon}"><span>${esc(b.name)}</span><span class="muted">${b.distanceM} m</span></div>
      ${b.departures.map((d) => `<div class="dep">
        <span class="chip" style="${d.color ? `background:${esc(d.color)};color:${esc(d.textColor || '#fff')}` : ''}">${modeIcon(d.mode)}${esc(d.route || '')}</span>
        <span class="hs" title="${esc(d.headsign)}">${esc(cleanHeadsign(d.headsign))}${d.track ? ` · Plat. ${esc(d.track)}` : ''}</span>
        <span class="when"><span class="mins ${d.live ? 'live' : ''}">${d.live ? '<span class="livedot"></span>' : ''}${inLabel(d.time)}</span>
          <span class="clock">${fmtTime(d.time)}${d.live && d.delayMin ? ` · ${d.delayMin > 0 ? '+' : ''}${d.delayMin}` : d.live ? '' : ' sched'}</span></span>
      </div>`).join('')}
    </div>`).join('') || '<div class="empty">Nothing departing nearby in the next while. Try zooming the map elsewhere and tap "Map centre".</div>';
  } catch (e) {
    if (!quiet) list.innerHTML = `<div class="err">${esc(e.message)}</div>`;
  }
}
$('#nearbyList').addEventListener('click', (e) => {
  const h = e.target.closest('.board-h');
  if (h) map.setView([Number(h.dataset.lat), Number(h.dataset.lon)], 17);
});
$('#nearbyMap').addEventListener('click', () => loadNearby(null));
$('#nearbyMe').addEventListener('click', async () => {
  try { const p = await getPosition(); map.setView([p.lat, p.lon], 16); loadNearby(p); } catch (e) { toast(e.message); }
});
setInterval(() => { if (currentTab === 'nearby' && !document.hidden && nearbyAt) loadNearby(nearbyAt, { quiet: true }); }, 30_000);

// ------------------------------------------------------------------ airport
let flightDir = 'departures';
let airportData = null;
async function loadAirport() {
  try {
    airportData = await api('airport');
    renderUp();
    renderFlights();
  } catch (e) {
    $('#flightList').innerHTML = `<div class="err">${esc(e.message)}</div>`;
  }
}
function renderUp() {
  const up = airportData.upExpress;
  const card = (title, list) => `<div class="up-card"><h4>${title}</h4><div class="times">${
    (list = list.filter((d) => Date.parse(d.time) > Date.now() - 60000)).length ? list.slice(0, 4).map((d) => `<span>${d.live ? '<span class="livedot"></span>' : ''}${fmtTime(d.time)}</span>`).join('') : '<span class="muted">No departures</span>'
  }</div></div>`;
  $('#upBoard').innerHTML = card('Union → Pearson', up.fromUnion) + card('Pearson → Union', up.fromPearson)
    + (state.status?.features.goLive ? '' : '<p class="muted small" style="grid-column:1/-1;margin:0">Scheduled times. Add a free Metrolinx key for live UP/GO times.</p>');
}
function flightStatus(f) {
  const s = (f.status || '').toLowerCase();
  if (/cancel/.test(s)) return '<span class="status bad">Cancelled</span>';
  if (/divert/.test(s)) return '<span class="status bad">Diverted</span>';
  if (f.delayMin >= 15) return `<span class="status delay">+${f.delayMin} min</span>`;
  if (/arrived|landed/.test(s)) return '<span class="status good">Landed</span>';
  if (/departed|enroute|en route/.test(s)) return '<span class="status good">Departed</span>';
  if (/board/.test(s)) return '<span class="status good">Boarding</span>';
  return `<span class="status">${esc(f.status === 'Expected' || !f.status ? 'On time' : f.status)}</span>`;
}
function renderFlights() {
  const el = $('#flightList');
  if (!airportData.flightsEnabled) {
    el.innerHTML = `<div class="setup"><b>Live Pearson flights are off.</b><br>
      Get a free AeroDataBox key on RapidAPI and add <code>AERODATABOX_RAPIDAPI_KEY=…</code> to <code>.env</code>, then restart the server.</div>`;
    return;
  }
  if (airportData.flightsError) { el.innerHTML = `<div class="err">Flight data unavailable: ${esc(airportData.flightsError)}</div>`; return; }
  const q = $('#flightSearch').value.trim().toLowerCase();
  const list = (airportData.flights?.[flightDir] || [])
    .filter((f) => !q || [f.number, f.airline, f.city, f.airport].join(' ').toLowerCase().includes(q))
    .filter((f) => Date.parse(f.estimated || f.scheduled) > Date.now() - 45 * 60000)
    .slice(0, 60);
  $('#flightUpdated').textContent = airportData.flights?.updated ? `· updated ${fmtTime(airportData.flights.updated)}` : '';
  el.innerHTML = list.map((f) => {
    const changed = f.estimated && f.scheduled && Math.abs(Date.parse(f.estimated) - Date.parse(f.scheduled)) >= 5 * 60000;
    return `<div class="flight">
      <div class="ft">${fmtTime(f.estimated || f.scheduled)}${changed ? `<s>${fmtTime(f.scheduled)}</s>` : ''}</div>
      <div class="fc"><b>${esc(f.city || f.airport || '')}</b><span>${esc(f.number)} · ${esc(f.airline || '')}${f.terminal ? ` · T${esc(f.terminal)}` : ''}${f.gate ? ` · Gate ${esc(f.gate)}` : ''}${f.baggage ? ` · Belt ${esc(f.baggage)}` : ''}</span></div>
      ${flightStatus(f)}
    </div>`;
  }).join('') || '<div class="empty">No matching flights.</div>';
}
$('#flightDir').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  flightDir = b.dataset.dir;
  $$('#flightDir button').forEach((x) => x.classList.toggle('active', x === b));
  renderFlights();
});
$('#flightSearch').addEventListener('input', () => airportData && renderFlights());
$$('[data-goto]').forEach((b) => b.addEventListener('click', () => {
  const t = { T1: { name: 'Pearson Airport Terminal 1', lat: 43.6812, lon: -79.6124 }, T3: { name: 'Pearson Airport Terminal 3', lat: 43.6890, lon: -79.6195 } }[b.dataset.goto];
  showTab('plan');
  setPlace('to', t);
  if (!state.from) { toast('Now choose where you are starting from.'); $('#fromInput').focus(); }
}));

// ------------------------------------------------------------------ alerts + weather
let alertData = null;
async function loadAlerts() {
  try {
    alertData = await api('alerts');
    const now = alertData.transit.filter((a) => a.activeNow).length + alertData.weather.length;
    const c = $('#alertCount');
    c.hidden = !now;
    c.textContent = now;
    renderAlerts();
  } catch (e) {
    $('#alertList').innerHTML = `<div class="err">${esc(e.message)}</div>`;
  }
}
function renderAccess() {
  const acc = alertData?.accessibility || [];
  const c = $('#accCount');
  const elev = acc.filter((a) => a.kind === 'elevator').length;
  c.hidden = !elev;
  c.textContent = `${elev} elevator${elev === 1 ? '' : 's'}`;
  const sorted = [...acc].sort((a, b) => (a.kind === 'elevator' ? 0 : 1) - (b.kind === 'elevator' ? 0 : 1) || (a.station || '').localeCompare(b.station || ''));
  $('#accList').innerHTML = sorted.map((a) => `<div class="alert-card ${a.kind === 'elevator' ? '' : 'planned'}">
      <div class="src">${accessIcon} TTC · ${esc(a.kind)}${a.station ? ` · ${esc(a.station)}` : ''}</div><p>${esc(a.header)}</p></div>`).join('')
    || '<p class="muted small">All TTC elevators and escalators are working.</p>';
}

function renderAlerts() {
  if (!alertData) return;
  renderAccess();
  const q = $('#alertSearch').value.trim().toLowerCase();
  const list = alertData.transit.filter((a) => !q || `${a.header} ${a.description} ${a.routes.join(' ')}`.toLowerCase().includes(q));
  $('#alertList').innerHTML = list.map((a) => `<div class="alert-card ${a.activeNow ? '' : 'planned'}">
      <div class="src">${esc(a.source)}${a.routes.length ? ` · Route ${esc(a.routes.slice(0, 4).join(', '))}` : ''}${a.activeNow ? '' : ' · upcoming'}</div>
      <p>${esc(a.header)}</p>
      ${a.description && a.description !== a.header ? `<details><summary>Details</summary>${esc(a.description)}</details>` : ''}
    </div>`).join('') || '<div class="empty">No service alerts match.</div>';
}
$('#alertSearch').addEventListener('input', renderAlerts);

async function loadWeather() {
  try {
    const wx = await api('weather');
    state.weather = wx;
    const c = wx.current;
    if (c) {
      $('#wxTemp').textContent = `${Math.round(c.temperature)}°`;
      $('#wxCond').textContent = `${c.condition || ''}${c.feelsLike != null && Math.round(c.feelsLike) !== Math.round(c.temperature) ? ` · feels ${Math.round(c.feelsLike)}°` : ''}`;
    }
    const banner = $('#wxBanner');
    const top = wx.alerts[0];
    banner.hidden = !top;
    if (top) {
      banner.className = `banner ${top.severity === 'severe' ? 'severe' : ''}`;
      banner.innerHTML = `<b>${esc(top.name)}</b>${wx.alerts.length > 1 ? ` (+${wx.alerts.length - 1} more)` : ''}. Tap Alerts for details.`;
    }
    $('#wxDetail').innerHTML = `
      ${c ? `<div class="wx-now">${c.icon ? `<img src="${esc(c.icon)}" alt="">` : ''}
        <div><div class="big">${Math.round(c.temperature)}°C</div><div class="muted">${esc(c.condition)}</div></div>
        <div class="small muted" style="margin-left:auto;text-align:right">Feels like ${Math.round(c.feelsLike)}°<br>Wind ${esc(c.windDir || '')} ${c.windKmh ?? '–'} km/h${c.gustKmh ? `, gusts ${c.gustKmh}` : ''}<br>Humidity ${c.humidity ?? '–'}%</div></div>` : ''}
      ${wx.alerts.map((a) => `<div class="alert-card wx ${a.severity}"><div class="src">Environment Canada · ${esc(a.type || 'alert')}</div><p><b>${esc(a.name)}</b>${a.area ? ` · ${esc(a.area)}` : ''}</p>${a.text ? `<details><summary>Details</summary>${esc(a.text)}</details>` : ''}</div>`).join('')
        || '<p class="muted small">No weather alerts for the Toronto area right now.</p>'}
      ${c?.forecasts?.length ? `<ul class="fc-list">${c.forecasts.map((f) => `<li><b>${esc(f.period)}</b> ${esc(f.summary)}</li>`).join('')}</ul>` : ''}
      ${c ? `<p class="small muted">Source: <a href="${esc(c.url)}" target="_blank" rel="noopener">Environment Canada</a></p>` : ''}`;
  } catch (e) { /* weather is optional */ }
}
$('#wxChip').addEventListener('click', () => showTab('alerts'));

// ------------------------------------------------------------------ Bike Share Toronto
async function loadBikeNear(at) {
  const box = $('#bikeNear');
  try {
    const list = await api(`bikeshare/near?at=${at.lat.toFixed(5)},${at.lon.toFixed(5)}`);
    box.innerHTML = list.length ? `<div class="bs-card"><div class="board-h"><span>${modeIcon('BIKE')} Bike Share Toronto</span><span class="muted">live</span></div>
      ${list.map((s) => `<div class="bs-row"><span>${esc(s.name)}<span class="muted small"> · ${s.distanceM} m</span></span>
        <span class="n"><b>${s.bikes}</b><span>bikes${s.ebikes ? ` · ${s.ebikes} e` : ''}</span></span>
        <span class="n"><b>${s.docks}</b><span>docks</span></span></div>`).join('')}</div>` : '';
  } catch { box.innerHTML = ''; }
}

let bikeSeq = 0;
async function loadBikeLayer(e) {
  layers.bikes.clearLayers();
  if (!$('#bikeToggle').checked) return;
  if (map.getZoom() < 14) { if (e?.type === 'change') toast('Zoom in to see Bike Share stations'); return; }
  const my = ++bikeSeq;
  const b = map.getBounds().pad(0.1);
  try {
    const list = await api(`bikeshare?bbox=${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`);
    if (my !== bikeSeq) return;
    layers.bikes.clearLayers();
    for (const s of list) {
      const color = s.bikes === 0 ? '#9aa3a0' : s.bikes < 3 ? '#d97706' : '#2e9b47';
      L.marker([s.lat, s.lon], {
        icon: L.divIcon({ className: '', html: `<div class="bs-pin" style="background:${color};width:22px;height:22px">${s.bikes}</div>`, iconSize: [22, 22] }),
        keyboard: false, zIndexOffset: -100,
      }).bindTooltip(`${esc(s.name)}<br>${s.bikes} bikes${s.ebikes ? ` (${s.ebikes} e-bikes)` : ''} · ${s.docks} docks free`).addTo(layers.bikes);
    }
  } catch { /* next move */ }
}
$('#bikeToggle').addEventListener('change', loadBikeLayer);
map.on('moveend', () => { if ($('#bikeToggle').checked) { clearTimeout(loadBikeLayer.t); loadBikeLayer.t = setTimeout(() => loadBikeLayer(), 400); } });
setInterval(() => { if (!document.hidden && $('#bikeToggle').checked) loadBikeLayer(); }, 60_000);

// ------------------------------------------------------------------ live vehicles
const ROUTE_COLORS = { 1: '#d5c82b', 2: '#00923f', 4: '#a8518a' };
function vehicleColor(route) {
  if (!route) return '#7a7a7a';
  if (ROUTE_COLORS[route]) return ROUTE_COLORS[route];
  const n = Number(route);
  if ((n >= 501 && n <= 512) || (n >= 301 && n <= 310)) return '#b8141b'; // streetcars
  if (n >= 900) return '#1f6fb2'; // express buses
  return '#da251d';
}
let vehSeq = 0;
async function loadVehicles() {
  if (!$('#vehToggle').checked || map.getZoom() < 13) { layers.vehicles.clearLayers(); return; }
  const my = ++vehSeq;
  const b = map.getBounds().pad(0.15);
  try {
    const res = await api(`vehicles?bbox=${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`);
    if (my !== vehSeq) return;
    layers.vehicles.clearLayers();
    const big = map.getZoom() >= 15;
    for (const v of res.ttc) {
      const color = vehicleColor(v.route);
      const tip = `TTC ${v.route ? `route ${v.route}` : 'vehicle'} · #${v.id}${v.occupancy ? ` · ${v.occupancy.replace(/_/g, ' ').toLowerCase()}` : ''}`;
      if (big && v.route) {
        L.marker([v.lat, v.lon], {
          icon: L.divIcon({ className: '', html: `<div class="veh-label" style="background:${color};width:${10 + v.route.length * 7}px;height:18px">${esc(v.route)}</div>`, iconSize: [10 + v.route.length * 7, 18] }),
          keyboard: false,
        }).bindTooltip(tip).addTo(layers.vehicles);
      } else {
        L.circleMarker([v.lat, v.lon], { radius: 4, color: '#fff', weight: 1.5, fillColor: color, fillOpacity: 1 }).bindTooltip(tip).addTo(layers.vehicles);
      }
    }
    for (const v of res.go) {
      L.circleMarker([v.lat, v.lon], { radius: 6, color: '#fff', weight: 2, fillColor: '#3d8b37', fillOpacity: 1 })
        .bindTooltip(`GO ${v.route || ''} · #${esc(v.id)}`).addTo(layers.vehicles);
    }
  } catch { /* try again next tick */ }
}
$('#vehToggle').addEventListener('change', loadVehicles);
map.on('moveend', () => { clearTimeout(loadVehicles.t); loadVehicles.t = setTimeout(loadVehicles, 300); });
setInterval(() => { if (!document.hidden) loadVehicles(); }, 15_000);

// ------------------------------------------------------------------ next way home
const home = { pos: null, option: null, loading: false, refreshes: 0, error: null, timer: null };

async function geoPermission() {
  try { return (await navigator.permissions.query({ name: 'geolocation' })).state; } catch { return 'prompt'; }
}

async function loadHome({ userAsked = false } = {}) {
  const saved = store.get('saved', {}).Home;
  if (!saved || home.loading) return;
  if (userAsked) home.refreshes = 0;
  home.loading = true;
  home.error = null;
  renderHome();
  try {
    try { home.pos = await getPosition(); } catch (e) {
      if (!state.from) throw new Error('Allow location (or set a start point) to plan your way home.');
      home.pos = { lat: state.from.lat, lon: state.from.lon, fallback: true };
    }
    if (Math.hypot(home.pos.lat - saved.lat, (home.pos.lon - saved.lon) * 0.72) < 0.0025) {
      home.option = null;
      home.error = "You're already home 🏠";
      return;
    }
    const q = new URLSearchParams({
      from: `${home.pos.lat},${home.pos.lon}`, to: `${saved.lat},${saved.lon}`,
      pref: $('#prefSel').value, accessible: $('#accessible').checked, rider: $('#riderSel').value,
    });
    const res = await api(`plan?${q}`);
    home.option = res.options.find((o) => o.kind === 'transit') || res.options[0] || null;
    if (!home.option) home.error = 'No route home found right now.';
  } catch (e) {
    home.error = e.message;
  } finally {
    home.loading = false;
    renderHome();
  }
}

function renderHome() {
  const box = $('#homeCard');
  const saved = store.get('saved', {}).Home;
  if (!saved) { box.innerHTML = ''; return; }
  const o = home.option;
  let body;
  if (home.loading && !o) body = '<p class="muted small">Finding your next way home…</p>';
  else if (home.error && !o) body = `<p class="muted small">${esc(home.error)}</p>`;
  else if (!o) body = '<p class="muted small">Live departures from where you are to Home, ranked for weather and delays.</p>';
  else {
    const first = o.legs.find((l) => l.transit);
    const leaveMins = minsUntil(o.start);
    const chips = o.legs.map(legChip).filter(Boolean).join('<span class="chev">›</span>');
    body = `<div class="home-main">
        <div class="home-leave ${first?.live ? 'live' : ''}">${first?.live ? '<span class="livedot"></span>' : ''}${leaveMins <= 0 ? 'Leave now' : `Leave in ${durLabel(leaveMins)}`}</div>
        <div class="home-arrive">Home ${fmtTime(o.end)}${o.fare ? ` · ${fareText(o.fare)}` : ''}</div>
      </div>
      <div class="muted small">${first ? `${esc(modeName(first.mode))} ${esc(first.route || '')} at ${fmtTime(first.live?.time || first.start)} from ${esc(first.from.name)}${first.live ? ` · ${delayLabel(first.live.delayMin)}` : ' · scheduled'}` : esc(o.kind)}</div>
      <div class="chips">${chips}</div>
      ${(o.warnings || []).length ? `<div class="warns">${o.warnings.map((w) => `<div>${esc(w)}</div>`).join('')}</div>` : ''}
      ${home.pos?.fallback ? '<p class="muted small" style="margin:6px 0 0">From your start point (location not available).</p>' : ''}`;
  }
  box.innerHTML = `<div class="home-card">
    <div class="home-h"><b>🏠 Next way home</b>
      <span>${o ? '<button class="linkbtn plain" type="button" data-home="details">Details</button>' : ''}
      <button class="ghost small-btn" type="button" data-home="go">${o || home.error ? '↻' : 'Show'}</button></span></div>
    ${body}</div>`;
}

$('#homeCard').addEventListener('click', (e) => {
  const act = e.target.closest('[data-home]')?.dataset.home;
  if (act === 'go') loadHome({ userAsked: true });
  if (act === 'details' && home.pos) {
    const saved = store.get('saved', {}).Home;
    state.from = null; state.to = null;
    setPlace('from', { lat: home.pos.lat, lon: home.pos.lon, name: 'My location' }, { fit: false });
    setPlace('to', saved);
  }
});

// Keep it fresh while visible, but stop after ~30 min without the user touching it (saves routing quota).
setInterval(() => {
  if (!home.option || document.hidden || currentTab !== 'plan' || home.refreshes >= 15) return;
  home.refreshes++;
  loadHome();
}, 120_000);

// ------------------------------------------------------------------ push notifications
const push = {
  supported: 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window,
  reg: null,
  sub: null, // browser PushSubscription
  me: null,  // server view: { id, prefs, watches }
};
const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function b64ToBytes(b64) {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}
async function pushPost(path, body = {}) {
  const res = await fetch(`/api/push/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: push.sub?.endpoint, ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status });
  return data;
}

async function initPush() {
  if (!push.supported) return renderNotify();
  try {
    push.reg = await navigator.serviceWorker.register('/sw.js');
    push.sub = await push.reg.pushManager.getSubscription();
    if (push.sub) {
      try { push.me = await pushPost('me'); } catch (e) {
        // server forgot us (e.g. data reset): re-register with the same browser subscription
        if (e.status === 404) push.me = await pushPost('subscribe', { subscription: push.sub.toJSON() });
      }
    }
  } catch (e) { console.warn('push init failed', e); }
  renderNotify();
}

/** Ask permission + subscribe. Returns true when notifications are on. */
async function enablePush() {
  if (!push.supported) { toast('This browser does not support notifications.'); return false; }
  if (isIos && !isStandalone) { toast('On iPhone: tap Share → "Add to Home Screen", open Toronto Go from there, then turn on notifications.', 7000); return false; }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') { toast('Notifications were blocked. Allow them in your browser settings for this site.', 5000); return false; }
  try {
    push.reg ||= await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    const { publicKey } = await api('push/key');
    push.sub = await push.reg.pushManager.getSubscription()
      || await push.reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
    push.me = await pushPost('subscribe', { subscription: push.sub.toJSON() });
    renderNotify();
    return true;
  } catch (e) {
    toast(`Couldn't turn on notifications: ${e.message}`, 6000);
    return false;
  }
}

async function disablePush() {
  try { await pushPost('unsubscribe'); } catch { /* ignore */ }
  try { await push.sub?.unsubscribe(); } catch { /* ignore */ }
  push.sub = null; push.me = null;
  renderNotify();
  toast('Notifications turned off');
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const fmtDays = (d) => (d.join() === '1,2,3,4,5' ? 'Weekdays' : d.length === 7 ? 'Every day' : d.join() === '0,6' ? 'Weekends' : d.map((x) => DAY_NAMES[x]).join(' '));
const fmt24 = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`; };

function renderNotify() {
  const box = $('#notifyBox');
  if (!box) return;
  if (!push.supported) {
    box.innerHTML = `<h4>Notifications</h4><p>${isIos ? 'On iPhone, add Toronto Go to your Home Screen (Share → Add to Home Screen) and open it from there to get alerts.' : 'This browser does not support push notifications.'}</p>`;
    return;
  }
  if (!push.me) {
    box.innerHTML = `<h4>Notifications</h4>
      <p>Get weather warnings, alerts for your routes, and "leave now" reminders for trips you watch, even when the app is closed.</p>
      <button class="primary" type="button" id="pushOn">Turn on notifications</button>`;
    $('#pushOn').onclick = enablePush;
    return;
  }
  const p = push.me.prefs;
  box.innerHTML = `<h4>Notifications <span class="on">On</span></h4>
    <label class="line"><input type="checkbox" id="pWeather" ${p.weather ? 'checked' : ''}/> Weather alerts for Toronto</label>
    <label class="line">Level
      <select id="pLevel" ${p.weather ? '' : 'disabled'}>
        <option value="severe" ${p.weatherLevel === 'severe' ? 'selected' : ''}>Warnings only</option>
        <option value="moderate" ${p.weatherLevel === 'moderate' ? 'selected' : ''}>Warnings + watches</option>
        <option value="minor" ${p.weatherLevel === 'minor' ? 'selected' : ''}>Everything (incl. statements)</option>
      </select></label>
    <label class="line">Routes <input type="text" id="pRoutes" placeholder="e.g. 1, 2, 504, 29, LW" value="${esc(p.routes.join(', '))}" /></label>
    <p class="small" style="margin-top:4px">Subway lines, bus/streetcar numbers, or GO lines (LW, LE, KI, BR, RH, ST, MI). You'll get new service alerts on these.</p>
    <div class="btns">
      <button class="primary" type="button" id="pSave">Save</button>
      <button class="ghost" type="button" id="pTest">Send test</button>
      <button class="ghost" type="button" id="pOff">Turn off</button>
    </div>
    <h3 style="margin-top:16px">Watched trips</h3>
    ${push.me.watches.length ? push.me.watches.map((w) => `<div class="watch-item">
        <div><b>${esc(w.name || w.to.name)}</b><span>${fmtDays(w.days)} · leave ${fmt24(w.leaveAt)} · remind ${w.remindMin} min before<br>${esc(w.from.name)} → ${esc(w.to.name)}</span></div>
        <button class="linkbtn" type="button" data-unwatch="${esc(w.id)}">Remove</button></div>`).join('')
      : '<p class="small">None yet. Plan a trip, open a route, and tap "Watch this trip".</p>'}`;
  $('#pWeather').onchange = (e) => { $('#pLevel').disabled = !e.target.checked; };
  $('#pSave').onclick = async () => {
    try {
      push.me = await pushPost('prefs', { prefs: { weather: $('#pWeather').checked, weatherLevel: $('#pLevel').value, routes: $('#pRoutes').value } });
      renderNotify();
      toast('Notification settings saved');
    } catch (e) { toast(e.message); }
  };
  $('#pTest').onclick = async () => {
    try { await pushPost('test'); toast('Test sent. It should appear in a few seconds.'); } catch (e) { toast(e.message); }
  };
  $('#pOff').onclick = disablePush;
  $$('[data-unwatch]', box).forEach((b) => { b.onclick = async () => {
    try { push.me = await pushPost('watch/delete', { id: b.dataset.unwatch }); renderNotify(); toast('Trip removed'); } catch (e) { toast(e.message); }
  }; });
}

function torontoHHMM(iso) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
}

function openWatchForm(card) {
  const slot = $('.watch-slot', card);
  if (slot.innerHTML) { slot.innerHTML = ''; return; }
  const o = state.options[Number(card.dataset.i)];
  const today = new Date().toLocaleDateString('en-CA', { timeZone: TZ, weekday: 'short' });
  const weekday = DAY_NAMES.indexOf(today.slice(0, 3));
  const defaults = weekday >= 1 && weekday <= 5 ? [1, 2, 3, 4, 5] : [weekday];
  slot.innerHTML = `<form class="watch-form">
    <div class="grid">
      <span>Name</span><input type="text" name="name" value="${esc(state.to?.name || '')}" maxlength="60" />
      <span>Leave at</span><input type="time" name="leaveAt" value="${torontoHHMM(o.start)}" required />
      <span>Days</span><div class="days">${DAY_NAMES.map((d, i) => `<label><input type="checkbox" name="day" value="${i}" ${defaults.includes(i) ? 'checked' : ''}/><span>${d}</span></label>`).join('')}</div>
      <span>Remind me</span><select name="remindMin">${[5, 10, 15, 20, 30].map((m) => `<option value="${m}" ${m === 10 ? 'selected' : ''}>${m} min before</option>`).join('')}</select>
    </div>
    <p class="small muted" style="margin:8px 0 0">You'll get a heads-up ~40 min before if there's a disruption, delay or bad weather, a reminder when it's time to leave, and an update if the delay changes.</p>
    <div class="btns" style="display:flex;gap:6px;margin-top:10px"><button class="primary" style="width:auto;margin:0" type="submit">Save</button><button class="ghost" type="button" data-cancel>Cancel</button></div>
  </form>`;
  const form = $('form', slot);
  $('[data-cancel]', form).onclick = () => { slot.innerHTML = ''; };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const days = fd.getAll('day').map(Number);
    if (!days.length) return toast('Pick at least one day');
    if (!push.me && !(await enablePush())) return;
    try {
      push.me = await pushPost('watch', { watch: {
        name: fd.get('name'), leaveAt: fd.get('leaveAt'), days, remindMin: Number(fd.get('remindMin')),
        from: state.from, to: state.to, pref: $('#prefSel').value, accessible: $('#accessible').checked,
      } });
      slot.innerHTML = '';
      renderNotify();
      toast(`Watching "${fd.get('name') || state.to.name}". Manage it in the Alerts tab.`);
    } catch (err) { toast(err.message); }
  };
}

// ------------------------------------------------------------------ tabs + boot
let currentTab = 'plan';
function showTab(name) {
  currentTab = name;
  $$('.tab').forEach((t) => { const on = t.dataset.tab === name; t.classList.toggle('active', on); t.setAttribute('aria-selected', on); });
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
  layers.stops.clearLayers();
  if (name === 'nearby') loadNearby(nearbyAt || (state.from && { lat: state.from.lat, lon: state.from.lon }));
  if (name === 'airport') loadAirport();
  if (name === 'alerts') { loadAlerts(); loadWeather(); }
}
$$('.tab').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));

(async function boot() {
  renderSaved();
  try { state.status = await api('status'); } catch { /* server down? the calls below will show errors */ }
  loadWeather();
  loadAlerts();
  loadVehicles();
  setInterval(() => { if (!document.hidden) { loadWeather(); loadAlerts(); } }, 5 * 60_000);
  initPush();
  const tab = new URLSearchParams(location.search).get('tab'); // read before setPlace rewrites the URL
  const u = loadUrl();
  if (u.from) setPlace('from', u.from, { fit: false });
  if (u.to) setPlace('to', u.to);
  if (['nearby', 'airport', 'alerts'].includes(tab)) showTab(tab);
  // "Next way home": load straight away from the home-screen shortcut, or on a plain visit
  // when location is already allowed (never pop a permission prompt unasked).
  renderHome();
  const fromShortcut = new URLSearchParams(location.search).get('go') === 'home';
  if (store.get('saved', {}).Home && !u.from && !u.to && !tab) {
    if (fromShortcut || (await geoPermission()) === 'granted') loadHome({ userAsked: true });
  }
})();
