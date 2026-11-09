import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useColors } from '@/lib/theme';
import { useWeather } from '@/lib/weather';

import { Icon } from './icon';
import { RADIUS, SPACE, TYPE } from './ui';

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
      <Icon name={alert ? 'warning' : 'cloud'} size={18} color={fg} />
      <View>
        <Text style={[TYPE.small, { color: fg, fontWeight: '700' }]}>{Math.round(wx.current.temperature)}°</Text>
        <Text style={[TYPE.caption, { color: fg }]} numberOfLines={1}>{alert ? alert.name : wx.current.condition}</Text>
      </View>
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
      <Icon name="warning" size={18} color={severe ? c.dangerInk : c.warnInk} />
      <Text style={[TYPE.small, { color: severe ? c.dangerInk : c.warnInk, flex: 1 }]}>
        <Text style={{ fontWeight: '700' }}>{alert.name}</Text>
        {wx!.alerts.length > 1 ? ` (+${wx!.alerts.length - 1} more)` : ''}. Tap for details.
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, borderWidth: 1, borderRadius: 20, height: 40, paddingHorizontal: SPACE.md, maxWidth: 190 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, borderRadius: RADIUS.control, paddingVertical: SPACE.sm + 2, paddingHorizontal: SPACE.md, marginBottom: SPACE.md },
});
