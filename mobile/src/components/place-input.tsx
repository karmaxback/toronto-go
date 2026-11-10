import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { api } from '@/lib/api';
import type { IconName } from '@/lib/icons';
import { useColors } from '@/lib/theme';
import type { Place } from '@/lib/types';

import { Icon } from './icon';
import { RADIUS, SPACE, TYPE } from './ui';

const suggestionIcon = (p: Place): IconName =>
  p.type === 'SAVED' ? (p.detail === 'Home' ? 'home' : p.detail === 'Work' ? 'work' : 'history') : p.type === 'STOP' ? 'bus' : 'pin';

type Props = {
  role: 'from' | 'to';
  value: Place | null;
  placeholder: string;
  onChange: (p: Place | null) => void;
  /** extra suggestions shown when the box is empty (saved places, recents) */
  quick?: Place[];
  right?: React.ReactNode;
  /** rank results near here (trip start, or the user's location) */
  near?: { lat: number; lon: number } | null;
};

/** Address / place / stop search with suggestions from the server's geocoder. */
export function PlaceInput({ role, value, placeholder, onChange, quick = [], right, near }: Props) {
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
    const show = (res: Place[]) => {
      if (my !== seq.current) return;
      const seen = new Set<string>();
      setItems(res.filter((r) => { const k = r.name + (r.detail ?? ''); if (seen.has(k)) return false; seen.add(k); return true; }));
    };
    // quick free search while typing; a fuller one (may ask Google) once typing pauses
    const t = setTimeout(async () => {
      setBusy(true);
      try { show(await api.geocode(q, near)); } catch { /* keep typing */ } finally { if (my === seq.current) setBusy(false); }
    }, 300);
    const t2 = setTimeout(async () => {
      try { show(await api.geocode(q, near, true)); } catch { /* keep the quick results */ }
    }, 1200);
    return () => { clearTimeout(t); clearTimeout(t2); };
  }, [text, open, value?.name, near]);

  const q = text.trim();
  const shown = q.length < 3 ? quick : q === value?.name ? [] : items;

  // Enter picks the first suggestion; if suggestions haven't arrived yet, look the text up right away.
  const submit = async () => {
    let pick = shown[0];
    if (!pick && q.length >= 3 && q !== value?.name) {
      try { pick = (await api.geocode(q, near, true))[0]; } catch { /* nothing found */ }
    }
    if (pick) { onChange({ name: pick.name, lat: pick.lat, lon: pick.lon }); setOpen(false); }
  };

  return (
    <View style={{ zIndex: role === 'from' ? 20 : 10 }}>
      <View style={styles.row}>
        <Icon name={role === 'from' ? 'location' : 'flag'} size={18} color={role === 'from' ? c.from : c.to} />
        <TextInput
          value={text}
          onChangeText={(t) => { setText(t); setOpen(true); if (!t) onChange(null); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          placeholder={placeholder}
          placeholderTextColor={c.muted}
          style={[styles.input, TYPE.body, { color: c.ink }]}
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
              <Icon name={suggestionIcon(p)} size={18} color={c.muted} />
              <View style={{ flex: 1 }}>
                <Text style={[TYPE.body, { color: c.ink }]} numberOfLines={1}>{p.name}</Text>
                <Text style={[TYPE.caption, { color: c.muted }]} numberOfLines={1}>
                  {[p.type === 'SAVED' ? null : p.kind ?? (p.type === 'STOP' ? 'Stop' : p.type === 'ADDRESS' ? 'Address' : 'Place'),
                    p.detail, p.distanceKm != null ? `${p.distanceKm} km away` : ''].filter(Boolean).join(' · ')}
                </Text>
              </View>
            </Pressable>
          ))}
          {shown.slice(0, 6).some((p) => p.attribution) ? (
            <Text style={[TYPE.caption, styles.credit, { color: c.muted }]}>Some results from Google Maps</Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  credit: { textAlign: 'right', paddingHorizontal: 12, paddingVertical: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm + 2, paddingHorizontal: SPACE.md, minHeight: 52 },
  input: { flex: 1, paddingVertical: SPACE.sm + 2 },
  list: { position: 'absolute', top: 52, left: 0, right: 0, borderWidth: 1, borderRadius: RADIUS.control, padding: SPACE.xs, zIndex: 50, elevation: 8 },
  item: { flexDirection: 'row', gap: SPACE.md, minHeight: 48, paddingVertical: SPACE.sm, paddingHorizontal: SPACE.sm, borderRadius: RADIUS.chip, alignItems: 'center' },
});
