import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { usePush } from '@/lib/push';
import { useColors } from '@/lib/theme';
import type { Place } from '@/lib/types';

import { Button, Note, Pill, T } from './ui';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const torontoHHMM = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
const shiftHHMM = (hhmm: string, mins: number) => {
  const [h, m] = hhmm.split(':').map(Number);
  const t = (((h * 60 + m + mins) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};
const fmt12 = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};

/** "Watch this trip": repeat days, leave time and reminder; saves to the server for push notifications. */
export function WatchForm({ from, to, startIso, pref, accessible, onDone }: {
  from: Place; to: Place; startIso: string; pref: string; accessible: boolean; onDone: (msg: string) => void;
}) {
  const c = useColors();
  const push = usePush();
  const [weekday] = useState(() => new Date().getDay());
  const [name, setName] = useState(to.name);
  const [leaveAt, setLeaveAt] = useState(() => torontoHHMM(startIso));
  const [days, setDays] = useState<number[]>(weekday >= 1 && weekday <= 5 ? [1, 2, 3, 4, 5] : [weekday]);
  const [remind, setRemind] = useState(10);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!days.length) { setErr('Pick at least one day.'); return; }
    setBusy(true); setErr(null);
    try {
      if (!push.state) await push.enable();
      await push.addWatch({ name, leaveAt, days: [...days].sort(), remindMin: remind, from, to, pref, accessible });
      onDone(`Watching “${name}”. Manage it in the Alerts tab.`);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <View style={[styles.box, { backgroundColor: c.soft }]}>
      <T bold>🔔 Watch this trip</T>
      <T muted size={12}>A heads-up about 40 min before if there’s a disruption, delay or bad weather, a reminder when it’s time to leave, and an update if the delay changes.</T>
      <TextInput value={name} onChangeText={setName} placeholder="Name (e.g. Work)" placeholderTextColor={c.muted} maxLength={60}
        style={[styles.input, { borderColor: c.line, color: c.ink, backgroundColor: c.card }]} />
      <View style={styles.row}>
        <T style={{ width: 70 }}>Leave at</T>
        {[-15, -5].map((d) => <Step key={d} label={String(d)} onPress={() => setLeaveAt(shiftHHMM(leaveAt, d))} />)}
        <T bold size={16} style={{ flex: 1, textAlign: 'center' }}>{fmt12(leaveAt)}</T>
        {[5, 15].map((d) => <Step key={d} label={`+${d}`} onPress={() => setLeaveAt(shiftHHMM(leaveAt, d))} />)}
      </View>
      <View style={styles.days}>
        {DAY_NAMES.map((d, i) => (
          <Pill key={d} label={d} active={days.includes(i)} onPress={() => setDays(days.includes(i) ? days.filter((x) => x !== i) : [...days, i])} />
        ))}
      </View>
      <View style={styles.days}>
        <T style={{ width: 70 }}>Remind</T>
        {[5, 10, 15, 20, 30].map((m) => <Pill key={m} label={`${m} min`} active={remind === m} onPress={() => setRemind(m)} />)}
      </View>
      {push.unavailable && !push.state ? <Note tone="info">{push.unavailable}</Note> : null}
      {err ? <Note tone="danger">{err}</Note> : null}
      <Button title="Save" onPress={save} loading={busy} disabled={Boolean(push.unavailable && !push.state)} style={{ marginTop: 6 }} />
    </View>
  );
}

function Step({ label, onPress }: { label: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} style={[styles.step, { borderColor: c.line, backgroundColor: c.card }]} accessibilityRole="button" accessibilityLabel={`${label} minutes`}>
      <Text style={{ color: c.ink, fontWeight: '600', fontSize: 12.5 }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { marginTop: 10, borderRadius: 10, padding: 10, gap: 6 },
  input: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  days: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, alignItems: 'center' },
  step: { borderWidth: 1, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 5 },
});
