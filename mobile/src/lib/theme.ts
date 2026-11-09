import { useColorScheme } from 'react-native';

import { useSettings } from './settings';

const light = {
  bg: '#f4f6f5',
  panel: '#ffffff',
  card: '#ffffff',
  ink: '#15201d',
  muted: '#5e6b67',
  line: '#e2e7e5',
  soft: '#eef2f0',
  brand: '#0f6b5c',
  brandInk: '#ffffff',
  live: '#0a8f3c',
  late: '#c2410c',
  warnBg: '#fff6e5',
  warnInk: '#7a4b00',
  dangerBg: '#fdecec',
  dangerInk: '#8f1d1d',
  from: '#0f6b5c',
  to: '#d6342c',
  bike: '#2e9b47',
};
export type Palette = typeof light;

const dark: Palette = {
  bg: '#0e1412',
  panel: '#141c19',
  card: '#19231f',
  ink: '#e7eeeb',
  muted: '#9aa8a3',
  line: '#26332e',
  soft: '#1f2a26',
  brand: '#2bb39a',
  brandInk: '#04211b',
  live: '#3ddc84',
  late: '#fb923c',
  warnBg: '#2d2412',
  warnInk: '#f5c86b',
  dangerBg: '#2e1616',
  dangerInk: '#f6a5a5',
  from: '#2bb39a',
  to: '#ff6b62',
  bike: '#3fbf63',
};

/** 'light' or 'dark': the Settings choice, or the phone's setting when it's "Automatic". */
export function useScheme(): 'light' | 'dark' {
  const system = useColorScheme();
  const { theme } = useSettings();
  return theme === 'system' ? (system === 'dark' ? 'dark' : 'light') : theme;
}

export function useColors(): Palette {
  return useScheme() === 'dark' ? dark : light;
}
