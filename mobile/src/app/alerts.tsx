import { useState } from 'react';
import { router } from 'expo-router';
import { RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, IconButton, Note, RADIUS, ScreenHeader, SectionTitle, SPACE, T, TYPE, page } from '@/components/ui';
import { api } from '@/lib/api';
import { usePolling } from '@/lib/hooks';
import { useColors } from '@/lib/theme';
import type { AlertsData, WeatherData } from '@/lib/types';

export default function AlertsScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { data, error, refreshing, refresh } = usePolling<[WeatherData, AlertsData]>(
    () => Promise.all([api.weather(), api.alerts()]), 3 * 60_000);
  const [wx, alerts] = data ?? [null, null];
  const [q, setQ] = useState('');

  const cur = wx?.current;
  const access = [...(alerts?.accessibility ?? [])].sort((a, b) => Number(b.kind === 'elevator') - Number(a.kind === 'elevator'));
  const transit = (alerts?.transit ?? []).filter((a) => !q || `${a.header} ${a.routes.join(' ')}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <ScrollView
      style={{ backgroundColor: c.panel }}
      contentContainerStyle={[page, { paddingTop: insets.top + SPACE.lg, paddingBottom: insets.bottom + 30 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      <ScreenHeader title="Alerts" subtitle="Weather, elevators and service changes"
        right={<IconButton icon="bell" label="Notification settings" onPress={() => router.navigate('/settings')} />} />
      {error ? <Note tone="danger">{error}</Note> : null}

      <SectionTitle>Weather</SectionTitle>
      {cur ? (
        <Card style={styles.wxNow}>
          <View>
            <T bold variant="title">{Math.round(cur.temperature)}°C</T>
            <T muted>{cur.condition}</T>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <T muted variant="small">Feels like {Math.round(cur.feelsLike)}°</T>
            <T muted variant="small">Wind {cur.windDir ?? ''} {cur.windKmh ?? '–'} km/h{cur.gustKmh ? `, gusts ${cur.gustKmh}` : ''}</T>
            <T muted variant="small">Humidity {cur.humidity ?? '–'}%</T>
          </View>
        </Card>
      ) : null}
      {(wx?.alerts ?? []).map((a) => (
        <Card key={a.id} style={[styles.alert, { borderLeftColor: a.severity === 'severe' ? '#dc2626' : '#d97706' }]}>
          <T muted variant="caption" bold>ENVIRONMENT CANADA · {(a.type ?? 'alert').toUpperCase()}</T>
          <T bold>{a.name}{a.area ? ` · ${a.area}` : ''}</T>
          {a.text ? <T variant="small" muted numberOfLines={6}>{a.text}</T> : null}
        </Card>
      ))}
      {wx && !wx.alerts.length ? <T muted variant="small">No weather alerts for Toronto right now.</T> : null}
      {cur?.forecasts.map((f) => (
        <View key={f.period} style={[styles.fc, { borderBottomColor: c.line }]}>
          <T bold variant="small" style={{ width: 96 }}>{f.period}</T>
          <T variant="small" style={{ flex: 1 }}>{f.summary}</T>
        </View>
      ))}

      <SectionTitle>Elevators & escalators out</SectionTitle>
      {access.map((a) => (
        <Card key={a.id} style={[styles.alert, { borderLeftColor: a.kind === 'elevator' ? c.late : c.line }]}>
          <T muted variant="caption" bold>♿ TTC · {a.kind.toUpperCase()}{a.station ? ` · ${a.station}` : ''}</T>
          <T variant="small">{a.header}</T>
        </Card>
      ))}
      {alerts && !access.length ? <T muted variant="small">All TTC elevators and escalators are working.</T> : null}

      <SectionTitle>Transit service alerts</SectionTitle>
      <TextInput value={q} onChangeText={setQ} placeholder="Filter (e.g. Line 2, 504)" placeholderTextColor={c.muted}
        style={[styles.search, { borderColor: c.line, color: c.ink, backgroundColor: c.card }]} />
      {transit.map((a) => (
        <Card key={a.id} style={[styles.alert, { borderLeftColor: a.activeNow ? c.late : c.line }]}>
          <T muted variant="caption" bold>{a.source}{a.routes.length ? ` · ROUTE ${a.routes.slice(0, 4).join(', ')}` : ''}{a.activeNow ? '' : ' · UPCOMING'}</T>
          <T variant="small">{a.header}</T>
        </Card>
      ))}

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wxNow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  alert: { marginTop: SPACE.sm, borderLeftWidth: 4, gap: SPACE.xs },
  fc: { flexDirection: 'row', gap: SPACE.sm, paddingVertical: SPACE.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  search: { ...TYPE.body, borderWidth: 1, borderRadius: RADIUS.control, paddingHorizontal: SPACE.md, minHeight: 44 },
});
