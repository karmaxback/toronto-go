import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Where the Toronto Go server lives.
 *  - EXPO_PUBLIC_API_URL wins if set (e.g. https://toronto-go-xxxx.onrender.com for store builds).
 *  - Web: same origin when served by our server; port 3000 on the same host during `expo start --web`.
 *  - Phone in Expo Go: the computer running `expo start` (its LAN IP), port 3000.
 */
export function apiBase(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.location.port === '8081') {
      return `${window.location.protocol}//${window.location.hostname}:3000`;
    }
    return '';
  }
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return host ? `http://${host}:3000` : 'http://localhost:3000';
}
