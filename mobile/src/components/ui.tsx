import type { ReactNode } from 'react';
import {
  ActivityIndicator, Pressable, StyleSheet, Switch, Text, View,
  type StyleProp, type TextStyle, type ViewStyle,
} from 'react-native';

import { modeName } from '@/lib/format';
import { modeIconName, type IconName } from '@/lib/icons';
import { useColors } from '@/lib/theme';
import type { Leg } from '@/lib/types';

import { Icon } from './icon';

/*
 * One type scale and one spacing scale for the whole app, so headings, text and gaps line up on every screen.
 */
export const TYPE = {
  title: { fontSize: 26, lineHeight: 32, fontWeight: '700', letterSpacing: -0.3 },
  heading: { fontSize: 17, lineHeight: 22, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 20, fontWeight: '400' },
  small: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
} as const satisfies Record<string, TextStyle>;
export type TypeVariant = keyof typeof TYPE;

export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const RADIUS = { card: 14, control: 10, chip: 7 } as const;
/** Page padding and width shared by every screen. */
export const page = { padding: SPACE.lg, maxWidth: 720, width: '100%', alignSelf: 'center' } as const satisfies ViewStyle;

export function T({ children, style, variant = 'body', muted, bold, color, numberOfLines, onPress }: {
  children: ReactNode; style?: StyleProp<TextStyle>; variant?: TypeVariant; muted?: boolean; bold?: boolean; color?: string; numberOfLines?: number;
  /** makes the text a tappable link */
  onPress?: () => void;
}) {
  const c = useColors();
  return (
    <Text numberOfLines={numberOfLines} onPress={onPress} accessibilityRole={onPress ? 'link' : undefined} style={[TYPE[variant], { color: color ?? (muted ? c.muted : c.ink) }, bold && { fontWeight: '700' }, style]}>
      {children}
    </Text>
  );
}

/** Screen title with an optional line under it and something on the right. */
export function ScreenHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  const c = useColors();
  return (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <Text style={[TYPE.title, { color: c.ink }]} accessibilityRole="header">{title}</Text>
        {subtitle ? <T variant="small" muted style={{ marginTop: 2 }}>{subtitle}</T> : null}
      </View>
      {right}
    </View>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const c = useColors();
  return (
    <View style={styles.sectionRow}>
      <Text style={[styles.section, { color: c.muted }]} accessibilityRole="header">{children}</Text>
      {right}
    </View>
  );
}

export function Card({ children, style, onPress, selected }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; selected?: boolean }) {
  const c = useColors();
  const body = (
    <View style={[styles.card, { backgroundColor: c.card, borderColor: selected ? c.brand : c.line, borderWidth: selected ? 2 : 1 }, style]}>
      {children}
    </View>
  );
  return onPress ? <Pressable onPress={onPress} accessibilityRole="button">{body}</Pressable> : body;
}

