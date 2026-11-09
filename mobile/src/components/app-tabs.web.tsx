import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions, type PressableProps } from 'react-native';

import type { IconName } from '@/lib/icons';
import { useColors } from '@/lib/theme';

import { Icon } from './icon';
import { TYPE } from './ui';

const TABS: { name: string; href: '/' | '/nearby' | '/airport' | '/alerts' | '/settings'; label: string; icon: IconName }[] = [
  { name: 'index', href: '/', label: 'Plan', icon: 'map' },
  { name: 'nearby', href: '/nearby', label: 'Nearby', icon: 'location' },
  { name: 'airport', href: '/airport', label: 'Airport', icon: 'plane' },
  { name: 'alerts', href: '/alerts', label: 'Alerts', icon: 'warning' },
  { name: 'settings', href: '/settings', label: 'Settings', icon: 'cog' },
];

/** Web: on wide screens a top bar with the app name; on phone-width screens a bottom tab bar like the apps. */
export default function AppTabs() {
  const c = useColors();
  const narrow = useWindowDimensions().width < 700;
  const triggers = TABS.map((t) => (
    <TabTrigger key={t.name} name={t.name} href={t.href} asChild>
      <TabButton icon={t.icon} narrow={narrow}>{t.label}</TabButton>
    </TabTrigger>
  ));
  return (
    <Tabs style={{ flex: 1, backgroundColor: c.bg }}>
      {narrow ? null : (
        <TabList style={StyleSheet.flatten([styles.top, { backgroundColor: c.panel, borderBottomColor: c.line }])}>
          <View style={styles.brand}>
            <Image source={require('@/assets/images/favicon.png')} style={styles.logo} accessibilityIgnoresInvertColors />
            <Text style={[TYPE.heading, { color: c.ink }]}>Toronto Move</Text>
          </View>
          <View style={styles.row}>{triggers}</View>
        </TabList>
      )}
      <TabSlot style={{ flex: 1 }} />
      {narrow ? (
        <TabList style={StyleSheet.flatten([styles.bottom, { backgroundColor: c.panel, borderTopColor: c.line }])}>{triggers}</TabList>
      ) : null}
    </Tabs>
  );
}

function TabButton({ children, icon, narrow, isFocused, ref: _ref, ...props }: TabTriggerSlotProps & { icon: IconName; narrow: boolean }) {
  const c = useColors();
  const color = isFocused ? c.brand : c.muted;
  if (narrow) {
    return (
      <Pressable {...(props as PressableProps)} style={styles.bottomTab}>
        <Icon name={icon} size={24} color={color} />
        <Text style={[TYPE.caption, { color, fontWeight: '600' }]}>{children}</Text>
      </Pressable>
    );
  }
  return (
    <Pressable {...(props as PressableProps)} style={StyleSheet.flatten([styles.topTab, { borderBottomColor: isFocused ? c.brand : 'transparent' }])}>
      <Icon name={icon} size={18} color={color} />
      <Text style={[TYPE.small, { color: isFocused ? c.ink : c.muted, fontWeight: '600' }]}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderBottomWidth: 1 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  logo: { width: 32, height: 32, borderRadius: 8 },
  row: { flexDirection: 'row', gap: 4 },
  topTab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 14, paddingHorizontal: 12, borderBottomWidth: 2.5 },
  bottom: { flexDirection: 'row', borderTopWidth: 1, paddingBottom: 4 },
  bottomTab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, paddingTop: 8, paddingBottom: 6 },
});
