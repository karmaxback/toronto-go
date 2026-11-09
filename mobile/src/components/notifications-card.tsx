import { useState } from 'react';
import { StyleSheet, Switch, TextInput, View } from 'react-native';

import { usePush, type PushPrefs } from '@/lib/push';
import { useColors } from '@/lib/theme';

import type { ReactNode } from 'react';

import { getSettings } from '@/lib/settings';

import { Icon } from './icon';
import { Button, Card, Note, Pill, RADIUS, Segmented, SPACE, T, TYPE } from './ui';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const fmtDays = (d: number[]) =>
  d.join() === '1,2,3,4,5' ? 'Weekdays' : d.length === 7 ? 'Every day' : d.join() === '0,6' ? 'Weekends' : d.map((x) => DAY_NAMES[x]).join(' ');
const fmt24 = (hhmm: string) => {
  if (getSettings().clock === '24h') return hhmm;
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};

/** Settings: turn notifications on/off, weather level, followed routes, watched trips. `bare` = no card around it. */
export function NotificationsCard({ bare }: { bare?: boolean }) {
  const c = useColors();
  const push = usePush();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: 'info' | 'danger' } | null>(null);
  const [draft, setDraft] = useState<{ weather: boolean; level: PushPrefs['weatherLevel']; routes: string } | null>(null);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true); setMsg(null);
    try { await fn(); if (ok) setMsg({ text: ok, tone: 'info' }); } catch (e) { setMsg({ text: (e as Error).message, tone: 'danger' }); } finally { setBusy(false); }
  };

  const s = push.state;
  // editable copy of the saved preferences (adjusted while rendering when the server's copy changes)
  const [seen, setSeen] = useState(s);
  if (s !== seen) { setSeen(s); setDraft(null); }
  const prefs = draft ?? (s ? { weather: s.prefs.weather, level: s.prefs.weatherLevel, routes: s.prefs.routes.join(', ') } : null);

  return (
    <Frame bare={bare}>
      <View style={styles.head}>
        <Icon name="bell" size={20} color={c.brand} />
        <T variant="heading" style={{ flex: 1 }}>Trip and service alerts</T>
        {s ? <T variant="caption" bold color={c.brandInk} style={[styles.on, { backgroundColor: c.brand }]}>ON</T> : null}
      </View>

      {!s ? (
        <>
          <T muted variant="small">Get weather warnings, new alerts for your routes, and “leave now” reminders for trips you watch, even when the app is closed.</T>
          {push.unavailable ? <Note tone="info">{push.unavailable}</Note>
            : <Button title="Turn on notifications" onPress={() => run(push.enable, 'Notifications are on.')} loading={busy} style={{ marginTop: 6 }} />}
        </>
      ) : prefs && (
        <>
          <View style={styles.row}>
            <T>Weather alerts for Toronto</T>
            <Switch value={prefs.weather} onValueChange={(v) => setDraft({ ...prefs, weather: v })} trackColor={{ true: c.brand }} />
          </View>
          {prefs.weather ? (
            <Segmented<PushPrefs['weatherLevel']> value={prefs.level} onChange={(v) => setDraft({ ...prefs, level: v })} options={[
              { value: 'severe', label: 'Warnings only' }, { value: 'moderate', label: '+ Watches' }, { value: 'minor', label: 'Everything' },
            ]} />
          ) : null}
          <T style={{ marginTop: 6 }}>Routes to follow</T>
          <TextInput value={prefs.routes} onChangeText={(t) => setDraft({ ...prefs, routes: t })} placeholder="e.g. 1, 2, 504, 29, LW"
            placeholderTextColor={c.muted} autoCapitalize="characters" autoCorrect={false}
            style={[styles.input, TYPE.body, { borderColor: c.line, color: c.ink, backgroundColor: c.bg }]} />
          <T muted variant="small">Subway lines, bus or streetcar numbers, or GO lines (LW, LE, KI, BR, RH, ST, MI). You’ll get new service alerts on these.</T>
          <View style={styles.btns}>
            <Button title="Save" onPress={() => run(() => push.savePrefs({ weather: prefs.weather, weatherLevel: prefs.level, routes: prefs.routes }), 'Saved.')} loading={busy} />
            <Button title="Send test" kind="ghost" onPress={() => run(push.test, 'Test sent. It should arrive in a few seconds.')} />
            <Button title="Turn off" kind="ghost" onPress={() => run(push.disable, 'Notifications turned off.')} />
          </View>

          <T variant="small" bold muted style={{ marginTop: SPACE.md }}>WATCHED TRIPS</T>
          {s.watches.length ? s.watches.map((w) => (
            <View key={w.id} style={[styles.watch, { borderTopColor: c.line }]}>
              <View style={{ flex: 1 }}>
                <T bold>{w.name || w.to.name}</T>
                <T muted variant="small">{fmtDays(w.days)} · leave {fmt24(w.leaveAt)} · remind {w.remindMin} min before</T>
                <T muted variant="small" numberOfLines={1}>{w.from.name} → {w.to.name}</T>
              </View>
              <Pill label="Remove" onPress={() => run(() => push.removeWatch(w.id), 'Trip removed.')} />
            </View>
          )) : <T muted variant="small">None yet. Plan a trip, open a route and tap “Watch this trip”.</T>}
        </>
      )}
      {msg ? <Note tone={msg.tone}>{msg.text}</Note> : null}
    </Frame>
  );
}

function Frame({ bare, children }: { bare?: boolean; children: ReactNode }) {
  return bare ? <View style={{ gap: SPACE.sm }}>{children}</View> : <Card style={{ gap: SPACE.sm }}>{children}</Card>;
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  on: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 5, overflow: 'hidden' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  input: { borderWidth: 1, borderRadius: RADIUS.control, paddingHorizontal: SPACE.md, minHeight: 44 },
  btns: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  watch: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1 },
});
