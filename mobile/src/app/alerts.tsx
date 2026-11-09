import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NotificationsCard } from '@/components/notifications-card';
import { Card, Note, SectionTitle, T } from '@/components/ui';
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
      contentContainerStyle={[styles.panel, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 30 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      <T bold size={22}>Alerts</T>
      {error ? <Note tone="danger">{error}</Note> : null}
      <View style={{ marginTop: 10 }}><NotificationsCard /></View>

      <SectionTitle>Weather</SectionTitle>
      {cur ? (
        <Card style={styles.wxNow}>
          <View>
            <T bold size={30}>{Math.round(cur.temperature)}°C</T>
            <T muted>{cur.condition}</T>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <T muted size={12.5}>Feels like {Math.round(cur.feelsLike)}°</T>
            <T muted size={12.5}>Wind {cur.windDir ?? ''} {cur.windKmh ?? '–'} km/h{cur.gustKmh ? `, gusts ${cur.gustKmh}` : ''}</T>
            <T muted size={12.5}>Humidity {cur.humidity ?? '–'}%</T>
          </View>
        </Card>
      ) : null}
      {(wx?.alerts ?? []).map((a) => (
        <Card key={a.id} style={[styles.alert, { borderLeftColor: a.severity === 'severe' ? '#dc2626' : '#d97706' }]}>
          <T muted size={11} bold>ENVIRONMENT CANADA · {(a.type ?? 'alert').toUpperCase()}</T>
          <T bold>{a.name}{a.area ? ` · ${a.area}` : ''}</T>
          {a.text ? <T size={12.5} muted numberOfLines={6}>{a.text}</T> : null}
        </Card>
      ))}
      {wx && !wx.alerts.length ? <T muted size={13}>No weather alerts for Toronto right now.</T> : null}
      {cur?.forecasts.map((f) => (
        <View key={f.period} style={[styles.fc, { borderBottomColor: c.line }]}>
          <T bold size={13} style={{ width: 96 }}>{f.period}</T>
          <T size={13} style={{ flex: 1 }}>{f.summary}</T>
        </View>
      ))}

      <SectionTitle>Elevators & escalators out</SectionTitle>
      {access.map((a) => (
        <Card key={a.id} style={[styles.alert, { borderLeftColor: a.kind === 'elevator' ? c.late : c.line }]}>
          <T muted size={11} bold>♿ TTC · {a.kind.toUpperCase()}{a.station ? ` · ${a.station}` : ''}</T>
          <T size={13}>{a.header}</T>
        </Card>
      ))}
      {alerts && !access.length ? <T muted size={13}>All TTC elevators and escalators are working.</T> : null}

      <SectionTitle>Transit service alerts</SectionTitle>
      <TextInput value={q} onChangeText={setQ} placeholder="Filter (e.g. Line 2, 504)" placeholderTextColor={c.muted}
        style={[styles.search, { borderColor: c.line, color: c.ink, backgroundColor: c.card }]} />
      {transit.map((a) => (
        <Card key={a.id} style={[styles.alert, { borderLeftColor: a.activeNow ? c.late : c.line }]}>
          <T muted size={11} bold>{a.source}{a.routes.length ? ` · ROUTE ${a.routes.slice(0, 4).join(', ')}` : ''}{a.activeNow ? '' : ' · UPCOMING'}</T>
          <T size={13}>{a.header}</T>
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  panel: { padding: 16, maxWidth: 720, width: '100%', alignSelf: 'center' },
  wxNow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  alert: { marginTop: 8, borderLeftWidth: 4, gap: 3 },
  fc: { flexDirection: 'row', gap: 8, paddingVertical: 7, borderBottomWidth: 1 },
  search: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14 },
});
