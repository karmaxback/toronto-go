import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { useColors } from '@/lib/theme';
import { useWeather } from '@/lib/weather';

/** Small floating "8° Partly cloudy" chip; turns red/orange when there's a weather alert. */
export function WeatherChip() {
  const c = useColors();
  const wx = useWeather();
  if (!wx?.current) return null;
  const alert = wx.alerts[0];
  const bg = alert ? (alert.severity === 'severe' ? c.dangerBg : c.warnBg) : c.panel;
  const fg = alert ? (alert.severity === 'severe' ? c.dangerInk : c.warnInk) : c.ink;
  return (
    <Pressable onPress={() => router.navigate('/alerts')} style={[styles.chip, { backgroundColor: bg, borderColor: c.line }]} accessibilityRole="button">
      <Text style={{ color: fg, fontWeight: '700', fontSize: 15 }}>{Math.round(wx.current.temperature)}°</Text>
      <Text style={{ color: fg, fontSize: 11 }} numberOfLines={1}>{alert ? `⚠ ${alert.name}` : wx.current.condition}</Text>
    </Pressable>
  );
}

/** Full-width warning banner shown at the top of screens while Environment Canada has an alert out. */
export function WeatherBanner() {
  const c = useColors();
  const wx = useWeather();
  const alert = wx?.alerts[0];
  if (!alert) return null;
  const severe = alert.severity === 'severe';
  return (
    <Pressable onPress={() => router.navigate('/alerts')} accessibilityRole="button"
      style={[styles.banner, { backgroundColor: severe ? c.dangerBg : c.warnBg }]}>
      <Text style={{ color: severe ? c.dangerInk : c.warnInk, fontSize: 13 }}>
        <Text style={{ fontWeight: '700' }}>⚠ {alert.name}</Text>
        {wx!.alerts.length > 1 ? ` (+${wx!.alerts.length - 1} more)` : ''}. Tap for details.
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { borderWidth: 1, borderRadius: 10, paddingVertical: 4, paddingHorizontal: 10, alignItems: 'flex-end', maxWidth: 170 },
  banner: { borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12, marginBottom: 10 },
});
