import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import TransitMap from '@/components/map/transit-map';
import type { MapMarker } from '@/components/map/types';
import { PlaceInput } from '@/components/place-input';
import { Card, LiveDot, Note, T, modeIcon } from '@/components/ui';
import { WeatherBanner } from '@/components/weather-chip';
import { api } from '@/lib/api';
import { cleanHeadsign, fmtTime, inLabel } from '@/lib/format';
import { usePolling } from '@/lib/hooks';
import { getLocationIfAllowed, getMyLocation } from '@/lib/location';
import { load as loadStored, type SavedPlaces } from '@/lib/storage';
import { useColors } from '@/lib/theme';
import type { BikeStation, NearbyBoard, Place } from '@/lib/types';

const DOWNTOWN: Place = { name: 'Downtown (Union Station)', lat: 43.6453, lon: -79.3806 };
type Spot = Place & { source: 'location' | 'home' | 'downtown' | 'search' | 'map' };

export default function NearbyScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [at, setAt] = useState<Spot | null>(null);
  const [locError, setLocError] = useState<string | null>(null);

  // "Departures" from a long-press on the Plan map
  const params = useLocalSearchParams<{ lat?: string; lon?: string }>();
  const paramKey = params.lat && params.lon ? `${params.lat},${params.lon}` : '';
  const [seenParam, setSeenParam] = useState('');
  if (paramKey && paramKey !== seenParam) {
    setSeenParam(paramKey);
    setAt({ lat: Number(params.lat), lon: Number(params.lon), name: 'Pinned spot', source: 'map' });
  }

  const { data, error: loadError, refreshing, refresh } = usePolling<[NearbyBoard[], BikeStation[]] | null>(
    async () => (at ? Promise.all([api.nearby(at), api.bikesNear(at).catch(() => [] as BikeStation[])]) : null),
    30_000, at ? `${at.lat},${at.lon}` : '');
  const [boards, bikes] = data ?? [[], []];
  const loading = Boolean(at) && data === null && !loadError;

  // Start somewhere useful without asking: your location if already allowed, else Home, else downtown.
  useEffect(() => {
    let alive = true;
    getLocationIfAllowed()
      .then(async (pos) => {
        if (pos) return { ...pos, name: 'Your location', source: 'location' as const };
        const saved = await loadStored<SavedPlaces>('saved', {});
        return saved.Home ? { ...saved.Home, name: `Home (${saved.Home.name})`, source: 'home' as const } : { ...DOWNTOWN, source: 'downtown' as const };
      })
      .then((spot) => { if (alive) setAt((cur) => cur ?? spot); });
    return () => { alive = false; };
  }, []);

  // "Near me" button: this one may show the permission prompt, because the user asked.
  const nearMe = useCallback(() => getMyLocation().then(
    (p) => { setAt({ ...p, name: 'Your location', source: 'location' }); setLocError(null); },
    (e: Error) => setLocError(e.message),
  ), []);

  const markers = useMemo<MapMarker[]>(() => [
    ...(at ? [{ id: 'here', lat: at.lat, lon: at.lon, color: '#1f5fbf', size: 14, title: at.name }] : []),
    ...boards.map((b) => ({ id: b.stopId, lat: b.lat, lon: b.lon, color: b.departures[0]?.color || c.brand, size: 13, title: b.name })),
    ...bikes.map((s) => ({ id: `bs${s.id}`, lat: s.lat, lon: s.lon, color: s.bikes ? c.bike : '#9aa3a0', label: String(s.bikes), title: s.name })),
  ], [at, boards, bikes, c]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ height: '32%', minHeight: 200 }}>
        <TransitMap markers={markers} fit={at ? [[at.lat, at.lon]] : undefined} fitKey={at ? `${at.lat},${at.lon}` : ''}
          onLongPress={(lat, lon) => { setAt({ lat, lon, name: 'Pinned spot', source: 'map' }); setLocError(null); }} />
      </View>
      <ScrollView
        style={{ backgroundColor: c.panel }}
        contentContainerStyle={[styles.panel, { paddingBottom: insets.bottom + 30 }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        <WeatherBanner />
        <View style={[styles.search, { borderColor: c.line, backgroundColor: c.card }]}>
          <PlaceInput
            role="from"
            value={at?.source === 'search' ? at : null}
            onChange={(p) => { if (p) setAt({ ...p, source: 'search' }); }}
            placeholder="Departures near… (any address or place)"
            near={at}
            right={(
              <Pressable onPress={nearMe} hitSlop={8} accessibilityRole="button" accessibilityLabel="Departures near me" style={[styles.meBtn, { borderColor: c.line }]}>
                <Text style={{ color: c.ink, fontSize: 12.5, fontWeight: '600' }}>📍 Near me</Text>
              </Pressable>
            )}
          />
        </View>
        <T muted size={12.5} style={{ marginTop: 8 }}>
          {at ? `Near ${at.name}${data ? ` · ${boards.length} stops within 450 m` : ''} · long-press the map to look elsewhere` : 'Loading…'}
        </T>
        {at && at.source !== 'location' ? (
          <Note tone="info">
            {locError ? `${locError} ` : ''}Showing {at.source === 'home' ? 'your Home' : at.source === 'downtown' ? 'downtown' : 'the place you chose'}. Tap 📍 Near me to use where you are.
          </Note>
        ) : null}
        {loadError ? <Note tone="danger">{loadError}</Note> : null}
        {loading ? <Note tone="info">Loading departures…</Note> : null}

        {bikes.length > 0 && (
          <Card style={{ marginTop: 10, padding: 0, overflow: 'hidden' }}>
            <View style={[styles.boardHead, { backgroundColor: c.soft }]}><T bold size={13}>🚲 Bike Share Toronto</T><T muted size={12}>live</T></View>
            {bikes.map((s) => (
              <View key={s.id} style={[styles.bikeRow, { borderTopColor: c.line }]}>
                <View style={{ flex: 1 }}><T size={13} numberOfLines={1}>{s.name}</T><T muted size={11.5}>{s.distanceM} m</T></View>
                <View style={styles.num}><T bold size={15}>{s.bikes}</T><T muted size={11}>bikes{s.ebikes ? ` · ${s.ebikes} e` : ''}</T></View>
                <View style={styles.num}><T bold size={15}>{s.docks}</T><T muted size={11}>docks</T></View>
              </View>
            ))}
          </Card>
        )}

        {boards.map((b) => (
          <Card key={b.stopId} style={{ marginTop: 10, padding: 0, overflow: 'hidden' }}>
            <View style={[styles.boardHead, { backgroundColor: c.soft }]}><T bold size={13} style={{ flex: 1 }} numberOfLines={1}>{b.name}</T><T muted size={12}>{b.distanceM} m</T></View>
            {b.departures.map((d, i) => (
              <View key={i} style={[styles.dep, { borderTopColor: c.line }]}>
                <View style={[styles.chip, { backgroundColor: d.color || c.soft }]}>
                  <Text style={{ color: d.color ? d.textColor || '#fff' : c.ink, fontWeight: '700', fontSize: 12 }}>{modeIcon(d.mode)} {d.route}</Text>
                </View>
                <T size={13} style={{ flex: 1 }} numberOfLines={1}>{cleanHeadsign(d.headsign)}{d.track ? ` · Plat. ${d.track}` : ''}</T>
                <View style={{ alignItems: 'flex-end' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {d.live ? <LiveDot /> : null}
                    <T bold size={15} color={d.live ? c.live : c.ink}>{inLabel(d.time)}</T>
                  </View>
                  <T muted size={11}>{fmtTime(d.time)}{d.live ? (d.delayMin ? ` · ${d.delayMin > 0 ? '+' : ''}${d.delayMin}` : '') : ' sched'}</T>
                </View>
              </View>
            ))}
          </Card>
        ))}
        {at && data && !boards.length ? <Note tone="info">Nothing departing within 450 m right now. Try another spot.</Note> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { padding: 16, maxWidth: 720, width: '100%', alignSelf: 'center' },
  search: { borderWidth: 1, borderRadius: 12, zIndex: 30 },
  meBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  boardHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 9, paddingHorizontal: 12 },
  dep: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 12, borderTopWidth: 1 },
  chip: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  bikeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 12, borderTopWidth: 1 },
  num: { alignItems: 'flex-end', minWidth: 44 },
});
