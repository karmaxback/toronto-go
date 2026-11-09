import { NativeTabs } from 'expo-router/native-tabs';

import { useColors } from '@/lib/theme';

/** Native tab bar (iOS / Android). The web version is app-tabs.web.tsx. */
export default function AppTabs() {
  const c = useColors();
  return (
    <NativeTabs backgroundColor={c.panel} indicatorColor={c.soft} labelStyle={{ selected: { color: c.brand } }} tintColor={c.brand}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Plan</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="map" md="map" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="nearby">
        <NativeTabs.Trigger.Label>Nearby</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="location.circle" md="near_me" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="airport">
        <NativeTabs.Trigger.Label>Airport</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="airplane" md="flight" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="alerts">
        <NativeTabs.Trigger.Label>Alerts</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="exclamationmark.triangle" md="warning" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
