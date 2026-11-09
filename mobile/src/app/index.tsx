import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import TransitMap from '@/components/map/transit-map';
import { useBikeLayer, useVehicleLayer } from '@/components/map/layers';
import type { LatLon, MapLine, MapMarker, MapViewport } from '@/components/map/types';
import { OptionCard } from '@/components/option-card';
import { PlaceInput } from '@/components/place-input';
import { Card, IconButton, LegChip, LiveDot, Note, Pill, RADIUS, SectionTitle, Segmented, SPACE, SwitchRow, T, page } from '@/components/ui';
import { WeatherBanner, WeatherChip } from '@/components/weather-chip';
import { WhenPicker, type WhenMode } from '@/components/when-picker';
import { api } from '@/lib/api';
import { decodePolyline, delayText, fareText, fmtTime, leaveLabel, modeName } from '@/lib/format';
import { modeIconName } from '@/lib/icons';
import { getLocationIfAllowed, getMyLocation, hasLocationPermission } from '@/lib/location';
import { useSettings, type Pref, type Rider } from '@/lib/settings';
import { parsePlaceParam, shareTrip } from '@/lib/share';
import { useStored, type SavedPlaces } from '@/lib/storage';
import { useColors } from '@/lib/theme';
import type { Option, Place } from '@/lib/types';

type TripOpts = { pref: Pref; rider: Rider; accessible: boolean; coach: boolean };
const PREF_LABEL: Record<Pref, string> = { balanced: 'Best', fastest: 'Fastest', fewer_transfers: 'Fewer transfers', less_walking: 'Less walking' };
const RIDER_LABEL: Record<Rider, string> = { adult: 'Adult', youth: 'Youth', senior: 'Senior', child: 'Child' };

