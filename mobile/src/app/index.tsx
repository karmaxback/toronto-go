import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import TransitMap from '@/components/map/transit-map';
import type { LatLon, MapLine, MapMarker } from '@/components/map/types';
import { OptionCard } from '@/components/option-card';
import { PlaceInput } from '@/components/place-input';
import { Button, Card, LegChip, LiveDot, Note, Pill, Segmented, T } from '@/components/ui';
import { WeatherChip } from '@/components/weather-chip';
import { api } from '@/lib/api';
import { decodePolyline, delayText, durLabel, fareText, fmtTime, minsUntil, modeName } from '@/lib/format';
import { getMyLocation, hasLocationPermission } from '@/lib/location';
import { useStored, type SavedPlaces } from '@/lib/storage';
import { useColors } from '@/lib/theme';
import type { Option, Place } from '@/lib/types';

type Pref = 'balanced' | 'fastest' | 'fewer_transfers' | 'less_walking';
type Rider = 'adult' | 'youth' | 'senior' | 'child';

export default function PlanScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ toLat?: string; toLon?: string; toName?: string }>();

  const [from, setFrom] = useState<Place | null>(null);
  const [to, setTo] = useState<Place | null>(null);
  const [pref, setPref] = useStored<Pref>('pref', 'balanced');
  const [rider, setRider] = useStored<Rider>('rider', 'adult');
  const [accessible, setAccessible] = useStored<boolean>('accessible', false);
  const [saved, setSaved] = useStored<SavedPlaces>('saved', {});
  const [recent, setRecent] = useStored<Place[]>('recent', []);

  const [selected, setSelected] = useState(0);
  const [pin, setPin] = useState<{ lat: number; lon: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // "Route me to Pearson" etc. from other tabs (adjust state while rendering, no effect needed)
  const paramKey = params.toLat && params.toLon ? `${params.toLat},${params.toLon},${params.toName ?? ''}` : '';
  const [seenParam, setSeenParam] = useState('');
  if (paramKey && paramKey !== seenParam) {
    setSeenParam(paramKey);
    setTo({ name: params.toName || 'Destination', lat: Number(params.toLat), lon: Number(params.toLon) });
  }

  // Results belong to a "trip key"; while the key on screen differs from the result's key, we're loading.
  const tripKey = from && to ? JSON.stringify([from.lat, from.lon, to.lat, to.lon, pref, rider, accessible]) : '';
  const [tick, setTick] = useState(0); // bump to refresh live times
  const [result, setResult] = useState<{ key: string; options: Option[]; notes: string[]; error: string | null }>(
    { key: '', options: [], notes: [], error: null });
  const latest = useRef({ from, to, pref, rider, accessible, recent });
  useEffect(() => { latest.current = { from, to, pref, rider, accessible, recent }; });

  useEffect(() => {
    if (!tripKey) return;
    let alive = true;
    const t = latest.current;
    api.plan({ from: t.from!, to: t.to!, pref: t.pref, rider: t.rider, accessible: t.accessible }).then(
      (res) => {
        if (!alive) return;
        setResult({ key: tripKey, options: res.options, notes: res.weather?.impact?.notes ?? [], error: null });
        setRecent([t.to!, ...t.recent.filter((r) => r.name !== t.to!.name)].slice(0, 4));
      },
      (e: Error) => {
        // a failed background refresh keeps the routes already on screen
        if (alive) setResult((r) => (r.key === tripKey && r.options.length ? r : { key: tripKey, options: [], notes: [], error: e.message }));
      },
    );
    return () => { alive = false; };
  }, [tripKey, tick, setRecent]);

  useEffect(() => {
    if (!tripKey) return;
    const t = setInterval(() => setTick((x) => x + 1), 60_000);
    return () => clearInterval(t);
  }, [tripKey]);

  const fresh = result.key === tripKey;
  const loading = Boolean(tripKey) && !fresh;
  const options = fresh ? result.options : [];
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
    if (!p) return flash(`Choose a place first, then tap "Set ${label}".`);
    setSaved({ ...saved, [label]: p });
    flash(`${label} saved: ${p.name}`);
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
      if (l.bikeshare) ls.push({ id: `l${i}`, points: p, color: c.bike, dashed: true, width: 5 });
      else if (l.transit) {
        ls.push({ id: `l${i}`, points: p, color: l.color || c.brand, width: 6 });
        ms.push({ id: `s${i}`, lat: p[0][0], lon: p[0][1], color: l.color || c.brand, size: 12, title: l.from.name });
      } else ls.push({ id: `l${i}`, points: p, color: '#6b7773', dashed: true, width: 4 });
    });
    if (from) ms.push({ id: 'from', lat: from.lat, lon: from.lon, color: c.from, size: 16, title: from.name });
    if (to) ms.push({ id: 'to', lat: to.lat, lon: to.lon, color: c.to, size: 16, shape: 'square', title: to.name });
    if (pin) ms.push({ id: 'pin', lat: pin.lat, lon: pin.lon, color: '#1f5fbf', size: 16, title: 'Pinned' });
    const f: LatLon[] = pts.length ? pts : [from, to].filter(Boolean).map((p) => [p!.lat, p!.lon] as LatLon);
    return { lines: ls, markers: ms, fit: f };
  }, [current, from, to, pin, c]);
  const fitKey = `${selected}|${options[selected]?.start ?? ''}|${from?.lat},${to?.lat}`;

  const quick: Place[] = [
    ...(['Home', 'Work'] as const).filter((k) => saved[k]).map((k) => ({ ...saved[k]!, type: 'SAVED', detail: k })),
    ...recent.map((r) => ({ ...r, type: 'SAVED', detail: 'Recent' })),
  ];

  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      <View style={styles.map}>
        <TransitMap lines={lines} markers={markers} fit={fit} fitKey={fitKey} onLongPress={(lat, lon) => setPin({ lat, lon })} />
        <View style={[styles.mapTop, { top: insets.top + 8 }]}><WeatherChip /></View>
        {pin && (
          <View style={[styles.pinBar, { backgroundColor: c.panel, borderColor: c.line }]}>
            <T bold size={13}>Pinned location</T>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <Pill label="Start here" onPress={() => choosePin('from')} />
              <Pill label="Go here" onPress={() => choosePin('to')} />
              <Pill label="✕" onPress={() => setPin(null)} />
            </View>
          </View>
        )}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={{ backgroundColor: c.panel }} contentContainerStyle={styles.panel} keyboardShouldPersistTaps="handled">
          <HomeCard home={saved.Home} pref={pref} rider={rider} accessible={accessible} onDetails={(p) => { setFrom(p); setTo(saved.Home!); }} />

          <View style={[styles.od, { borderColor: c.line, backgroundColor: c.card }]}>
            <PlaceInput role="from" value={from} onChange={setFrom} placeholder="From: address, place or stop" quick={quick}
              right={<Pressable onPress={useMyLocation} hitSlop={8} accessibilityLabel="Use my location"><Text style={{ fontSize: 18 }}>📍</Text></Pressable>} />
            <View style={{ height: 1, backgroundColor: c.line }} />
            <PlaceInput role="to" value={to} onChange={setTo} placeholder="To: where are you going?" quick={quick}
              right={<Pressable onPress={swap} hitSlop={8} accessibilityLabel="Swap from and to"><Text style={{ fontSize: 18, color: c.muted }}>⇅</Text></Pressable>} />
          </View>

          <View style={styles.pills}>
            {(['Home', 'Work'] as const).map((k) => saved[k]
              ? <Pill key={k} label={`${k === 'Home' ? '🏠' : '💼'} ${k}`} onPress={() => setTo(saved[k]!)}
                  onLongPress={() => { const s = { ...saved }; delete s[k]; setSaved(s); flash(`${k} removed`); }} />
              : <Pill key={k} label={`+ Set ${k}`} onPress={() => saveAs(k)} />)}
          </View>

          <View style={{ marginTop: 10, gap: 8 }}>
            <Segmented<Pref> value={pref} onChange={setPref} options={[
              { value: 'balanced', label: 'Best' }, { value: 'fastest', label: 'Fastest' },
              { value: 'fewer_transfers', label: 'Fewer transfers' }, { value: 'less_walking', label: 'Less walking' },
            ]} />
            <Segmented<Rider> value={rider} onChange={setRider} options={[
              { value: 'adult', label: 'Adult' }, { value: 'youth', label: 'Youth' }, { value: 'senior', label: 'Senior' }, { value: 'child', label: 'Child' },
            ]} />
            <View style={styles.switchRow}>
              <T>♿ Step-free / wheelchair</T>
              <Switch value={accessible} onValueChange={setAccessible} trackColor={{ true: c.brand }} />
            </View>
          </View>

          {message ? <Note tone="info">{message}</Note> : null}
          {!from || !to ? (
            <Note tone="info">Type where you’re starting and going, tap 📍 for your location, or long-press the map.</Note>
          ) : (
            <Button title={loading ? 'Finding routes…' : 'Refresh routes'} onPress={() => setTick((x) => x + 1)} loading={loading} style={{ marginTop: 12 }} />
          )}

          {notes.map((n) => <Note key={n}>{n}</Note>)}
          {error ? <Note tone="danger">Couldn’t plan this trip: {error}</Note> : null}
          {options.map((o, i) => (
            <OptionCard key={`${o.kind}-${o.start}-${i}`} o={o} selected={i === selected} onPress={() => setSelected(i)} destName={to?.name ?? ''} />
          ))}
          {from && to && !loading && !error && options.length === 0 ? <Note tone="info">No routes found. Try another time or place.</Note> : null}
          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/** "Next way home": best live route from where you are to Home. */
