import { useCallback, useEffect, useMemo, useState } from 'react';

import { usePolling } from '@/lib/hooks';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import TransitMap from '@/components/map/transit-map';
import type { MapMarker } from '@/components/map/types';
import { Button, Card, LiveDot, Note, T, modeIcon } from '@/components/ui';
import { api } from '@/lib/api';
import { cleanHeadsign, fmtTime, inLabel } from '@/lib/format';
import { getMyLocation } from '@/lib/location';
import { useColors } from '@/lib/theme';
import type { BikeStation, NearbyBoard } from '@/lib/types';

export default function NearbyScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [at, setAt] = useState<{ lat: number; lon: number } | null>(null);
  const [locError, setLocError] = useState<string | null>(null);

  const { data, error: loadError, refreshing, refresh } = usePolling<[NearbyBoard[], BikeStation[]] | null>(
    async () => (at ? Promise.all([api.nearby(at), api.bikesNear(at).catch(() => [] as BikeStation[])]) : null),
    30_000, at ? `${at.lat},${at.lon}` : '');
  const [boards, bikes] = data ?? [[], []];
  const error = locError || loadError;
  const loading = Boolean(at) && data === null && !error;

  const locate = useCallback(() => getMyLocation().then(
    (p) => { setAt(p); setLocError(null); },
    (e: Error) => setLocError(e.message),
  ), []);

  useEffect(() => { locate(); }, [locate]);

  const markers = useMemo<MapMarker[]>(() => [
    ...boards.map((b) => ({ id: b.stopId, lat: b.lat, lon: b.lon, color: b.departures[0]?.color || c.brand, size: 13, title: b.name })),
    ...bikes.map((s) => ({ id: `bs${s.id}`, lat: s.lat, lon: s.lon, color: s.bikes ? c.bike : '#9aa3a0', label: String(s.bikes), title: s.name })),
  ], [boards, bikes, c]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ height: '32%', minHeight: 200 }}>
        <TransitMap markers={markers} fit={at ? [[at.lat, at.lon]] : undefined} fitKey={at ? `${at.lat},${at.lon}` : ''}
          onLongPress={(lat, lon) => { setAt({ lat, lon }); setLocError(null); }} />
      </View>
      <ScrollView
        style={{ backgroundColor: c.panel }}
        contentContainerStyle={[styles.panel, { paddingBottom: insets.bottom + 30 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => (at ? refresh() : locate())} />}>
        <View style={styles.row}>
          <T muted size={13} style={{ flex: 1 }}>{at ? `${boards.length} stops within 450 m · long-press the map to look elsewhere` : locError ? 'Long-press (or right-click) the map to see departures there.' : 'Finding your location…'}</T>
          <Button title="Near me" kind="ghost" onPress={locate} style={{ paddingVertical: 6 }} />
        </View>
        {error ? <Note tone="danger">{error}</Note> : null}

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
        {at && !loading && !boards.length && !error ? <Note tone="info">Nothing departing nearby right now.</Note> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { padding: 16, maxWidth: 720, width: '100%', alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  boardHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 9, paddingHorizontal: 12 },
  dep: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 12, borderTopWidth: 1 },
  chip: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  bikeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 12, borderTopWidth: 1 },
  num: { alignItems: 'flex-end', minWidth: 44 },
});
