import { useState } from 'react';
import { router } from 'expo-router';
import { RefreshControl, ScrollView, StyleSheet, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { WeatherPanel } from '@/components/weather-panel';
import { Card, IconButton, Note, RADIUS, ScreenHeader, SectionTitle, SPACE, T, TYPE, page } from '@/components/ui';
import { api } from '@/lib/api';
import { usePolling } from '@/lib/hooks';
import { useColors } from '@/lib/theme';
import type { AlertsData } from '@/lib/types';
import { refreshWeather, useWeather } from '@/lib/weather';

export default function AlertsScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  // weather comes from the app-wide copy (same as the banner and map chip); transit alerts are polled here
  const wx = useWeather();
  const { data: alerts, error, refreshing, refresh } = usePolling<AlertsData>(() => api.alerts(), 3 * 60_000);
  const refreshAll = () => { refresh(); refreshWeather().catch(() => {}); };
  const [q, setQ] = useState('');

  const access = [...(alerts?.accessibility ?? [])].sort((a, b) => Number(b.kind === 'elevator') - Number(a.kind === 'elevator'));
  const transit = (alerts?.transit ?? []).filter((a) => !q || `${a.header} ${a.routes.join(' ')}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <ScrollView
      style={{ backgroundColor: c.panel }}
      contentContainerStyle={[page, { paddingTop: insets.top + SPACE.lg, paddingBottom: insets.bottom + 30 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshAll} />}>
      <ScreenHeader title="Alerts" subtitle="Weather, elevators and service changes"
        right={<IconButton icon="bell" label="Notification settings" onPress={() => router.navigate('/settings')} />} />
      {error ? <Note tone="danger">{error}</Note> : null}

      <SectionTitle>Weather</SectionTitle>
      {wx ? <WeatherPanel wx={wx} /> : null}

      <SectionTitle>Elevators & escalators out</SectionTitle>
      {access.map((a) => (
        <Card key={a.id} style={[styles.alert, { borderLeftColor: a.kind === 'elevator' ? c.late : c.line }]}>
          <T muted variant="caption" bold>TTC · {a.kind.toUpperCase()}{a.station ? ` · ${a.station}` : ''}</T>
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
  alert: { marginTop: SPACE.sm, borderLeftWidth: 4, gap: SPACE.xs },
  search: { ...TYPE.body, borderWidth: 1, borderRadius: RADIUS.control, paddingHorizontal: SPACE.md, minHeight: 44 },
});
