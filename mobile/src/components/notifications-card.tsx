import { useState } from 'react';
import { StyleSheet, Switch, TextInput, View } from 'react-native';

import { usePush, type PushPrefs } from '@/lib/push';
import { useColors } from '@/lib/theme';

import { Button, Card, Note, Pill, Segmented, SectionTitle, T } from './ui';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const fmtDays = (d: number[]) =>
  d.join() === '1,2,3,4,5' ? 'Weekdays' : d.length === 7 ? 'Every day' : d.join() === '0,6' ? 'Weekends' : d.map((x) => DAY_NAMES[x]).join(' ');
const fmt24 = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};

/** Alerts tab: turn notifications on/off, weather level, followed routes, watched trips. */
export function NotificationsCard() {
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
    <Card style={{ gap: 6 }}>
      <View style={styles.head}>
        <T bold size={15}>🔔 Notifications</T>
        {s ? <T size={11} bold color={c.brandInk} style={[styles.on, { backgroundColor: c.brand }]}>ON</T> : null}
      </View>

      {!s ? (
        <>
          <T muted size={13}>Get weather warnings, new alerts for your routes, and “leave now” reminders for trips you watch, even when the app is closed.</T>
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
            style={[styles.input, { borderColor: c.line, color: c.ink, backgroundColor: c.bg }]} />
          <T muted size={12}>Subway lines, bus or streetcar numbers, or GO lines (LW, LE, KI, BR, RH, ST, MI). You’ll get new service alerts on these.</T>
          <View style={styles.btns}>
            <Button title="Save" onPress={() => run(() => push.savePrefs({ weather: prefs.weather, weatherLevel: prefs.level, routes: prefs.routes }), 'Saved.')} loading={busy} />
            <Button title="Send test" kind="ghost" onPress={() => run(push.test, 'Test sent. It should arrive in a few seconds.')} />
            <Button title="Turn off" kind="ghost" onPress={() => run(push.disable, 'Notifications turned off.')} />
          </View>

          <SectionTitle>Watched trips</SectionTitle>
          {s.watches.length ? s.watches.map((w) => (
            <View key={w.id} style={[styles.watch, { borderTopColor: c.line }]}>
              <View style={{ flex: 1 }}>
                <T bold>{w.name || w.to.name}</T>
                <T muted size={12}>{fmtDays(w.days)} · leave {fmt24(w.leaveAt)} · remind {w.remindMin} min before</T>
                <T muted size={12} numberOfLines={1}>{w.from.name} → {w.to.name}</T>
              </View>
              <Pill label="Remove" onPress={() => run(() => push.removeWatch(w.id), 'Trip removed.')} />
            </View>
          )) : <T muted size={13}>None yet. Plan a trip, open a route and tap “Watch this trip”.</T>}
        </>
      )}
      {msg ? <Note tone={msg.tone}>{msg.text}</Note> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  on: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 5, overflow: 'hidden' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  input: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14 },
  btns: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  watch: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1 },
});
