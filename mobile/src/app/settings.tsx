import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { Alert, Linking, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NotificationsCard } from '@/components/notifications-card';
import { PlaceInput } from '@/components/place-input';
import { Group, IconButton, Note, Row, ScreenHeader, Segmented, SPACE, SwitchRow, T, page } from '@/components/ui';
import { webBase } from '@/lib/config';
import { getMyLocation, hasLocationPermission } from '@/lib/location';
import { resetSettings, setSetting, useSettings, type Clock, type Pref, type Rider, type ThemeChoice } from '@/lib/settings';
import { removeStored, useStored, type SavedPlaces } from '@/lib/storage';
import { useColors } from '@/lib/theme';
import type { Place } from '@/lib/types';

const APP_NAME = Constants.expoConfig?.name ?? 'Toronto Move';
const VERSION = Constants.expoConfig?.version ?? '';

export default function SettingsScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const s = useSettings();
  const [saved, setSaved] = useStored<SavedPlaces>('saved', {});
  const [recent, setRecent] = useStored<Place[]>('recent', []);
  const [editing, setEditing] = useState<'Home' | 'Work' | null>(null);
  const [locOk, setLocOk] = useState<boolean | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => { hasLocationPermission().then(setLocOk); }, []);

  const setPlace = (k: 'Home' | 'Work', p: Place | null) => {
    const next = { ...saved };
    if (p) next[k] = p; else delete next[k];
    setSaved(next);
    setEditing(null);
  };

  const askLocation = () => {
    if (locOk === false && Platform.OS !== 'web') { Linking.openSettings(); return; }
    getMyLocation().then(() => setLocOk(true), (e: Error) => { setLocOk(false); setMessage(e.message); });
  };

  const reset = () => {
    const doIt = async () => {
      await resetSettings();
      await Promise.all(['saved', 'recent'].map(removeStored));
      setMessage('Settings and saved places were reset.');
    };
    const text = 'This resets all settings and forgets Home, Work and recent places on this device. Notifications stay as they are.';
    if (Platform.OS === 'web') { if (window.confirm(text)) doIt(); return; }
    Alert.alert('Reset app?', text, [{ text: 'Cancel', style: 'cancel' }, { text: 'Reset', style: 'destructive', onPress: doIt }]);
  };

  return (
    <ScrollView style={{ backgroundColor: c.bg }} keyboardShouldPersistTaps="handled"
      contentContainerStyle={[page, { paddingTop: insets.top + SPACE.lg, paddingBottom: insets.bottom + 40 }]}>
      <ScreenHeader title="Settings" />
      {message ? <Note tone="info">{message}</Note> : null}

      <Group title="Notifications">
        <View style={{ paddingVertical: SPACE.md }}><NotificationsCard bare /></View>
      </Group>

      <Group title="Saved places" footer="Home and Work appear as shortcuts on Plan. Home powers “Next way home”.">
        {(['Home', 'Work'] as const).map((k) => editing === k ? (
          <View key={k} style={[styles.edit, { borderBottomColor: c.line }]}>
            <View style={{ flex: 1 }}>
              <PlaceInput role="to" value={null} onChange={(p) => { if (p) setPlace(k, p); }} placeholder={`Search for your ${k.toLowerCase()} address`} />
            </View>
            <IconButton icon="close" label="Cancel" size={34} onPress={() => setEditing(null)} />
          </View>
        ) : (
          <Row key={k} icon={k === 'Home' ? 'home' : 'work'} title={k} detail={saved[k]?.name ?? 'Not set: tap to choose'} onPress={() => setEditing(k)}
            right={saved[k] ? <IconButton icon="trash" label={`Remove ${k}`} size={34} onPress={() => setPlace(k, null)} /> : undefined} />
        ))}
        <Row icon="history" title="Recent places" detail={recent.length ? recent.map((r) => r.name).join(', ') : 'None'} last
          right={recent.length ? <IconButton icon="trash" label="Clear recent places" size={34} onPress={() => setRecent([])} /> : undefined} />
      </Group>

      <Group title="Trip preferences" footer="Used for every trip. You can also change them for one trip under “Trip options” on Plan.">
        <View style={styles.block}>
          <T variant="small" muted>Route choice</T>
          <Segmented<Pref> value={s.pref} onChange={(v) => setSetting('pref', v)} options={[
            { value: 'balanced', label: 'Best' }, { value: 'fastest', label: 'Fastest' },
            { value: 'fewer_transfers', label: 'Transfers' }, { value: 'less_walking', label: 'Walking' },
          ]} />
          <T variant="small" muted style={{ marginTop: SPACE.sm }}>Fares for</T>
          <Segmented<Rider> value={s.rider} onChange={(v) => setSetting('rider', v)} options={[
            { value: 'adult', label: 'Adult' }, { value: 'youth', label: 'Youth' }, { value: 'senior', label: 'Senior' }, { value: 'child', label: 'Child' },
          ]} />
        </View>
        <SwitchRow icon="wheelchair" title="Step-free / wheelchair" detail="Avoid stairs and warn about elevator outages" value={s.accessible} onChange={(v) => setSetting('accessible', v)} />
        <SwitchRow icon="coach" title="Intercity coaches" detail="Include coach companies like FlixBus" value={s.coach} onChange={(v) => setSetting('coach', v)} last />
      </Group>

      <Group title="Also suggest">
        <SwitchRow icon="bike" title="Bike Share" detail="Live bikes and docks at both ends" value={s.showBikeShare} onChange={(v) => setSetting('showBikeShare', v)} />
        <SwitchRow icon="bike" title="Cycling" detail="Your own bike" value={s.showCycling} onChange={(v) => setSetting('showCycling', v)} />
        <SwitchRow icon="car" title="Driving" value={s.showDriving} onChange={(v) => setSetting('showDriving', v)} last />
      </Group>

      <Group title="Map">
        <SwitchRow icon="bus" title="Live TTC vehicles" detail="Buses, streetcars and trains moving on the map" value={s.mapVehicles} onChange={(v) => setSetting('mapVehicles', v)} />
        <SwitchRow icon="bike" title="Bike Share stations" detail="With live bike counts" value={s.mapBikes} onChange={(v) => setSetting('mapBikes', v)} last />
      </Group>

      <Group title="Display">
        <View style={styles.block}>
          <T variant="small" muted>Appearance</T>
          <Segmented<ThemeChoice> value={s.theme} onChange={(v) => setSetting('theme', v)} options={[
            { value: 'system', label: 'Automatic' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' },
          ]} />
          <T variant="small" muted style={{ marginTop: SPACE.sm }}>Clock</T>
          <Segmented<Clock> value={s.clock} onChange={(v) => setSetting('clock', v)} options={[
            { value: '12h', label: '6:40 pm' }, { value: '24h', label: '18:40' },
          ]} />
        </View>
        <SwitchRow icon="refresh" title="Refresh live times" detail="Update routes on Plan every minute" value={s.autoRefresh} onChange={(v) => setSetting('autoRefresh', v)} last />
      </Group>

      <Group title="Location" footer="Used only to plan from where you are and show what’s nearby. Never stored.">
        <Row icon="gps" title="Location access" last
          detail={locOk === null ? 'Checking…' : locOk ? 'Allowed while using the app' : 'Not allowed: you can still type addresses'}
          right={locOk ? undefined : <T variant="small" bold color={c.brand} style={styles.link} onPress={askLocation}>{locOk === false && Platform.OS !== 'web' ? 'Open settings' : 'Allow'}</T>} />
      </Group>

      <Group title="About">
        <Row icon="info" title={APP_NAME} detail={`Version ${VERSION}`} />
        <Row icon="shield" title="Privacy policy" onPress={() => Linking.openURL(`${webBase()}/privacy`)} />
        <Row icon="help" title="Contact & support" onPress={() => Linking.openURL(`${webBase()}/support`)} last />
      </Group>
      <T variant="caption" muted style={{ marginTop: SPACE.sm, marginHorizontal: SPACE.xs }}>
        Transit data: TTC, Metrolinx, Bike Share Toronto. Weather: Environment and Climate Change Canada. Routing: Transitous.
        Maps and places © OpenStreetMap contributors. {APP_NAME} is independent and not affiliated with the TTC, Metrolinx or GO Transit.
      </T>

      <Group title="Reset">
        <Row icon="trash" title="Reset settings and saved places" danger last onPress={reset} />
      </Group>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  block: { paddingVertical: SPACE.md, gap: SPACE.xs + 2 },
  edit: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, paddingVertical: SPACE.sm, borderBottomWidth: StyleSheet.hairlineWidth, zIndex: 10 },
  link: { paddingVertical: SPACE.sm, paddingLeft: SPACE.sm },
});
