import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInRight, LinearTransition, useReducedMotion } from 'react-native-reanimated';

import { dayTimeLabel, fmtTime } from '@/lib/format';
import { useNow } from '@/lib/hooks';
import { useColors } from '@/lib/theme';
import type { WeatherAlert, WeatherData } from '@/lib/types';
import { conditionIcon, isNight, PRECIP_ICON, upcomingLabel } from '@/lib/weather-ui';

import { Icon } from './icon';
import { Card, RADIUS, SPACE, T } from './ui';
import { WeatherBackdrop, WeatherScene } from './weather-scene';

/** Cards slide up one after another when the tab opens. */
const enter = (i: number) => FadeInDown.delay(i * 70).duration(380);
const pulse = { '0%': { transform: [{ scale: 1 }] }, '50%': { transform: [{ scale: 1.18 }] }, '100%': { transform: [{ scale: 1 }] } };
const swing = { '0%': { transform: [{ rotate: '-10deg' }] }, '50%': { transform: [{ rotate: '10deg' }] }, '100%': { transform: [{ rotate: '-10deg' }] } };
const forever = (name: object, seconds: number) => ({ animationName: name, animationDuration: `${seconds}s`, animationIterationCount: 'infinite' as const, animationTimingFunction: 'ease-in-out' as const });

/** Alerts tab: weather now, rain/snow coming, next 24 hours, Environment Canada alerts, forecast. */
export function WeatherPanel({ wx }: { wx: WeatherData }) {
  const c = useColors();
  const cur = wx.current;
  const now = useNow(60_000);
  const still = useReducedMotion();
  const night = cur ? isNight(new Date(now).toISOString(), cur.sunrise, cur.sunset) : false;
  return (
    <View style={{ gap: SPACE.sm }}>
      {cur ? (
        <Animated.View entering={enter(0)}>
        <Card style={{ overflow: 'hidden' }}>
          <WeatherBackdrop icon={conditionIcon(cur.condition, night)} />
          <View style={styles.now}>
            <WeatherScene icon={conditionIcon(cur.condition, night)} size={76} />
            <View style={{ flex: 1 }}>
              <T variant="title">{Math.round(cur.temperature)}°C</T>
              <T muted>{cur.condition}</T>
            </View>
          </View>
          <View style={styles.stats}>
            <Stat icon="thermometer" text={`Feels like ${Math.round(cur.feelsLike)}°`} />
            <Stat icon="wind" text={`${cur.windDir ?? ''} ${cur.windKmh ?? '–'} km/h${cur.gustKmh ? `, gusts ${cur.gustKmh}` : ''}`} />
            <Stat icon="water" text={`Humidity ${cur.humidity ?? '–'}%`} />
          </View>
          {wx.upcoming ? (
            <View style={[styles.upcoming, { backgroundColor: c.soft }]}>
              <Animated.View style={still ? null : forever(swing, 2.2)}>
                <Icon name={PRECIP_ICON[wx.upcoming.kind]} size={18} color={c.brand} />
              </Animated.View>
              <T variant="small" style={{ flex: 1 }}>{upcomingLabel(wx.upcoming)}</T>
            </View>
          ) : (
            <T variant="small" muted style={{ marginTop: SPACE.sm }}>No rain or snow expected in the next 12 hours.</T>
          )}
          {cur.hourly?.length ? <HourlyStrip wx={wx} now={now} /> : null}
        </Card>
        </Animated.View>
      ) : null}

      {wx.alerts.map((a, i) => <WeatherAlertCard key={a.id} a={a} index={i + 1} />)}
      {!wx.alerts.length ? (
        <Animated.View entering={enter(1)} style={styles.inline}>
          <Icon name="check" size={16} color={c.live} />
          <T variant="small" muted>No weather alerts for Toronto right now.</T>
        </Animated.View>
      ) : null}

      {cur?.forecasts.length ? (
        <Animated.View entering={enter(wx.alerts.length + 2)}>
        <Card style={{ paddingVertical: SPACE.xs }}>
          {cur.forecasts.map((f, i) => (
            <Animated.View key={f.period} entering={FadeIn.delay(300 + i * 60).duration(300)} style={[styles.fc, i < cur.forecasts.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }]}>
              <Icon name={conditionIcon(f.summary, /night|tonight/i.test(f.period))} size={22} color={c.muted} />
              <View style={{ flex: 1 }}>
                <T variant="small" bold>{f.period}</T>
                <T variant="small" muted>{f.summary}</T>
              </View>
            </Animated.View>
          ))}
        </Card>
        </Animated.View>
      ) : null}
      {cur?.url ? (
        <T variant="caption" muted onPress={() => Linking.openURL(cur.url!)}>
          Source: Environment and Climate Change Canada{cur.updated ? ` · updated ${fmtTime(cur.updated)}` : ''}
        </T>
      ) : null}
    </View>
  );
}

