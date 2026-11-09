import { router } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, LiveDot, Note, Segmented, SectionTitle, T } from '@/components/ui';
import { api } from '@/lib/api';
import { useNow, usePolling } from '@/lib/hooks';
import { fmtTime } from '@/lib/format';
import { useColors } from '@/lib/theme';
import type { AirportData, Flight } from '@/lib/types';

export default function AirportScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { data, error, refreshing, refresh } = usePolling<AirportData>(() => api.airport(), 120_000);
  const now = useNow();
  const [dir, setDir] = useState<'departures' | 'arrivals'>('departures');
  const [q, setQ] = useState('');

  const goTo = (k: 'T1' | 'T3') => {
    const t = data?.terminals[k] ?? (k === 'T1'
      ? { name: 'Pearson Terminal 1', lat: 43.6812, lon: -79.6124 }
      : { name: 'Pearson Terminal 3', lat: 43.689, lon: -79.6195 });
    router.navigate({ pathname: '/', params: { toLat: String(t.lat), toLon: String(t.lon), toName: t.name } });
  };

  const upcoming = (list: { time: string; live: boolean }[]) => list.filter((d) => Date.parse(d.time) > now - 60_000).slice(0, 4);
  const flights = (data?.flights?.[dir] ?? [])
    .filter((f) => !q || [f.number, f.airline, f.city, f.airport].join(' ').toLowerCase().includes(q.toLowerCase()))
    .filter((f) => Date.parse(f.estimated || f.scheduled || '') > now - 45 * 60_000)
    .slice(0, 50);

  return (
    <ScrollView
      style={{ backgroundColor: c.panel }}
      contentContainerStyle={[styles.panel, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 30 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      <T bold size={22}>✈️ Toronto Pearson</T>
      <View style={styles.two}>
        <Button title="Route me to Terminal 1" kind="ghost" onPress={() => goTo('T1')} style={{ flex: 1 }} />
        <Button title="Route me to Terminal 3" kind="ghost" onPress={() => goTo('T3')} style={{ flex: 1 }} />
      </View>
      {error ? <Note tone="danger">{error}</Note> : null}

      <SectionTitle>UP Express</SectionTitle>
      <View style={styles.two}>
        {([['Union → Pearson', data?.upExpress.fromUnion ?? []], ['Pearson → Union', data?.upExpress.fromPearson ?? []]] as const).map(([title, list]) => (
          <Card key={title} style={{ flex: 1 }}>
            <T muted size={12.5} bold>{title}</T>
            <View style={styles.times}>
              {upcoming([...list]).map((d, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center' }}>{d.live ? <LiveDot /> : null}<T bold>{fmtTime(d.time)}</T></View>
              ))}
              {!upcoming([...list]).length ? <T muted size={13}>No departures</T> : null}
            </View>
          </Card>
        ))}
      </View>

      <SectionTitle>Flights</SectionTitle>
      {!data?.flightsEnabled ? (
        <Note tone="info">Live Pearson flights are off. Add a free AeroDataBox key on the server (AERODATABOX_RAPIDAPI_KEY) to turn them on.</Note>
      ) : data.flightsError ? (
        <Note tone="danger">Flight data unavailable: {data.flightsError}</Note>
      ) : (
        <>
          <Segmented value={dir} onChange={setDir} options={[{ value: 'departures', label: 'Departures' }, { value: 'arrivals', label: 'Arrivals' }]} />
          <TextInput value={q} onChangeText={setQ} placeholder="Flight, airline or city" placeholderTextColor={c.muted}
            style={[styles.search, { borderColor: c.line, color: c.ink, backgroundColor: c.card }]} />
          {flights.map((f) => <FlightRow key={`${f.number}-${f.scheduled}`} f={f} />)}
          {!flights.length ? <Note tone="info">No matching flights.</Note> : null}
        </>
      )}
    </ScrollView>
  );
}

function FlightRow({ f }: { f: Flight }) {
  const c = useColors();
  const s = (f.status || '').toLowerCase();
  const [label, bg, fg] = /cancel/.test(s) ? ['Cancelled', c.dangerBg, c.dangerInk]
    : (f.delayMin ?? 0) >= 15 ? [`+${f.delayMin} min`, c.warnBg, c.warnInk]
      : /arrived|landed/.test(s) ? ['Landed', c.soft, c.live]
        : /departed/.test(s) ? ['Departed', c.soft, c.live]
          : ['On time', c.soft, c.muted];
  const changed = f.estimated && f.scheduled && Math.abs(Date.parse(f.estimated) - Date.parse(f.scheduled)) >= 5 * 60_000;
  return (
    <View style={[styles.flight, { borderBottomColor: c.line }]}>
      <View style={{ width: 66 }}>
        <T bold>{fmtTime(f.estimated || f.scheduled)}</T>
        {changed ? <T muted size={11} style={{ textDecorationLine: 'line-through' }}>{fmtTime(f.scheduled)}</T> : null}
      </View>
      <View style={{ flex: 1 }}>
        <T bold numberOfLines={1}>{f.city || f.airport}</T>
        <T muted size={12} numberOfLines={1}>{f.number} · {f.airline}{f.terminal ? ` · T${f.terminal}` : ''}{f.gate ? ` · Gate ${f.gate}` : ''}</T>
      </View>
      <T size={11.5} bold color={fg} style={[styles.status, { backgroundColor: bg }]}>{label}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { padding: 16, maxWidth: 720, width: '100%', alignSelf: 'center' },
  two: { flexDirection: 'row', gap: 8, marginTop: 10 },
  times: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 6 },
  search: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8, marginTop: 8, fontSize: 14 },
  flight: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1 },
  status: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, overflow: 'hidden' },
});
