import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { fmtTime } from '@/lib/format';
import { useNow } from '@/lib/hooks';
import { useColors } from '@/lib/theme';

import { Pill, RADIUS, Segmented, SPACE, TYPE } from './ui';

export type WhenMode = 'now' | 'depart' | 'arrive';

const DAY = 24 * 3600_000;
const STEP = 5 * 60_000;
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const startOfDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
/** Now + 30 min, rounded up to the next 5 minutes. */
export const defaultWhen = (now = Date.now()) => new Date(Math.ceil((now + 30 * 60_000) / STEP) * STEP);

/** Leave now / Depart at / Arrive by, with day buttons and a time stepper (same on iPhone, Android and web). */
export function WhenPicker({ mode, date, onChange }: { mode: WhenMode; date: Date | null; onChange: (mode: WhenMode, date: Date | null) => void }) {
  const c = useColors();
  const now = useNow(60_000);
  const when = date ?? defaultWhen(now);
  const today = startOfDay(now);
  const dayOffset = Math.round((startOfDay(when.getTime()) - today) / DAY);
  const timeOfDay = when.getTime() - startOfDay(when.getTime());

  const setDay = (n: number) => onChange(mode, new Date(today + n * DAY + timeOfDay));
  const shift = (ms: number) => onChange(mode, new Date(when.getTime() + ms));

  return (
    <View style={{ gap: SPACE.sm }}>
      <Segmented<WhenMode>
        value={mode}
        onChange={(m) => onChange(m, m === 'now' ? null : date ?? defaultWhen())}
        options={[{ value: 'now', label: 'Leave now' }, { value: 'depart', label: 'Depart at' }, { value: 'arrive', label: 'Arrive by' }]}
      />
      {mode !== 'now' && (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SPACE.sm }}>
            {Array.from({ length: 7 }, (_, n) => (
              <Pill key={n} active={n === dayOffset} onPress={() => setDay(n)}
                label={n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : DAY_NAMES[new Date(today + n * DAY).getDay()]} />
            ))}
          </ScrollView>
          <View style={[styles.stepper, { borderColor: c.line, backgroundColor: c.card }]}>
            {[['−1h', -12 * STEP], ['−5', -STEP]].map(([label, ms]) => (
              <Pressable key={label} onPress={() => shift(ms as number)} style={[styles.step, { borderColor: c.line }]} accessibilityRole="button" accessibilityLabel={`${label} minutes`}>
                <Text style={[TYPE.small, { color: c.ink, fontWeight: '600' }]}>{label}</Text>
              </Pressable>
            ))}
            <Text style={[styles.time, { color: c.ink }]}>{mode === 'arrive' ? 'by ' : ''}{fmtTime(when.toISOString())}</Text>
            {[['+5', STEP], ['+1h', 12 * STEP]].map(([label, ms]) => (
              <Pressable key={label} onPress={() => shift(ms as number)} style={[styles.step, { borderColor: c.line }]} accessibilityRole="button" accessibilityLabel={`${label} minutes`}>
                <Text style={[TYPE.small, { color: c.ink, fontWeight: '600' }]}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: RADIUS.control, padding: SPACE.xs, gap: SPACE.xs },
  step: { borderWidth: 1, borderRadius: RADIUS.chip, minHeight: 36, minWidth: 48, alignItems: 'center', justifyContent: 'center' },
  time: { ...TYPE.heading, flex: 1, textAlign: 'center' },
});
