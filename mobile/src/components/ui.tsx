import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { modeName } from '@/lib/format';
import { useColors } from '@/lib/theme';
import type { Leg } from '@/lib/types';

export function Card({ children, style, onPress, selected }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; selected?: boolean }) {
  const c = useColors();
  const body = (
    <View style={[styles.card, { backgroundColor: c.card, borderColor: selected ? c.brand : c.line, borderWidth: selected ? 2 : 1 }, style]}>
      {children}
    </View>
  );
  return onPress ? <Pressable onPress={onPress} accessibilityRole="button">{body}</Pressable> : body;
}

export function T({ children, style, muted, bold, size, color, numberOfLines }: {
  children: ReactNode; style?: StyleProp<TextStyle>; muted?: boolean; bold?: boolean; size?: number; color?: string; numberOfLines?: number;
}) {
  const c = useColors();
  return (
    <Text numberOfLines={numberOfLines} style={[{ color: color ?? (muted ? c.muted : c.ink), fontSize: size ?? 14, fontWeight: bold ? '700' : '400' }, style]}>
      {children}
    </Text>
  );
}

export function Button({ title, onPress, kind = 'primary', loading, disabled, style }: {
  title: string; onPress: () => void; kind?: 'primary' | 'ghost'; loading?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const primary = kind === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        primary ? { backgroundColor: c.brand } : { backgroundColor: c.card, borderWidth: 1, borderColor: c.line },
        (pressed || disabled) && { opacity: 0.7 },
        style,
      ]}>
      {loading ? <ActivityIndicator color={primary ? c.brandInk : c.ink} /> : (
        <Text style={{ color: primary ? c.brandInk : c.ink, fontWeight: '600', fontSize: 14 }}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Pill({ label, onPress, active, onLongPress }: { label: string; onPress: () => void; active?: boolean; onLongPress?: () => void }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      style={[styles.pill, { borderColor: active ? c.brand : c.line, backgroundColor: active ? c.brand : c.card }]}>
      <Text style={{ color: active ? c.brandInk : c.ink, fontSize: 13 }} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

export function Segmented<V extends string>({ value, options, onChange }: { value: V; options: { value: V; label: string }[]; onChange: (v: V) => void }) {
  const c = useColors();
  return (
    <View style={[styles.seg, { borderColor: c.line }]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={[styles.segItem, on && { backgroundColor: c.brand }]} accessibilityRole="button" accessibilityState={{ selected: on }}>
            <Text style={{ color: on ? c.brandInk : c.muted, fontSize: 12.5, fontWeight: '600' }} numberOfLines={1}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Note({ children, tone = 'warn' }: { children: ReactNode; tone?: 'warn' | 'danger' | 'info' }) {
  const c = useColors();
  const bg = tone === 'danger' ? c.dangerBg : tone === 'info' ? c.soft : c.warnBg;
  const fg = tone === 'danger' ? c.dangerInk : tone === 'info' ? c.muted : c.warnInk;
  return <View style={[styles.note, { backgroundColor: bg }]}><Text style={{ color: fg, fontSize: 13 }}>{children}</Text></View>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  const c = useColors();
  return <Text style={[styles.section, { color: c.muted }]}>{children}</Text>;
}

export function LiveDot() {
  const c = useColors();
  return <View style={[styles.liveDot, { backgroundColor: c.live }]} />;
}

const MODE_ICON: Record<string, string> = {
  WALK: '🚶', BIKE: '🚲', CAR: '🚗', BUS: '🚌', COACH: '🚌', TRAM: '🚋', SUBWAY: '🚇', REGIONAL_RAIL: '🚆', RAIL: '🚆', LONG_DISTANCE: '🚆', FERRY: '⛴️',
};
export const modeIcon = (m: string) => MODE_ICON[m] ?? '🚌';

/** Coloured route badge, e.g. [🚇 1] in Line 1 yellow. */
export function LegChip({ leg }: { leg: Leg }) {
  const c = useColors();
  if (leg.bikeshare) {
    return <View style={[styles.chip, { backgroundColor: c.bike }]}><Text style={styles.chipText}>🚲 Bike Share</Text></View>;
  }
  if (!leg.transit) {
    if (leg.mode === 'WALK' && leg.durationMin < 1) return null;
    return <Text style={{ color: c.muted, fontSize: 12.5 }}>{modeIcon(leg.mode)} {leg.durationMin}</Text>;
  }
  return (
    <View style={[styles.chip, { backgroundColor: leg.color || c.soft }]}>
      <Text style={[styles.chipText, { color: leg.color ? leg.textColor || '#fff' : c.ink }]}>
        {modeIcon(leg.mode)} {leg.route || modeName(leg.mode)}
      </Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  card: { borderRadius: 12, padding: 12 },
  button: { borderRadius: 10, paddingVertical: 11, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  pill: { borderWidth: 1, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 11, maxWidth: 200 },
  seg: { flexDirection: 'row', borderWidth: 1, borderRadius: 9, overflow: 'hidden' },
  segItem: { flex: 1, paddingVertical: 8, paddingHorizontal: 6, alignItems: 'center' },
  note: { borderRadius: 10, paddingVertical: 8, paddingHorizontal: 11, marginTop: 8 },
  section: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 18, marginBottom: 8 },
  liveDot: { width: 7, height: 7, borderRadius: 4, marginRight: 4 },
  chip: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  chipText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