function HomeCard({ home, pref, rider, accessible, onDetails }: {
  home?: Place; pref: string; rider: string; accessible: boolean; onDetails: (from: Place) => void;
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
      const p = await getMyLocation();
      if (Math.hypot(p.lat - home.lat, (p.lon - home.lon) * 0.72) < 0.0025) { setState('home'); return; }
      const res = await api.plan({ from: { ...p, name: 'My location' }, to: home, pref, rider, accessible });
      setFromP({ ...p, name: 'My location' });
      setOpt(res.options.find((o) => o.kind === 'transit') ?? res.options[0] ?? null);
      setState('idle');
    } catch (e) { setErr((e as Error).message); setState('error'); }
  }, [home, pref, rider, accessible]);

  // load automatically only if location is already allowed (never prompt unasked)
  useEffect(() => { if (home) hasLocationPermission().then((ok) => { if (ok) load(); }); }, [home, load]);
  useEffect(() => {
    if (!opt) return;
    const t = setInterval(() => { if (refreshes.current++ < 15) load(); }, 120_000);
    return () => clearInterval(t);
  }, [opt, load]);

  if (!home) return null;
  const first = opt?.legs.find((l) => l.transit);
  const leave = opt ? minsUntil(opt.start) : 0;
  return (
    <Card style={{ marginBottom: 12, borderColor: c.brand, backgroundColor: c.soft }}>
      <View style={styles.homeHead}>
        <T bold>🏠 Next way home</T>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {opt && fromP ? <Pill label="Details" onPress={() => onDetails(fromP)} /> : null}
          <Pill label={state === 'loading' ? '…' : opt ? '↻' : 'Show'} onPress={() => { refreshes.current = 0; load(); }} />
        </View>
      </View>
      {state === 'home' ? <T muted size={13}>You’re already home 🏠</T>
        : state === 'error' && !opt ? <T muted size={13}>{err}</T>
          : !opt ? <T muted size={13}>Live departures from where you are to Home, ranked for weather and delays.</T>
            : (
              <View style={{ marginTop: 4, gap: 3 }}>
                <View style={styles.homeHead}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {first?.live ? <LiveDot /> : null}
                    <T bold size={19} color={first?.live ? c.live : c.ink}>{leave <= 0 ? 'Leave now' : `Leave in ${durLabel(leave)}`}</T>
                  </View>
                  <T bold>Home {fmtTime(opt.end)}{opt.fare ? ` · ${fareText(opt.fare)}` : ''}</T>
                </View>
                {first ? (
                  <T muted size={12.5}>{modeName(first.mode)} {first.route} at {fmtTime(first.live?.time || first.start)} from {first.from.name} · {first.live ? delayText(first.live.delayMin) : 'scheduled'}</T>
                ) : null}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
                  {opt.legs.filter((l) => l.transit || l.bikeshare).map((l, i) => <LegChip key={i} leg={l} />)}
                </View>
              </View>
            )}
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  map: { height: '38%', minHeight: 220 },
  mapTop: { position: 'absolute', right: 10 },
  pinBar: { position: 'absolute', left: 10, right: 10, bottom: 10, borderWidth: 1, borderRadius: 12, padding: 10, gap: 6 },
  panel: { padding: 16, maxWidth: 720, width: '100%', alignSelf: 'center' },
  od: { borderWidth: 1, borderRadius: 12, zIndex: 30 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  homeHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
});
