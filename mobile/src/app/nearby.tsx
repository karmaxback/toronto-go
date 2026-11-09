import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { bikeColor } from '@/components/map/layers';
import TransitMap from '@/components/map/transit-map';
import type { MapMarker } from '@/components/map/types';
import { PlaceInput } from '@/components/place-input';
import { Card, LiveDot, Note, Pill, RADIUS, RouteBadge, SPACE, T, page } from '@/components/ui';
import { WeatherBanner } from '@/components/weather-chip';
import { api } from '@/lib/api';
import { cleanHeadsign, fmtTime, inLabel } from '@/lib/format';
import { modeIconName } from '@/lib/icons';
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

  // stops show the vehicle that leaves next (bus, streetcar, subway, train); bike stations show bikes available
  const markers = useMemo<MapMarker[]>(() => [
    ...bikes.map((s): MapMarker => ({ id: `bs${s.id}`, lat: s.lat, lon: s.lon, color: bikeColor(s.bikes), icon: 'bike', label: String(s.bikes), title: s.name })),
    ...boards.map((b): MapMarker => ({
      id: b.stopId, lat: b.lat, lon: b.lon, color: b.departures[0]?.color || c.brand,
      icon: modeIconName(b.departures[0]?.mode), label: b.departures[0]?.route ?? undefined, title: b.name,
    })),
    ...(at ? [{ id: 'here', lat: at.lat, lon: at.lon, color: '#1f5fbf', icon: at.source === 'location' ? 'location' : 'pin', style: 'pin', title: at.name } satisfies MapMarker] : []),
  ], [at, boards, bikes, c]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ height: '32%', minHeight: 200 }}>
        <TransitMap markers={markers} fit={at ? [[at.lat, at.lon]] : undefined} fitKey={at ? `${at.lat},${at.lon}` : ''}
          onLongPress={(lat, lon) => { setAt({ lat, lon, name: 'Pinned spot', source: 'map' }); setLocError(null); }} />
      </View>
      <ScrollView
        style={{ backgroundColor: c.panel }}
        contentContainerStyle={[page, { paddingBottom: insets.bottom + 30 }]}
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
            right={<Pill icon="gps" label="Near me" onPress={nearMe} active={at?.source === 'location'} />}
          />
        </View>
        <T muted variant="small" style={{ marginTop: SPACE.sm }}>
          {at ? `Near ${at.name}${data ? ` · ${boards.length} stops within 450 m` : ''} · long-press the map to look elsewhere` : 'Loading…'}
        </T>
        {at && at.source !== 'location' ? (
          <Note tone="info">
            {locError ? `${locError} ` : ''}Showing {at.source === 'home' ? 'your Home' : at.source === 'downtown' ? 'downtown' : 'the place you chose'}. Tap “Near me” to use where you are.
          </Note>
        ) : null}
        {loadError ? <Note tone="danger">{loadError}</Note> : null}
        {loading ? <Note tone="info">Loading departures…</Note> : null}

        {bikes.length > 0 && (
          <Card style={{ marginTop: SPACE.md, padding: 0, overflow: 'hidden' }}>
            <View style={[styles.boardHead, { backgroundColor: c.soft }]}>
              <Icon name="bike" size={18} color={c.bike} />
              <T bold style={{ flex: 1 }}>Bike Share Toronto</T>
              <View style={styles.inline}><LiveDot /><T muted variant="caption">live</T></View>
            </View>
            {bikes.map((s) => (
              <View key={s.id} style={[styles.bikeRow, { borderTopColor: c.line }]}>
                <View style={{ flex: 1 }}><T variant="small" numberOfLines={1}>{s.name}</T><T muted variant="caption">{s.distanceM} m</T></View>
                <View style={styles.num}><T bold variant="heading">{s.bikes}</T><T muted variant="caption">bikes{s.ebikes ? ` · ${s.ebikes} e` : ''}</T></View>
                <View style={styles.num}><T bold variant="heading">{s.docks}</T><T muted variant="caption">docks</T></View>
              </View>
            ))}
          </Card>
        )}

        {boards.map((b) => (
          <Card key={b.stopId} style={{ marginTop: 10, padding: 0, overflow: 'hidden' }}>
            <View style={[styles.boardHead, { backgroundColor: c.soft }]}>
              <Icon name={modeIconName(b.departures[0]?.mode)} size={18} color={c.muted} />
              <T bold style={{ flex: 1 }} numberOfLines={1}>{b.name}</T>
              <T muted variant="small">{b.distanceM} m</T>
            </View>
            {b.departures.map((d, i) => (
              <View key={i} style={[styles.dep, { borderTopColor: c.line }]}>
                <RouteBadge mode={d.mode} route={d.route} color={d.color} textColor={d.textColor} />
                <T variant="small" style={{ flex: 1 }} numberOfLines={1}>{cleanHeadsign(d.headsign)}{d.track ? ` · Plat. ${d.track}` : ''}</T>
                <View style={{ alignItems: 'flex-end' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {d.live ? <LiveDot /> : null}
                    <T bold variant="heading" color={d.live ? c.live : c.ink}>{inLabel(d.time)}</T>
                  </View>
                  <T muted variant="caption">{fmtTime(d.time)}{d.live ? (d.delayMin ? ` · ${d.delayMin > 0 ? '+' : ''}${d.delayMin}` : '') : ' sched'}</T>
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
  search: { borderWidth: 1, borderRadius: RADIUS.card, zIndex: 30 },
  inline: { flexDirection: 'row', alignItems: 'center' },
  boardHead: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, paddingVertical: SPACE.sm + 2, paddingHorizontal: SPACE.md },
  dep: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm + 2, minHeight: 52, paddingVertical: SPACE.sm, paddingHorizontal: SPACE.md, borderTopWidth: StyleSheet.hairlineWidth },
  bikeRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, minHeight: 52, paddingVertical: SPACE.sm, paddingHorizontal: SPACE.md, borderTopWidth: StyleSheet.hairlineWidth },
  num: { alignItems: 'flex-end', minWidth: 48 },
});