export function Button({ title, onPress, kind = 'primary', icon, loading, disabled, style }: {
  title: string; onPress: () => void; kind?: 'primary' | 'ghost' | 'danger'; icon?: IconName; loading?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const fg = kind === 'primary' ? c.brandInk : kind === 'danger' ? c.dangerInk : c.ink;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        kind === 'primary' ? { backgroundColor: c.brand } : { backgroundColor: c.card, borderWidth: 1, borderColor: kind === 'danger' ? c.dangerInk : c.line },
        (pressed || disabled) && { opacity: 0.7 },
        style,
      ]}>
      {loading ? <ActivityIndicator color={fg} /> : (
        <View style={styles.inline}>
          {icon ? <Icon name={icon} size={18} color={fg} /> : null}
          <Text style={[TYPE.body, { color: fg, fontWeight: '600' }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

/** Round icon-only button (map controls, refresh, share). `label` is read out by screen readers. */
export function IconButton({ icon, label, onPress, active, size = 40, style }: {
  icon: IconName; label: string; onPress: () => void; active?: boolean; size?: number; style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={active === undefined ? undefined : { selected: active }}
      hitSlop={6}
      style={({ pressed }) => [
        styles.iconBtn,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: active ? c.brand : c.card, borderColor: active ? c.brand : c.line },
        pressed && { opacity: 0.7 },
        style,
      ]}>
      <Icon name={icon} size={Math.round(size * 0.5)} color={active ? c.brandInk : c.ink} />
    </Pressable>
  );
}

export function Pill({ label, icon, onPress, active, onLongPress }: { label: string; icon?: IconName; onPress: () => void; active?: boolean; onLongPress?: () => void }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      style={[styles.pill, { borderColor: active ? c.brand : c.line, backgroundColor: active ? c.brand : c.card }]}>
      {icon ? <Icon name={icon} size={16} color={active ? c.brandInk : c.muted} /> : null}
      <Text style={[TYPE.small, { color: active ? c.brandInk : c.ink, fontWeight: '600', flexShrink: 1 }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

export function Segmented<V extends string>({ value, options, onChange }: { value: V; options: { value: V; label: string }[]; onChange: (v: V) => void }) {
  const c = useColors();
  return (
    <View style={[styles.seg, { borderColor: c.line, backgroundColor: c.soft }]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={[styles.segItem, on && { backgroundColor: c.card, borderColor: c.line }]}
            accessibilityRole="button" accessibilityState={{ selected: on }}>
            <Text style={[TYPE.small, { color: on ? c.ink : c.muted, fontWeight: on ? '700' : '600' }]} numberOfLines={1}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** One line in a settings-style list: icon, title, optional detail, and something on the right. */
export function Row({ icon, title, detail, right, onPress, danger, last }: {
  icon?: IconName; title: string; detail?: string; right?: ReactNode; onPress?: () => void; danger?: boolean; last?: boolean;
}) {
  const c = useColors();
  const body = (
    <View style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }]}>
      {icon ? <View style={[styles.rowIcon, { backgroundColor: danger ? c.dangerBg : c.soft }]}><Icon name={icon} size={18} color={danger ? c.dangerInk : c.brand} /></View> : null}
      <View style={{ flex: 1 }}>
        <T color={danger ? c.dangerInk : undefined}>{title}</T>
        {detail ? <T variant="small" muted numberOfLines={2}>{detail}</T> : null}
      </View>
      {right ?? (onPress ? <Icon name="chevronRight" size={20} color={c.muted} /> : null)}
    </View>
  );
  return onPress ? <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => pressed && { opacity: 0.6 }}>{body}</Pressable> : body;
}

/** A Row with an on/off switch. */
export function SwitchRow({ icon, title, detail, value, onChange, last }: {
  icon?: IconName; title: string; detail?: string; value: boolean; onChange: (v: boolean) => void; last?: boolean;
}) {
  const c = useColors();
  return (
    <Row icon={icon} title={title} detail={detail} last={last}
      right={<Switch value={value} onValueChange={onChange} trackColor={{ true: c.brand }} accessibilityLabel={title} />} />
  );
}

/** Titled group of Rows on one card (Settings). */
export function Group({ title, footer, children }: { title: string; footer?: string; children: ReactNode }) {
  return (
    <View>
      <SectionTitle>{title}</SectionTitle>
      <Card style={{ paddingVertical: 0 }}>{children}</Card>
      {footer ? <T variant="caption" muted style={{ marginTop: SPACE.xs + 2, marginHorizontal: SPACE.xs }}>{footer}</T> : null}
    </View>
  );
}

export function Note({ children, tone = 'warn' }: { children: ReactNode; tone?: 'warn' | 'danger' | 'info' }) {
  const c = useColors();
  const bg = tone === 'danger' ? c.dangerBg : tone === 'info' ? c.soft : c.warnBg;
  const fg = tone === 'danger' ? c.dangerInk : tone === 'info' ? c.muted : c.warnInk;
  const icon: IconName = tone === 'danger' ? 'alert' : tone === 'info' ? 'info' : 'warning';
  return (
    <View style={[styles.note, { backgroundColor: bg }]}>
      <Icon name={icon} size={16} color={fg} />
      <Text style={[TYPE.small, { color: fg, flex: 1 }]}>{children}</Text>
    </View>
  );
}

export function LiveDot() {
  const c = useColors();
  return <View style={[styles.liveDot, { backgroundColor: c.live }]} accessibilityLabel="live" />;
}

/** Coloured route badge with the vehicle icon, e.g. [subway 1] in Line 1 yellow. */
export function RouteBadge({ mode, route, color, textColor }: { mode: string; route?: string | null; color?: string | null; textColor?: string | null }) {
  const c = useColors();
  const fg = color ? textColor || '#fff' : c.ink;
  return (
    <View style={[styles.chip, { backgroundColor: color || c.soft }]}>
      <Icon name={modeIconName(mode)} size={14} color={fg} />
      <Text style={[TYPE.caption, { color: fg, fontWeight: '700' }]}>{route || modeName(mode)}</Text>
    </View>
  );
}

/** A leg of a route: route badge for transit and Bike Share, "walk 4" for walking. */
export function LegChip({ leg }: { leg: Leg }) {
  const c = useColors();
  if (leg.bikeshare) {
    return (
      <View style={[styles.chip, { backgroundColor: c.bike }]}>
        <Icon name="bike" size={14} color="#fff" />
        <Text style={[TYPE.caption, { color: '#fff', fontWeight: '700' }]}>Bike Share</Text>
      </View>
    );
  }
  if (!leg.transit) {
    if (leg.mode === 'WALK' && leg.durationMin < 1) return null;
    return (
      <View style={styles.inline}>
        <Icon name={modeIconName(leg.mode)} size={15} color={c.muted} />
        <Text style={[TYPE.caption, { color: c.muted }]}>{leg.durationMin}</Text>
      </View>
    );
  }
  return <RouteBadge mode={leg.mode} route={leg.route} color={leg.color} textColor={leg.textColor} />;
}

export const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, marginBottom: SPACE.sm },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: SPACE.xl, marginBottom: SPACE.sm },
  section: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  card: { borderRadius: RADIUS.card, padding: SPACE.md },
  button: { borderRadius: RADIUS.control, minHeight: 44, paddingHorizontal: SPACE.lg, alignItems: 'center', justifyContent: 'center' },
  iconBtn: { borderWidth: 1, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 999, minHeight: 34, paddingHorizontal: SPACE.md, maxWidth: 220 },
  seg: { flexDirection: 'row', borderWidth: 1, borderRadius: RADIUS.control, padding: 2 },
  segItem: { flex: 1, minHeight: 34, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.control - 2, borderWidth: 1, borderColor: 'transparent' },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, minHeight: 52, paddingVertical: SPACE.sm },
  rowIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.sm, borderRadius: RADIUS.control, paddingVertical: SPACE.sm + 2, paddingHorizontal: SPACE.md, marginTop: SPACE.sm },
  liveDot: { width: 7, height: 7, borderRadius: 4, marginRight: 5 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: RADIUS.chip, paddingHorizontal: 6, paddingVertical: 2 },
});
