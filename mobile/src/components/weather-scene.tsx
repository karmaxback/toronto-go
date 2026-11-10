import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import type { IconName } from '@/lib/icons';
import { useColors, useScheme } from '@/lib/theme';

import { Icon } from './icon';

/*
 * A small animated weather picture: the sun turns, clouds drift, rain and snow fall, lightning
 * flashes, stars twinkle. Built with Reanimated's CSS-style animations, so it runs on the UI thread
 * (iPhone, Android) and as plain CSS on the website. Shows a still picture when the phone's
 * "Reduce motion" setting is on.
 */

const SUN = '#f2a900';
const MOON = '#c9b458';

// fixed positions (as % of the box) so the picture is the same every render
const DROPS = [12, 28, 44, 60, 76, 90, 20, 52, 84];
const FLAKES = [10, 26, 42, 58, 74, 88, 34, 66];
const STARS = [[14, 18], [78, 12], [86, 46], [22, 70], [62, 80]];

type Scene = 'sun' | 'moon' | 'partlySun' | 'partlyMoon' | 'cloud' | 'rain' | 'pouring' | 'snow' | 'sleet' | 'storm' | 'fog' | 'wind';

const spin = { from: { transform: [{ rotate: '0deg' }] }, to: { transform: [{ rotate: '360deg' }] } };
const pulse = { '0%': { transform: [{ scale: 1 }] }, '50%': { transform: [{ scale: 1.08 }] }, '100%': { transform: [{ scale: 1 }] } };
const drift = { '0%': { transform: [{ translateX: -4 }] }, '50%': { transform: [{ translateX: 4 }] }, '100%': { transform: [{ translateX: -4 }] } };
const bob = { '0%': { transform: [{ translateY: 0 }] }, '50%': { transform: [{ translateY: -3 }] }, '100%': { transform: [{ translateY: 0 }] } };
const twinkle = { '0%': { opacity: 0.2 }, '50%': { opacity: 1 }, '100%': { opacity: 0.2 } };
const flash = { '0%': { opacity: 0 }, '88%': { opacity: 0 }, '90%': { opacity: 0.85 }, '92%': { opacity: 0 }, '95%': { opacity: 0.6 }, '100%': { opacity: 0 } };
const fall = (h: number) => ({ from: { transform: [{ translateY: -12 }], opacity: 0 }, '15%': { opacity: 1 }, to: { transform: [{ translateY: h + 4 }], opacity: 0.3 } });
const flutter = (h: number) => ({
  '0%': { transform: [{ translateY: -8 }, { translateX: 0 }], opacity: 0 },
  '15%': { opacity: 1 },
  '50%': { transform: [{ translateY: h / 2 }, { translateX: 5 }] },
  '100%': { transform: [{ translateY: h + 4 }, { translateX: -3 }], opacity: 0.2 },
});
const loop = (name: object, seconds: number, delay = 0, easing: 'linear' | 'ease-in-out' = 'ease-in-out') => ({
  animationName: name,
  animationDuration: `${seconds}s`,
  animationDelay: `${delay}s`,
  animationIterationCount: 'infinite' as const,
  animationTimingFunction: easing,
});

