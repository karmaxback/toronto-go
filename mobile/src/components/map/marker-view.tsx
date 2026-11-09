import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '../icon';
import type { MapMarker } from './types';

/** What a marker looks like on the phone maps (the web draws the same thing in transit-map.web.tsx). */
export function MarkerView({ m }: { m: MapMarker }) {
  if (m.style === 'pin') {
    return (
      <View style={styles.pinWrap}>
        <Icon name="pin" size={38} color={m.color} />
        <View style={styles.pinInner}><Icon name={m.icon} size={14} color="#fff" /></View>
      </View>
    );
  }
  const size = m.size ?? 24;
  return (
    <View style={[styles.badge, { height: size, minWidth: size, borderRadius: size / 2, backgroundColor: m.color, paddingHorizontal: m.label ? 5 : 0 }]}>
      <Icon name={m.icon} size={Math.round(size * 0.62)} color="#fff" />
      {m.label ? <Text style={styles.label}>{m.label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, borderWidth: 2, borderColor: '#fff',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 3,
  },
  label: { color: '#fff', fontSize: 11, fontWeight: '700', paddingRight: 1 },
  pinWrap: { width: 38, height: 38, alignItems: 'center' },
  // white disc sits in the round head of the pin
  pinInner: { position: 'absolute', top: 6, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
});
