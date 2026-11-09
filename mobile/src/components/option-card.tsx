import { Fragment } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { cleanHeadsign, delayText, durLabel, fareText, fmtTime, minsUntil, modeName, money, plural } from '@/lib/format';
import { useColors } from '@/lib/theme';
import type { Leg, Option } from '@/lib/types';

import { Card, LegChip, LiveDot, T } from './ui';

/** One route option: summary always, step-by-step when selected. */
export function OptionCard({ o, selected, onPress, destName }: { o: Option; selected: boolean; onPress: () => void; destName: string }) {
  const c = useColors();
  const first = o.legs.find((l) => l.transit);
  const leaveMins = minsUntil(o.start);
  const title = o.kind === 'transit' ? '' : `${o.kind === 'bikeshare' ? 'Bike Share' : modeName(o.kind.toUpperCase())} · `;
  const elevators = (o.accessIssues ?? []).filter((a) => a.kind === 'elevator');
  const chips = o.legs.map((l, i) => ({ l, i })).filter(({ l }) => l.transit || l.bikeshare || l.durationMin >= 1);

  return (
    <Card selected={selected} onPress={onPress} style={{ marginTop: 10 }}>
      {(o.tags?.length ?? 0) > 0 && (
        <View style={styles.tags}>
          {o.tags!.map((t) => (
            <Text key={t} style={[styles.tag, t === 'Recommended' ? { backgroundColor: c.brand, color: c.brandInk } : { backgroundColor: c.soft, color: c.muted }]}>{t}</Text>
          ))}
        </View>
      )}
      <View style={styles.head}>
        <T bold size={15.5}>{title}{fmtTime(o.start)} – {fmtTime(o.end)}</T>
        <View style={{ alignItems: 'flex-end' }}>
          <T bold size={15.5}>{durLabel(o.durationMin)}</T>
          {o.fare ? <T muted size={12.5} bold>{fareText(o.fare)}</T> : null}
        </View>
      </View>

      <View style={styles.meta}>
        {first ? (
          <>
            <View style={styles.inline}>
              {first.live ? <LiveDot /> : null}
              <T bold color={first.live ? c.live : c.ink} size={13}>{leaveMins <= 0 ? 'Leave now' : `Leave in ${durLabel(leaveMins)}`}</T>
            </View>
            <T muted size={12.5}>
              {modeName(first.mode)} {first.route ?? ''} at {fmtTime(first.live?.time || first.start)} · {first.live ? delayText(first.live.delayMin) : 'scheduled'}
            </T>
          </>
        ) : o.bikeshare ? (
          <>
            <View style={styles.inline}><LiveDot /><T bold color={c.live} size={13}>{plural(o.bikeshare.from.bikes, 'bike')} at {o.bikeshare.from.name}</T></View>
            <T muted size={12.5}>{plural(o.bikeshare.to.docks, 'free dock')} at {o.bikeshare.to.name}</T>
          </>
        ) : (
          <T bold size={13}>Leave any time</T>
        )}
        {o.kind === 'transit' ? <T muted size={12.5}>{plural(o.transfers, 'transfer')} · {o.walkMin} min walk</T> : null}
      </View>

      <View style={styles.chips}>
        {chips.map(({ l, i }, k) => (
          <Fragment key={i}>
            {k > 0 ? <Text style={{ color: c.muted }}>›</Text> : null}
            <LegChip leg={l} />
          </Fragment>
        ))}
      </View>

      {(o.warnings ?? []).map((w) => <T key={w} size={12.5} color={c.warnInk} style={{ marginTop: 6 }}>⚠ {w}</T>)}
      {elevators.length > 0 && (
        <T size={12.5} color={c.dangerInk} style={{ marginTop: 6 }}>♿ Elevator out at {[...new Set(elevators.map((a) => a.station))].join(', ')}</T>
      )}

      {selected && <Steps o={o} destName={destName} />}
    </Card>
  );
}

function Steps({ o, destName }: { o: Option; destName: string }) {
  const c = useColors();
  return (
    <View style={[styles.steps, { borderTopColor: c.line }]}>
      {o.legs.map((l, i) => <Step key={i} l={l} o={o} />)}
      <View style={styles.step}>
        <Text style={[styles.time, { color: c.ink, fontWeight: '700' }]}>{fmtTime(o.end)}</Text>
        <View style={styles.barCol} />
        <T bold style={{ flex: 1 }}>Arrive · {destName}</T>
      </View>
      {o.approximate ? <T muted size={12} style={{ marginTop: 6 }}>Times are estimated from distance; bike and dock counts are live.</T> : null}
      {o.fare ? (
        <View style={[styles.fare, { backgroundColor: c.soft }]}>
          <T bold>Fare {fareText(o.fare)}{o.fare.rider && o.fare.rider !== 'adult' ? ` (${o.fare.rider})` : ''}</T>
          {o.fare.items.map((it) => (
            <T key={it.label} size={12.5}>
              {it.label}: <Text style={{ fontWeight: '700' }}>{it.amount == null ? 'not included' : it.amount === 0 ? 'free' : money(it.amount)}</Text>
              {it.note ? <Text style={{ color: c.muted }}> · {it.note}</Text> : null}
            </T>
          ))}
          {o.fare.note ? <T muted size={11.5}>{o.fare.note}</T> : null}
        </View>
      ) : null}
    </View>
  );
}