export default function PlanScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const settings = useSettings();
  const params = useLocalSearchParams<{ toLat?: string; toLon?: string; toName?: string; from?: string; to?: string }>();

  const [from, setFrom] = useState<Place | null>(null);
  const [to, setTo] = useState<Place | null>(null);
  // Trip options start from Settings; changes here apply to this session only.
  const [tripOverride, setTripOverride] = useState<Partial<TripOpts>>({});
  const opts: TripOpts = { pref: settings.pref, rider: settings.rider, accessible: settings.accessible, coach: settings.coach, ...tripOverride };
  const { pref, rider, accessible, coach } = opts;
  const setOpt = <K extends keyof TripOpts>(k: K, v: TripOpts[K]) => setTripOverride((o) => ({ ...o, [k]: v }));
  const [optsOpen, setOptsOpen] = useState(false);

  const [whenMode, setWhenMode] = useState<WhenMode>('now');
  const [whenDate, setWhenDate] = useState<Date | null>(null);
  const [saved, setSaved] = useStored<SavedPlaces>('saved', {});
  const [recent, setRecent] = useStored<Place[]>('recent', []);

  const [selected, setSelected] = useState(0);
  const [pin, setPin] = useState<{ lat: number; lon: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [myPos, setMyPos] = useState<{ lat: number; lon: number } | null>(null);
  const [view, setView] = useState<MapViewport | null>(null);
  // Map layers start from Settings; the map buttons toggle them for now.
  const [layerOverride, setLayerOverride] = useState<{ vehicles?: boolean; bikes?: boolean }>({});
  const showVehicles = layerOverride.vehicles ?? settings.mapVehicles;
  const showBikes = layerOverride.bikes ?? settings.mapBikes;
  const vehicleLayer = useVehicleLayer(showVehicles, view);
  const bikeLayer = useBikeLayer(showBikes, view);
  useEffect(() => { getLocationIfAllowed().then(setMyPos); }, []);

  // "Route me to Pearson" etc. from other tabs (adjust state while rendering, no effect needed)
  // and shared trip links (?from=lat,lon,name&to=lat,lon,name), on web and when a link opens the app
  const paramKey = [params.toLat, params.toLon, params.toName, params.from, params.to].join('|');
  const [seenParam, setSeenParam] = useState('');
  if (paramKey !== seenParam && paramKey.replace(/\|/g, '')) {
    setSeenParam(paramKey);
    if (params.toLat && params.toLon) setTo({ name: params.toName || 'Destination', lat: Number(params.toLat), lon: Number(params.toLon) });
    const f = parsePlaceParam(params.from);
    const t = parsePlaceParam(params.to);
    if (f) setFrom(f);
    if (t) setTo(t);
  }

  // Results belong to a "trip key"; while the key on screen differs from the result's key, we're loading.
  const tripKey = from && to ? JSON.stringify([from.lat, from.lon, to.lat, to.lon, pref, rider, accessible, coach, whenMode, whenDate?.getTime() ?? 0]) : '';
  const [tick, setTick] = useState(0); // bump to refresh live times
  const [result, setResult] = useState<{ key: string; options: Option[]; notes: string[]; error: string | null; at: number }>(
    { key: '', options: [], notes: [], error: null, at: 0 });
  const latest = useRef({ from, to, pref, rider, accessible, coach, whenMode, whenDate, recent });
  useEffect(() => { latest.current = { from, to, pref, rider, accessible, coach, whenMode, whenDate, recent }; });

  useEffect(() => {
    if (!tripKey) return;
    let alive = true;
    const t = latest.current;
    api.plan({
      from: t.from!, to: t.to!, pref: t.pref, rider: t.rider, accessible: t.accessible, coach: t.coach,
      time: t.whenMode === 'now' ? null : t.whenDate, arriveBy: t.whenMode === 'arrive',
    }).then(
      (res) => {
        if (!alive) return;
        setResult({ key: tripKey, options: res.options, notes: res.weather?.impact?.notes ?? [], error: null, at: Date.now() });
        setRecent([t.to!, ...t.recent.filter((r) => r.name !== t.to!.name)].slice(0, 4));
      },
      (e: Error) => {
        // a failed background refresh keeps the routes already on screen
        if (alive) setResult((r) => (r.key === tripKey && r.options.length ? r : { key: tripKey, options: [], notes: [], error: e.message, at: Date.now() }));
      },
    );
    return () => { alive = false; };
  }, [tripKey, tick, setRecent]);

  useEffect(() => {
    if (!tripKey || whenMode !== 'now' || !settings.autoRefresh) return; // live refresh only matters when leaving now
    const t = setInterval(() => setTick((x) => x + 1), 60_000);
    return () => clearInterval(t);
  }, [tripKey, whenMode, settings.autoRefresh]);

  const fresh = result.key === tripKey;
  const loading = Boolean(tripKey) && !fresh;
  // Settings → "Also suggest" hides the ways the rider doesn't want.
  const { showBikeShare, showCycling, showDriving } = settings;
  const options = useMemo(() => (fresh ? result.options : []).filter((o) =>
    o.kind === 'bikeshare' ? showBikeShare : o.kind === 'bike' ? showCycling : o.kind === 'car' ? showDriving : true),
  [fresh, result.options, showBikeShare, showCycling, showDriving]);
  const notes = fresh ? result.notes : [];
  const error = fresh ? result.error : null;

  // new trip -> select the first (recommended) option
  const [seenKey, setSeenKey] = useState('');
  if (fresh && result.key !== seenKey) {
    setSeenKey(result.key);
    setSelected(0);
  }

  const flash = (m: string) => { setMessage(m); setTimeout(() => setMessage(null), 3500); };

  const useMyLocation = async () => {
    try {
      const p = await getMyLocation();
      let name = 'My location';
      try { name = (await api.reverse(p)).name || name; } catch { /* fine */ }
      setFrom({ ...p, name });
    } catch (e) { flash((e as Error).message); }
  };

  const swap = () => { const f = from; setFrom(to); setTo(f); };

  const choosePin = async (role: 'from' | 'to') => {
    if (!pin) return;
    let name = 'Pinned location';
    try { name = (await api.reverse(pin)).name || name; } catch { /* fine */ }
    (role === 'from' ? setFrom : setTo)({ ...pin, name });
    setPin(null);
  };

  const saveAs = (label: 'Home' | 'Work') => {
    const p = to || from;
    if (!p) return flash(`Choose a place first, then tap “Set ${label}”.`);
    setSaved({ ...saved, [label]: p });
    flash(`${label} saved: ${p.name}`);
  };

  const share = async () => {
    if (!from || !to) return;
    const r = await shareTrip(from, to);
    if (r === 'copied') flash('Trip link copied. Paste it anywhere to share.');
    else if (r === 'failed') flash('Couldn’t open sharing on this device.');
  };

  // ---- map content for the selected option
  const current = options[selected];
  const { lines, markers, fit } = useMemo(() => {
    const ls: MapLine[] = [];
    const ms: MapMarker[] = [];
    const pts: LatLon[] = [];
    current?.legs.forEach((l, i) => {
      const p = l.geometry?.points ? decodePolyline(l.geometry.points, l.geometry.precision) : l.line;
      if (!p?.length) return;
      pts.push(...p);
      if (l.bikeshare) {
        ls.push({ id: `l${i}`, points: p, color: c.bike, dashed: true, width: 5 });
        ms.push({ id: `b${i}`, lat: p[0][0], lon: p[0][1], color: c.bike, icon: 'bike', title: l.from.name });
      } else if (l.transit) {
        ls.push({ id: `l${i}`, points: p, color: l.color || c.brand, width: 6 });
        // where you board: the vehicle you'll take, with its route number
        ms.push({ id: `s${i}`, lat: p[0][0], lon: p[0][1], color: l.color || c.brand, icon: modeIconName(l.mode), label: l.route ?? undefined, title: l.from.name });
      } else ls.push({ id: `l${i}`, points: p, color: '#6b7773', dashed: true, width: 4 });
    });
    if (from) ms.push({ id: 'from', lat: from.lat, lon: from.lon, color: c.from, icon: 'location', size: 28, title: from.name });
    if (to) ms.push({ id: 'to', lat: to.lat, lon: to.lon, color: c.to, icon: 'flag', style: 'pin', title: to.name });
    if (pin) ms.push({ id: 'pin', lat: pin.lat, lon: pin.lon, color: '#1f5fbf', icon: 'plus', style: 'pin', title: 'Pinned' });
    const f: LatLon[] = pts.length ? pts : [from, to].filter(Boolean).map((p) => [p!.lat, p!.lon] as LatLon);
    // live layers go underneath the trip markers
    return { lines: ls, markers: [...bikeLayer.markers, ...vehicleLayer.markers, ...ms], fit: f };
  }, [current, from, to, pin, c, bikeLayer.markers, vehicleLayer.markers]);
  const fitKey = `${selected}|${options[selected]?.start ?? ''}|${from?.lat},${to?.lat}`;

  const quick: Place[] = [
    ...(['Home', 'Work'] as const).filter((k) => saved[k]).map((k) => ({ ...saved[k]!, type: 'SAVED', detail: k })),
    ...recent.map((r) => ({ ...r, type: 'SAVED', detail: 'Recent' })),
  ];
  const zoomHint = vehicleLayer.needsZoom || bikeLayer.needsZoom;
  const optsSummary = [PREF_LABEL[pref], RIDER_LABEL[rider], accessible && 'Step-free', coach && 'Coaches'].filter(Boolean).join(' · ');

  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      <View style={styles.map}>
        <TransitMap lines={lines} markers={markers} fit={fit} fitKey={fitKey} onLongPress={(lat, lon) => setPin({ lat, lon })} onViewChange={setView} />
        <View style={[styles.mapLeft, { top: insets.top + SPACE.sm }]}><WeatherChip /></View>
        <View style={[styles.mapRight, { top: insets.top + SPACE.sm }]}>
          <IconButton icon="bus" label={showVehicles ? 'Hide live vehicles' : 'Show live vehicles'} active={showVehicles}
            onPress={() => setLayerOverride((o) => ({ ...o, vehicles: !showVehicles }))} />
          <IconButton icon="bike" label={showBikes ? 'Hide Bike Share stations' : 'Show Bike Share stations'} active={showBikes}
            onPress={() => setLayerOverride((o) => ({ ...o, bikes: !showBikes }))} />
        </View>
        {zoomHint && !pin ? (
          <View style={[styles.toast, { backgroundColor: c.panel }]} pointerEvents="none">
            <T variant="caption" muted>Zoom in to see {vehicleLayer.needsZoom ? 'live vehicles' : 'Bike Share stations'}</T>
          </View>
        ) : null}
        {pin && (
          <View style={[styles.pinBar, { backgroundColor: c.panel, borderColor: c.line }]}>
            <View style={styles.between}>
              <T variant="small" bold>Pinned location</T>
              <IconButton icon="close" label="Close" size={30} onPress={() => setPin(null)} />
            </View>
            <View style={styles.row}>
              <Pill icon="location" label="Start here" onPress={() => choosePin('from')} />
              <Pill icon="flag" label="Go here" onPress={() => choosePin('to')} />
              <Pill icon="bus" label="Departures" onPress={() => { router.navigate({ pathname: '/nearby', params: { lat: String(pin.lat), lon: String(pin.lon) } }); setPin(null); }} />
            </View>
          </View>
        )}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={{ backgroundColor: c.panel }} contentContainerStyle={page} keyboardShouldPersistTaps="handled">
          <WeatherBanner />
          <HomeCard home={saved.Home} fallback={from} pref={pref} rider={rider} accessible={accessible} onDetails={(p) => { setFrom(p); setTo(saved.Home!); }} />

          <View style={[styles.od, { borderColor: c.line, backgroundColor: c.card }]}>
            <PlaceInput role="from" value={from} onChange={setFrom} placeholder="From: address, place or stop" quick={quick} near={myPos}
              right={<IconButton icon="gps" label="Use my location" size={34} onPress={useMyLocation} />} />
            <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.line, marginLeft: 40 }} />
            <PlaceInput role="to" value={to} onChange={setTo} placeholder="To: where are you going?" quick={quick} near={from ?? myPos}
              right={<IconButton icon="swap" label="Swap start and destination" size={34} onPress={swap} />} />
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quick} keyboardShouldPersistTaps="handled">
            {(['Home', 'Work'] as const).map((k) => saved[k]
              ? <Pill key={k} icon={k === 'Home' ? 'home' : 'work'} label={k} onPress={() => setTo(saved[k]!)}
                  onLongPress={() => { const s = { ...saved }; delete s[k]; setSaved(s); flash(`${k} removed`); }} />
              : <Pill key={k} icon="plus" label={`Set ${k}`} onPress={() => saveAs(k)} />)}
            {recent.filter((r) => r.name !== saved.Home?.name && r.name !== saved.Work?.name).slice(0, 3).map((r) => (
              <Pill key={`r-${r.name}`} icon="history" label={r.name} onPress={() => setTo(r)} />
            ))}
          </ScrollView>

          <View style={{ marginTop: SPACE.md }}>
            <WhenPicker mode={whenMode} date={whenDate} onChange={(m, d) => { setWhenMode(m); setWhenDate(d); }} />
          </View>

          <Card style={{ marginTop: SPACE.md, paddingVertical: 0 }}>
            <Pressable onPress={() => setOptsOpen(!optsOpen)} accessibilityRole="button" accessibilityState={{ expanded: optsOpen }} style={styles.optsHead}>
              <Icon name="tune" size={20} color={c.brand} />
              <View style={{ flex: 1 }}>
                <T>Trip options</T>
                <T variant="small" muted numberOfLines={1}>{optsSummary}</T>
              </View>
              <Icon name={optsOpen ? 'chevronDown' : 'chevronRight'} size={20} color={c.muted} />
            </Pressable>
            {optsOpen ? (
              <View style={{ paddingBottom: SPACE.sm }}>
                <View style={{ gap: SPACE.sm }}>
                  <Segmented<Pref> value={pref} onChange={(v) => setOpt('pref', v)} options={[
                    { value: 'balanced', label: 'Best' }, { value: 'fastest', label: 'Fastest' },
                    { value: 'fewer_transfers', label: 'Transfers' }, { value: 'less_walking', label: 'Walking' },
                  ]} />
                  <Segmented<Rider> value={rider} onChange={(v) => setOpt('rider', v)} options={[
                    { value: 'adult', label: 'Adult' }, { value: 'youth', label: 'Youth' }, { value: 'senior', label: 'Senior' }, { value: 'child', label: 'Child' },
                  ]} />
                </View>
                <SwitchRow icon="wheelchair" title="Step-free / wheelchair" value={accessible} onChange={(v) => setOpt('accessible', v)} />
                <SwitchRow icon="coach" title="Intercity coaches" value={coach} onChange={(v) => setOpt('coach', v)} last />
                {Object.keys(tripOverride).length ? (
                  <T variant="small" bold color={c.brand} style={styles.reset} onPress={() => setTripOverride({})}>Back to my defaults from Settings</T>
                ) : null}
              </View>
            ) : null}
          </Card>

          {message ? <Note tone="info">{message}</Note> : null}
          {!from || !to ? (
            <Note tone="info">Search where you’re starting and going, use your location, or long-press the map.</Note>
          ) : (
            <SectionTitle right={(
              <View style={styles.row}>
                {loading ? <ActivityIndicator color={c.brand} /> : null}
                <IconButton icon="refresh" label="Refresh routes" size={36} onPress={() => setTick((x) => x + 1)} />
                <IconButton icon="share" label="Share this trip" size={36} onPress={share} />
              </View>
            )}>
              {loading ? 'Finding routes…' : options.length ? `${options.length} ${options.length === 1 ? 'route' : 'routes'} · ${fmtTime(new Date(result.at).toISOString())}` : 'Routes'}
            </SectionTitle>
          )}

          {notes.map((n) => <Note key={n}>{n}</Note>)}
          {error ? <Note tone="danger">Couldn’t plan this trip: {error}</Note> : null}
          <View style={{ gap: SPACE.sm }}>
            {options.map((o, i) => (
              <OptionCard key={`${o.kind}-${o.start}-${i}`} o={o} selected={i === selected} onPress={() => setSelected(i)} destName={to?.name ?? ''}
                watch={from && to ? { from, to, pref, accessible, onDone: flash } : undefined} />
            ))}
          </View>
          {from && to && !loading && !error && options.length === 0 ? <Note tone="info">No routes found. Try another time or place.</Note> : null}
          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/** "Next way home": best live route from where you are to Home. */
