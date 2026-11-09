import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { api } from '@/lib/api';
import { useColors } from '@/lib/theme';
import type { Place } from '@/lib/types';

type Props = {
  role: 'from' | 'to';
  value: Place | null;
  placeholder: string;
  onChange: (p: Place | null) => void;
  /** extra suggestions shown when the box is empty (saved places, recents) */
  quick?: Place[];
  right?: React.ReactNode;
};

/** Address / place / stop search with suggestions from the server's geocoder. */
export function PlaceInput({ role, value, placeholder, onChange, quick = [], right }: Props) {
  const c = useColors();
  const [text, setText] = useState(value?.name ?? '');
  const [items, setItems] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  // when the chosen place changes from outside (swap, map pin, saved place), show its name
  const [shownValue, setShownValue] = useState(value);
  if (value !== shownValue) {
    setShownValue(value);
    setText(value?.name ?? '');
  }

  useEffect(() => {
    if (!open) return;
    const q = text.trim();
    if (q.length < 3 || q === value?.name) return;
    const my = ++seq.current;
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const res = await api.geocode(q);
        if (my !== seq.current) return;
        const seen = new Set<string>();
        setItems(res.filter((r) => { const k = r.name + (r.detail ?? ''); if (seen.has(k)) return false; seen.add(k); return true; }));
      } catch { /* keep typing */ } finally { if (my === seq.current) setBusy(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [text, open, value?.name]);

  const q = text.trim();
  const shown = q.length < 3 ? quick : q === value?.name ? [] : items;

  // Enter picks the first suggestion; if suggestions haven't arrived yet, look the text up right away.
  const submit = async () => {
    let pick = shown[0];
    if (!pick && q.length >= 3 && q !== value?.name) {
      try { pick = (await api.geocode(q))[0]; } catch { /* nothing found */ }
    }
    if (pick) { onChange({ name: pick.name, lat: pick.lat, lon: pick.lon }); setOpen(false); }
  };

  return (
    <View style={{ zIndex: role === 'from' ? 20 : 10 }}>
      <View style={styles.row}>
        <View style={[styles.dot, { backgroundColor: role === 'from' ? c.from : c.to, borderRadius: role === 'from' ? 5 : 2 }]} />
        <TextInput
          value={text}
          onChangeText={(t) => { setText(t); setOpen(true); if (!t) onChange(null); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          placeholder={placeholder}
          placeholderTextColor={c.muted}
          style={[styles.input, { color: c.ink }]}
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={submit}
          accessibilityLabel={role === 'from' ? 'From' : 'To'}
        />
        {busy ? <ActivityIndicator size="small" color={c.muted} /> : right}
      </View>
      {open && shown.length > 0 && (
        <View style={[styles.list, { backgroundColor: c.card, borderColor: c.line }]}>
          {shown.slice(0, 6).map((p, i) => (
            <Pressable
              key={`${p.name}-${i}`}
              onPress={() => { onChange({ name: p.name, lat: p.lat, lon: p.lon }); setOpen(false); }}
              style={({ pressed }) => [styles.item, pressed && { backgroundColor: c.soft }]}>
              <Text style={[styles.kind, { color: c.muted }]}>
                {p.type === 'STOP' ? 'Stop' : p.type === 'ADDRESS' ? 'Address' : p.type === 'SAVED' ? 'Saved' : 'Place'}
              </Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.ink }} numberOfLines={1}>{p.name}</Text>
                {p.detail ? <Text style={{ color: c.muted, fontSize: 12 }} numberOfLines={1}>{p.detail}</Text> : null}
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, minHeight: 46 },
  dot: { width: 10, height: 10 },
  input: { flex: 1, fontSize: 15, paddingVertical: 10 },
  list: { position: 'absolute', top: 46, left: 0, right: 0, borderWidth: 1, borderRadius: 10, padding: 4, zIndex: 50, elevation: 8 },
  item: { flexDirection: 'row', gap: 10, paddingVertical: 8, paddingHorizontal: 8, borderRadius: 7, alignItems: 'center' },
  kind: { width: 52, fontSize: 10, textTransform: 'uppercase', fontWeight: '600' },
});
