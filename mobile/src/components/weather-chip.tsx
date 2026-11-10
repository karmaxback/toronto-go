import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useColors } from '@/lib/theme';
import { useNow } from '@/lib/hooks';
import { useWeather } from '@/lib/weather';
import { conditionIcon, isNight, PRECIP_ICON, upcomingLabel, upcomingSoon } from '@/lib/weather-ui';

import { Icon } from './icon';
import { RADIUS, SPACE, TYPE } from './ui';

/** Small floating "8° Partly cloudy" chip; turns red/orange when there's a weather alert. */
export function WeatherChip() {
  const c = useColors();
  const wx = useWeather();
  const now = useNow(60_000);
  if (!wx?.current) return null;
  const alert = wx.alerts[0];
  const bg = alert ? (alert.severity === 'severe' ? c.dangerBg : c.warnBg) : c.panel;
  const fg = alert ? (alert.severity === 'severe' ? c.dangerInk : c.warnInk) : c.ink;
  return (
    <Pressable onPress={() => router.navigate('/alerts')} style={[styles.chip, { backgroundColor: bg, borderColor: c.line }]} accessibilityRole="button">
      <Icon name={alert ? 'warning' : conditionIcon(wx.current.condition, isNight(new Date(now).toISOString(), wx.current.sunrise, wx.current.sunset))} size={18} color={fg} />
      <View>
        <Text style={[TYPE.small, { color: fg, fontWeight: '700' }]}>{Math.round(wx.current.temperature)}°</Text>
        <Text style={[TYPE.caption, { color: fg }]} numberOfLines={1}>{alert ? alert.name : wx.current.condition}</Text>
      </View>
    </Pressable>
  );
}

/**
 * Full-width banner at the top of Plan and Nearby: an Environment Canada alert if there is one,
 * otherwise a heads-up when rain or snow is falling or likely within 3 hours.
 */
export function WeatherBanner() {
  const c = useColors();
  const wx = useWeather();
  const now = useNow(60_000);
  const alert = wx?.alerts[0];
  if (alert) {
    const severe = alert.severity === 'severe';
    const fg = severe ? c.dangerInk : c.warnInk;
    return (
      <Pressable onPress={() => router.navigate('/alerts')} accessibilityRole="button"
        style={[styles.banner, { backgroundColor: severe ? c.dangerBg : c.warnBg }]}>
        <Icon name="warning" size={18} color={fg} />
        <Text style={[TYPE.small, { color: fg, flex: 1 }]}>
          <Text style={{ fontWeight: '700' }}>{alert.name}</Text>
          {wx!.alerts.length > 1 ? ` (+${wx!.alerts.length - 1} more)` : ''}. {alert.tips ? alert.tips.split('. ')[0] + '.' : 'Tap for details.'}
        </Text>
        <Icon name="chevronRight" size={18} color={fg} />
      </Pressable>
    );
  }
  if (!upcomingSoon(wx?.upcoming, now)) return null;
  const u = wx!.upcoming!;
  return (
    <Pressable onPress={() => router.navigate('/alerts')} accessibilityRole="button" style={[styles.banner, { backgroundColor: c.soft }]}>
      <Icon name={PRECIP_ICON[u.kind]} size={18} color={c.brand} />
      <Text style={[TYPE.small, { color: c.ink, flex: 1 }]}>{upcomingLabel(u)}</Text>
      <Icon name="chevronRight" size={18} color={c.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, borderWidth: 1, borderRadius: 20, height: 40, paddingHorizontal: SPACE.md, maxWidth: 190 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, borderRadius: RADIUS.control, paddingVertical: SPACE.sm + 2, paddingHorizontal: SPACE.md, marginBottom: SPACE.md },
});
