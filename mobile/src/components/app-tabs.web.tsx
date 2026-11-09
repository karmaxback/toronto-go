import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, StyleSheet, Text, View, type PressableProps } from 'react-native';

import { useColors } from '@/lib/theme';

/** Web: brand + tab buttons in a top bar, screen below. */
export default function AppTabs() {
  const c = useColors();
  return (
    <Tabs style={{ flex: 1, backgroundColor: c.bg }}>
      <TabList style={StyleSheet.flatten([styles.bar, { backgroundColor: c.panel, borderBottomColor: c.line }])}>
        <View style={styles.brand}>
          <View style={[styles.logo, { backgroundColor: c.brand }]}><Text style={{ fontSize: 16 }}>🚇</Text></View>
          <Text style={[styles.brandText, { color: c.ink }]}>Toronto Go</Text>
        </View>
        <View style={styles.tabs}>
          <TabTrigger name="index" href="/" asChild><TabButton>Plan</TabButton></TabTrigger>
          <TabTrigger name="nearby" href="/nearby" asChild><TabButton>Nearby</TabButton></TabTrigger>
          <TabTrigger name="airport" href="/airport" asChild><TabButton>Airport</TabButton></TabTrigger>
          <TabTrigger name="alerts" href="/alerts" asChild><TabButton>Alerts</TabButton></TabTrigger>
        </View>
      </TabList>
      <TabSlot style={{ flex: 1 }} />
    </Tabs>
  );
}

function TabButton({ children, isFocused, ref: _ref, ...props }: TabTriggerSlotProps) {
  const c = useColors();
  return (
    <Pressable {...(props as PressableProps)} style={StyleSheet.flatten([styles.tab, { borderBottomColor: isFocused ? c.brand : 'transparent' }])}>
      <Text style={{ color: isFocused ? c.ink : c.muted, fontWeight: '600', fontSize: 14 }}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', paddingHorizontal: 16, borderBottomWidth: 1, gap: 8 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  logo: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  brandText: { fontSize: 17, fontWeight: '700' },
  tabs: { flexDirection: 'row', gap: 4 },
  tab: { paddingVertical: 12, paddingHorizontal: 10, borderBottomWidth: 2.5 },
});