export function WeatherScene({ icon, size = 72 }: { icon: IconName; size?: number }) {
  const c = useColors();
  const still = useReducedMotion();
  const scene = icon as Scene;
  const a = (style: ReturnType<typeof loop>) => (still ? null : style);

  const wet = scene === 'rain' || scene === 'pouring' || scene === 'storm' || scene === 'sleet';
  const snowy = scene === 'snow' || scene === 'sleet';
  const night = scene === 'moon' || scene === 'partlyMoon';
  const sunny = scene === 'sun' || scene === 'partlySun';
  const iconColor = sunny ? SUN : night ? MOON : c.brand;
  // what the main icon does
  const motion = scene === 'sun' ? loop(spin, 24, 0, 'linear')
    : scene === 'moon' ? loop(bob, 4)
    : scene === 'fog' || scene === 'wind' || scene === 'cloud' ? loop(drift, 6)
    : sunny || night ? loop(pulse, 4)
    : loop(bob, 3);

  const drops = scene === 'pouring' || scene === 'storm' ? DROPS : DROPS.slice(0, 6);
  return (
    <View style={[styles.box, { width: size, height: size, backgroundColor: c.soft }]} pointerEvents="none"
      accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {night && STARS.map(([x, y], i) => (
        <Animated.View key={`s${i}`} style={[styles.star, { left: `${x}%`, top: `${y}%`, backgroundColor: MOON }, a(loop(twinkle, 2.4, i * 0.5))]} />
      ))}
      {sunny ? <Animated.View style={[styles.glow, { width: size * 0.7, height: size * 0.7, borderRadius: size, backgroundColor: SUN }, a(loop(pulse, 3))]} /> : null}

      <Animated.View style={[styles.icon, a(motion)]}>
        <Icon name={icon} size={size * 0.62} color={iconColor} />
      </Animated.View>

      {wet && !still && drops.map((x, i) => (
        <Animated.View key={`d${i}`} style={[styles.drop, { left: `${x}%`, top: size * 0.45, backgroundColor: c.brand },
          loop(fall(size * 0.55), scene === 'pouring' ? 0.6 : 0.9, (i * 0.13) % 0.9, 'linear')]} />
      ))}
      {snowy && !still && FLAKES.map((x, i) => (
        <Animated.View key={`f${i}`} style={[styles.flake, { left: `${x}%`, top: size * 0.4, borderColor: c.brand },
          loop(flutter(size * 0.6), 2.6, (i * 0.37) % 2.6, 'linear')]} />
      ))}
      {scene === 'storm' && !still ? <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#fffbe6' }, loop(flash, 5, 0, 'linear')]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: 18, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  icon: { zIndex: 1 },
  glow: { position: 'absolute', opacity: 0.18 },
  star: { position: 'absolute', width: 3, height: 3, borderRadius: 2 },
  drop: { position: 'absolute', width: 2, height: 8, borderRadius: 1, opacity: 0.8, zIndex: 2 },
  flake: { position: 'absolute', width: 5, height: 5, borderRadius: 3, borderWidth: 1.5, backgroundColor: '#ffffff', zIndex: 2 },
  sunGlow: { position: 'absolute' },
  cloud: { position: 'absolute', left: 0 },
  cardDrop: { position: 'absolute', top: 0, width: 1.5, height: 10, borderRadius: 1, opacity: 0.35 },
  cardFlake: { position: 'absolute', top: 0, width: 6, height: 6, borderRadius: 3, borderWidth: 1, backgroundColor: '#ffffff', opacity: 0.7 },
});

/*
 * Card background that matches the sky: dark clouds sliding across when it's cloudy, rain or snow
 * falling over the whole card, lightning flashes in a storm, a warm glow when sunny, stars at night.
 * Sits behind the card's content; kept faint so the text stays easy to read.
 */
type Cloud = { top: number; size: number; start: number; seconds: number; shade: number };
const CLOUDS: Cloud[] = [
  { top: -0.18, size: 1.15, start: 0.05, seconds: 46, shade: 1 },
  { top: 0.22, size: 0.8, start: 0.55, seconds: 34, shade: 0.8 },
  { top: 0.5, size: 1.0, start: 0.25, seconds: 52, shade: 0.9 },
  { top: -0.05, size: 0.65, start: 0.8, seconds: 28, shade: 0.7 },
  { top: 0.62, size: 0.7, start: 0.7, seconds: 40, shade: 0.6 },
];
const CARD_DROPS = [4, 11, 19, 26, 33, 41, 48, 55, 63, 70, 77, 85, 92, 97];
const CARD_FLAKES = [6, 15, 24, 33, 42, 51, 60, 69, 78, 87, 95];
const CARD_STARS = [[8, 12], [22, 30], [40, 8], [58, 22], [73, 10], [88, 28], [94, 60], [65, 70], [30, 75], [12, 55]];

/** One cloud gliding left to right at a steady speed, starting part-way across and wrapping round. */
function glide(width: number, size: number, start: number) {
  const from = start * width;
  const total = width + size;
  const p = Math.round(((width - from) / total) * 1000) / 10; // % of the time spent reaching the right edge
  return {
    '0%': { transform: [{ translateX: from }] },
    [`${p}%`]: { transform: [{ translateX: width }] },
    [`${Math.min(p + 0.1, 100)}%`]: { transform: [{ translateX: -size }] },
    '100%': { transform: [{ translateX: from }] },
  };
}

/** A soft, filled cloud made of overlapping circles on a rounded base (drawn at width `size`). */
function Puff({ size: s, color }: { size: number; color: string }) {
  const circle = (left: number, top: number, d: number) => ({ position: 'absolute' as const, left: left * s, top: top * s, width: d * s, height: d * s, borderRadius: s, backgroundColor: color });
  return (
    <>
      <View style={circle(0.04, 0.24, 0.36)} />
      <View style={circle(0.22, 0.04, 0.48)} />
      <View style={circle(0.52, 0.16, 0.4)} />
      <View style={{ position: 'absolute', left: 0, top: 0.38 * s, width: s, height: 0.22 * s, borderRadius: s, backgroundColor: color }} />
    </>
  );
}

export function WeatherBackdrop({ icon }: { icon: IconName }) {
  const scheme = useScheme();
  const still = useReducedMotion();
  const [box, setBox] = useState({ w: 0, h: 0 });
  const scene = icon as Scene;
  const dark = scheme === 'dark';
  const { w, h } = box;

  const stormy = scene === 'storm';
  const wet = scene === 'rain' || scene === 'pouring' || stormy || scene === 'sleet';
  const snowy = scene === 'snow' || scene === 'sleet';
  const partly = scene === 'partlySun' || scene === 'partlyMoon';
  const night = scene === 'moon' || scene === 'partlyMoon';
  const cloudy = scene === 'cloud' || wet || snowy || partly || scene === 'fog' || scene === 'wind';
  const clouds = !cloudy ? [] : partly ? CLOUDS.slice(1, 3) : stormy || scene === 'pouring' ? CLOUDS : CLOUDS.slice(0, 4);
  // dark grey clouds on a light card, lighter grey on a dark card; storms are the darkest
  const cloudColor = dark ? (stormy ? '#6b7680' : '#a7b0b8') : (stormy ? '#1c232a' : '#33404b');
  const cloudOpacity = (dark ? 0.2 : 0.16) * (stormy || scene === 'pouring' ? 1.6 : partly ? 0.8 : 1.2);
  const tint = stormy ? (dark ? '#0b0f13' : '#5b6670') : wet || scene === 'cloud' || scene === 'fog' ? (dark ? '#0f1418' : '#8a96a0') : null;
  const drop = dark ? '#8fc3ff' : '#3a6f9e';

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      onLayout={(e) => { const { width, height } = e.nativeEvent.layout; if (Math.abs(width - w) > 1 || Math.abs(height - h) > 1) setBox({ w: width, h: height }); }}>
      {tint ? <View style={[StyleSheet.absoluteFill, { backgroundColor: tint, opacity: stormy ? 0.12 : 0.07 }]} /> : null}
      {(scene === 'sun' || scene === 'partlySun') && w ? (
        <Animated.View style={[styles.sunGlow, { width: w * 0.7, height: w * 0.7, borderRadius: w, right: -w * 0.22, top: -w * 0.3, backgroundColor: SUN },
          still ? null : loop({ '0%': { opacity: 0.1, transform: [{ scale: 1 }] }, '50%': { opacity: 0.18, transform: [{ scale: 1.06 }] }, '100%': { opacity: 0.1, transform: [{ scale: 1 }] } }, 6)]} />
      ) : null}
      {night && w ? CARD_STARS.map(([x, y], i) => (
        <Animated.View key={`cs${i}`} style={[styles.star, { left: `${x}%`, top: `${y}%`, backgroundColor: dark ? '#f5e9b0' : MOON, opacity: 0.5 }, still ? null : loop(twinkle, 2 + (i % 3) * 0.7, i * 0.3)]} />
      )) : null}
      {w ? clouds.map((cl, i) => {
        const size = Math.min(220, Math.max(120, w * 0.5)) * cl.size;
        return (
          <Animated.View key={`c${i}`} needsOffscreenAlphaCompositing
            style={[styles.cloud, { top: cl.top * h, width: size, height: size * 0.6, opacity: cloudOpacity * cl.shade },
              still ? { transform: [{ translateX: cl.start * w }] } : loop(glide(w, size, cl.start), stormy ? cl.seconds * 0.6 : cl.seconds, 0, 'linear')]}>
            <Puff size={size} color={cloudColor} />
          </Animated.View>
        );
      }) : null}
      {wet && !still && h ? CARD_DROPS.slice(0, scene === 'rain' || scene === 'sleet' ? 10 : 14).map((x, i) => (
        <Animated.View key={`cd${i}`} style={[styles.cardDrop, { left: `${x}%`, backgroundColor: drop },
          loop(fall(h + 12), scene === 'pouring' || stormy ? 0.7 : 1.1, (i * 0.29) % 1.1, 'linear')]} />
      )) : null}
      {snowy && !still && h ? CARD_FLAKES.map((x, i) => (
        <Animated.View key={`cf${i}`} style={[styles.cardFlake, { left: `${x}%`, borderColor: dark ? '#cfd8df' : '#7a8a96' },
          loop(flutter(h + 8), 4 + (i % 3), (i * 0.61) % 4, 'linear')]} />
      )) : null}
      {stormy && !still ? <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#fffbe6' }, loop(flash, 7, 1.5, 'linear')]} /> : null}
    </View>
  );
}