function Stat({ icon, text }: { icon: 'thermometer' | 'wind' | 'water'; text: string }) {
  const c = useColors();
  return (
    <View style={styles.inline}>
      <Icon name={icon} size={14} color={c.muted} />
      <T variant="caption" muted>{text}</T>
    </View>
  );
}

/** Next 24 hours: time, icon, temperature, chance of rain/snow. */
function HourlyStrip({ wx, now }: { wx: WeatherData; now: number }) {
  const c = useColors();
  const cur = wx.current!;
  const hours = (cur.hourly ?? []).filter((h) => Date.parse(h.time) + 3600_000 > now).slice(0, 24);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hours} style={{ marginTop: SPACE.md }}>
      {hours.map((h, i) => {
        const wet = (h.pop ?? 0) >= 30;
        return (
          <Animated.View key={h.time} entering={FadeInRight.delay(Math.min(i, 8) * 50).duration(320)} style={[styles.hour, { borderColor: c.line, backgroundColor: h.kind && wet ? c.soft : c.card }]}
            accessibilityLabel={`${fmtTime(h.time)}: ${h.condition}, ${h.temp} degrees${h.pop ? `, ${h.pop}% chance of precipitation` : ''}`}>
            <T variant="caption" muted>{i === 0 ? 'Now' : fmtTime(h.time).replace(':00', '')}</T>
            <Icon name={conditionIcon(h.condition, isNight(h.time, cur.sunrise, cur.sunset))} size={24} color={h.kind && wet ? c.brand : c.muted} />
            <T variant="small" bold>{Math.round(h.temp)}°</T>
            <T variant="caption" color={wet ? c.brand : c.muted}>{h.pop != null ? `${h.pop}%` : ' '}</T>
          </Animated.View>
        );
      })}
    </ScrollView>
  );
}

const SEVERITY_LABEL = { severe: 'Warning', moderate: 'Watch', minor: 'Advisory' } as const;

/** One Environment Canada alert: what, until when, what it means for travel; tap for the full text. */
function WeatherAlertCard({ a, index }: { a: WeatherAlert; index: number }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const still = useReducedMotion();
  const severe = a.severity === 'severe';
  const fg = severe ? c.dangerInk : a.severity === 'moderate' ? c.warnInk : c.ink;
  const bg = severe ? c.dangerBg : a.severity === 'moderate' ? c.warnBg : c.soft;
  return (
    <Animated.View entering={enter(index)} layout={LinearTransition.duration(250)}>
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <View style={[styles.alertHead, { backgroundColor: bg }]}>
          <Animated.View style={still || a.severity === 'minor' ? null : forever(pulse, severe ? 1.2 : 2)}>
            <Icon name="warning" size={20} color={fg} />
          </Animated.View>
          <View style={{ flex: 1 }}>
            <T bold color={fg}>{a.name}</T>
            <T variant="caption" color={fg}>
              {SEVERITY_LABEL[a.severity]}{a.area ? ` · ${a.area}` : ''}{a.expires ? ` · until ${dayTimeLabel(a.expires)}` : ''}
            </T>
          </View>
          <Animated.View style={{ transform: [{ rotate: open ? '90deg' : '0deg' }], transitionProperty: 'transform', transitionDuration: still ? 0 : 200 }}>
            <Icon name="chevronRight" size={20} color={fg} />
          </Animated.View>
        </View>
      </Pressable>
      <View style={styles.alertBody}>
        {a.tips ? (
          <View style={styles.tip}>
            <Icon name="bus" size={16} color={c.brand} />
            <T variant="small" style={{ flex: 1 }}>{a.tips}</T>
          </View>
        ) : null}
        {open ? (
          <Animated.View entering={FadeIn.duration(250)} style={{ gap: SPACE.sm }}>
            {a.text ? <T variant="small" muted>{a.text}</T> : null}
            {a.issued ? <T variant="caption" muted>Issued {dayTimeLabel(a.issued)} by Environment Canada{a.status ? ` · ${a.status}` : ''}</T> : null}
            {a.url ? (
              <T variant="small" bold color={c.brand} onPress={() => Linking.openURL(a.url!)}>Open on weather.gc.ca</T>
            ) : null}
          </Animated.View>
        ) : (
          <T variant="caption" muted>Tap for full details</T>
        )}
      </View>
    </Card>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  now: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  stats: { flexDirection: 'row', flexWrap: 'wrap', columnGap: SPACE.md, rowGap: 2, marginTop: SPACE.sm },
  inline: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs + 2 },
  upcoming: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginTop: SPACE.md, padding: SPACE.sm + 2, borderRadius: RADIUS.control },
  hours: { gap: SPACE.xs + 2 },
  hour: { alignItems: 'center', gap: 2, width: 56, paddingVertical: SPACE.sm, borderRadius: RADIUS.control, borderWidth: StyleSheet.hairlineWidth },
  fc: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.md, paddingVertical: SPACE.sm + 2 },
  alertHead: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm + 2, padding: SPACE.md },
  alertBody: { padding: SPACE.md, gap: SPACE.sm },
  tip: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.sm },
});