function HomeCard({ home, fallback, pref, rider, accessible, onDetails }: {
  home?: Place; fallback: Place | null; pref: string; rider: string; accessible: boolean; onDetails: (from: Place) => void;
}) {
  const c = useColors();
  const [opt, setOpt] = useState<Option | null>(null);
  const [fromP, setFromP] = useState<Place | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error' | 'home'>('idle');
  const [err, setErr] = useState('');
  const refreshes = useRef(0);

  const load = useCallback(async () => {
    if (!home) return;
    setState('loading');
    try {
      // where you are; if location isn't available, fall back to the trip's start point
      let p: Place;
      try { p = { ...(await getMyLocation()), name: 'My location' }; } catch {
        if (!fallback) throw new Error('Allow location, or set a start point, to plan your way home.');
        p = fallback;
      }
      if (Math.hypot(p.lat - home.lat, (p.lon - home.lon) * 0.72) < 0.0025) { setState('home'); return; }
      const res = await api.plan({ from: p, to: home, pref, rider, accessible });
      setFromP(p);
      setOpt(res.options.find((o) => o.kind === 'transit') ?? res.options[0] ?? null);
      setState('idle');
    } catch (e) { setErr((e as Error).message); setState('error'); }
  }, [home, fallback, pref, rider, accessible]);

  // load automatically only if location is already allowed (never prompt unasked)
  useEffect(() => { if (home) hasLocationPermission().then((ok) => { if (ok) load(); }); }, [home, load]);
  useEffect(() => {
    if (!opt) return;
    const t = setInterval(() => { if (refreshes.current++ < 15) load(); }, 120_000);
    return () => clearInterval(t);
  }, [opt, load]);

  if (!home) return null;
  const first = opt?.legs.find((l) => l.transit);
  return (
    <Card style={{ marginBottom: SPACE.md, borderColor: c.brand, backgroundColor: c.soft }}>
      <View style={styles.between}>
        <View style={styles.row}>
          <Icon name="home" size={20} color={c.brand} />
          <T variant="heading">Next way home</T>
        </View>
        <View style={styles.row}>
          {opt && fromP ? <Pill label="Details" onPress={() => onDetails(fromP)} /> : null}
          {state === 'loading' ? <ActivityIndicator color={c.brand} />
            : opt ? <IconButton icon="refresh" label="Refresh" size={34} onPress={() => { refreshes.current = 0; load(); }} />
              : <Pill label="Show" onPress={() => { refreshes.current = 0; load(); }} />}
        </View>
      </View>
      {state === 'home' ? <T variant="small" muted style={styles.homeBody}>You’re already home.</T>
        : state === 'error' && !opt ? <T variant="small" muted style={styles.homeBody}>{err}</T>
          : !opt ? <T variant="small" muted style={styles.homeBody}>Live departures from where you are to Home, ranked for weather and delays.</T>
            : (
              <View style={[styles.homeBody, { gap: SPACE.xs }]}>
                <View style={styles.between}>
                  <View style={styles.row}>
                    {first?.live ? <LiveDot /> : null}
                    <T variant="heading" color={first?.live ? c.live : c.ink}>{leaveLabel(opt.start)}</T>
                  </View>
                  <T variant="small" bold>Home {fmtTime(opt.end)}{opt.fare ? ` · ${fareText(opt.fare)}` : ''}</T>
                </View>
                {first ? (
                  <T variant="small" muted>{modeName(first.mode)} {first.route} at {fmtTime(first.live?.time || first.start)} from {first.from.name} · {first.live ? delayText(first.live.delayMin) : 'scheduled'}</T>
                ) : null}
                <View style={[styles.row, { flexWrap: 'wrap' }]}>
                  {opt.legs.filter((l) => l.transit || l.bikeshare).map((l, i) => <LegChip key={i} leg={l} />)}
                </View>
                {fromP && fromP.name !== 'My location' ? <T variant="caption" muted>From {fromP.name} (your location isn’t available).</T> : null}
              </View>
            )}
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  map: { height: '38%', minHeight: 220 },
  mapLeft: { position: 'absolute', left: SPACE.md },
  mapRight: { position: 'absolute', right: SPACE.md, gap: SPACE.sm },
  toast: { position: 'absolute', left: SPACE.md, bottom: SPACE.md, paddingHorizontal: SPACE.sm + 2, paddingVertical: SPACE.xs, borderRadius: 999 },
  pinBar: { position: 'absolute', left: SPACE.md, right: SPACE.md, bottom: SPACE.md, borderWidth: 1, borderRadius: RADIUS.card, padding: SPACE.md, gap: SPACE.sm },
  od: { borderWidth: 1, borderRadius: RADIUS.card, zIndex: 30 },
  quick: { gap: SPACE.sm, paddingTop: SPACE.md },
  optsHead: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, minHeight: 56 },
  reset: { paddingTop: SPACE.sm, alignSelf: 'flex-start' },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: SPACE.sm },
  homeBody: { marginTop: SPACE.sm },
});