function Step({ l, o }: { l: Leg; o: Option }) {
  const c = useColors();
  if (l.bikeshare && o.bikeshare) {
    const bs = o.bikeshare;
    return (
      <View style={styles.step}>
        <Text style={[styles.time, { color: c.muted }]}>{fmtTime(l.start)}</Text>
        <View style={styles.barCol}><View style={[styles.bar, { backgroundColor: c.bike }]} /></View>
        <View style={styles.body}>
          <T bold>{bs.from.name}</T>
          <View style={styles.inline}><LegChip leg={l} /><Text> </Text><LiveDot /><T muted size={12.5}>{plural(bs.from.bikes, 'bike')} now{bs.from.ebikes ? `, ${plural(bs.from.ebikes, 'e-bike')}` : ''}</T></View>
          <T muted size={12.5}>Ride about {l.durationMin} min · dock at {bs.to.name} ({plural(bs.to.docks, 'free dock')} now)</T>
          {bs.alternatives?.from.length ? <T muted size={12}>If empty: {bs.alternatives.from.map((s) => `${s.name} (${s.bikes} bikes, ${s.distanceM} m)`).join(', ')}</T> : null}
        </View>
      </View>
    );
  }
  if (!l.transit) {
    if (l.durationMin < 1) return null;
    const dist = l.distanceM ? ` · ${l.distanceM >= 1000 ? `${(l.distanceM / 1000).toFixed(1)} km` : `${l.distanceM} m`}` : '';
    return (
      <View style={styles.step}>
        <Text style={[styles.time, { color: c.muted }]}>{fmtTime(l.start)}</Text>
        <View style={styles.barCol}><View style={[styles.dashed, { borderColor: c.muted }]} /></View>
        <View style={styles.body}>
          <T>{modeName(l.mode)} {l.durationMin} min{dist}</T>
          <T muted size={12.5}>to {l.to.name === 'END' ? 'destination' : l.to.name}</T>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.step}>
      <Text style={[styles.time, { color: c.muted }]}>{fmtTime(l.live?.time || l.start)}</Text>
      <View style={styles.barCol}><View style={[styles.bar, { backgroundColor: l.color || '#888' }]} /></View>
      <View style={styles.body}>
        <T bold>{l.from.name}{l.from.track ? ` · Platform ${l.from.track}` : ''}</T>
        <View style={[styles.inline, { marginVertical: 2 }]}><LegChip leg={l} /><T style={{ flex: 1, marginLeft: 6 }} numberOfLines={2}>{cleanHeadsign(l.headsign) || l.routeName || ''}</T></View>
        {l.live ? (
          <View style={styles.inline}><LiveDot /><T size={12.5} color={c.live}>Live: departs {fmtTime(l.live.time)} ({delayText(l.live.delayMin)})</T></View>
        ) : <T muted size={12.5}>Scheduled time</T>}
        <T muted size={12.5}>{l.durationMin} min{l.stops ? ` · ${l.stops} stops` : ''} · get off at {l.to.name} ({fmtTime(l.end)})</T>
        {l.alerts.map((a) => (
          <Text key={a.id} style={[styles.alert, { backgroundColor: a.serious ? c.dangerBg : c.warnBg, color: a.serious ? c.dangerInk : c.warnInk }]}>{a.header}</Text>
        ))}
        {(l.access ?? []).map((a) => (
          <Text key={a.header} style={[styles.alert, { backgroundColor: a.kind === 'elevator' ? c.dangerBg : c.warnBg, color: a.kind === 'elevator' ? c.dangerInk : c.warnInk }]}>♿ {a.header}</Text>
        ))}
        {l.agency && ['TTC', 'GO Transit', 'UP Express'].includes(l.agency) ? (
          <Text onPress={() => Linking.openURL(l.agency === 'TTC' ? 'https://www.ttc.ca/Fares-and-passes' : l.agency === 'UP Express' ? 'https://www.upexpress.com/fares' : 'https://www.gotransit.com/en/trip-planning/fares')} style={{ color: c.brand, fontSize: 12.5, marginTop: 3 }}>{l.agency} fares</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 6 },
  tag: { fontSize: 11, fontWeight: '700', paddingHorizontal: 7, paddingVertical: 1, borderRadius: 5, overflow: 'hidden' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  meta: { marginTop: 4, gap: 2 },
  inline: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5, marginTop: 9 },
  steps: { marginTop: 12, borderTopWidth: 1, paddingTop: 10 },
  step: { flexDirection: 'row', gap: 8, minHeight: 34 },
  time: { width: 62, textAlign: 'right', fontSize: 12.5, paddingTop: 1 },
  barCol: { width: 12, alignItems: 'center' },
  bar: { width: 4, flex: 1, borderRadius: 2, marginTop: 4, marginBottom: -4 },
  dashed: { width: 0, flex: 1, borderLeftWidth: 2, borderStyle: 'dashed', marginTop: 4, opacity: 0.6 },
  body: { flex: 1, paddingBottom: 12 },
  alert: { fontSize: 12, marginTop: 4, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 6, overflow: 'hidden' },
  fare: { marginTop: 10, padding: 10, borderRadius: 9, gap: 2 },
});
