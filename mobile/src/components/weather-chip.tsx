import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { api } from '@/lib/api';
import { useColors } from '@/lib/theme';
import type { WeatherData } from '@/lib/types';

/** Small floating "8° Partly cloudy" chip; turns red/orange when there's a weather alert. */
export function WeatherChip() {
  const c = useColors();
  const [wx, setWx] = useState<WeatherData | null>(null);
  useEffect(() => {
    const load = () => api.weather().then(setWx).catch(() => {});
    load();
    const t = setInterval(load, 10 * 60_000);
    return () => clearInterval(t);
  }, []);
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

const styles = StyleSheet.create({
  chip: { borderWidth: 1, borderRadius: 10, paddingVertical: 4, paddingHorizontal: 10, alignItems: 'flex-end', maxWidth: 170 },
});
