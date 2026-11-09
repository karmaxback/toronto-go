import { DarkTheme, DefaultTheme, ThemeProvider, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import AppTabs from '@/components/app-tabs';
import { listenForNotificationTaps } from '@/lib/push-device';
import { useSettings } from '@/lib/settings';
import { useScheme } from '@/lib/theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const scheme = useScheme();
  const { clock } = useSettings();
  useEffect(() => { SplashScreen.hideAsync(); }, []);
  // Notification links look like "/?tab=alerts" or "/?from=lat,lon,name&to=lat,lon,name".
  useEffect(() => listenForNotificationTaps((url) => {
    const q = new URLSearchParams(url.split('?')[1] ?? '');
    if (q.get('tab') === 'alerts') router.navigate('/alerts');
    else if (q.get('from') && q.get('to')) router.navigate({ pathname: '/', params: { from: q.get('from')!, to: q.get('to')! } });
    else router.navigate('/');
  }), []);
  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {/* a new clock format redraws every time on screen */}
      <AppTabs key={clock} />
    </ThemeProvider>
  );
}
