import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/*
 * Phones (iOS / Android): Expo push tokens. The server sends through Expo's push service.
 * Needs a development build or store build (not Expo Go) and an EAS project ID (`eas init`).
 * The web version of this file is push-device.web.ts.
 */

// Show notifications as banners even while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

export type DeviceIdentity = { expoToken: string; platform: string };

const projectId = () =>
  (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;

/** null when notifications can work here, otherwise a plain-language reason. */
export function pushUnavailableReason(): string | null {
  if (!Device.isDevice) return 'Notifications need a real phone (not a simulator).';
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return 'Notifications can’t run inside Expo Go. They work in the development build and the App Store / Google Play version.';
  }
  if (!projectId()) return 'Notifications aren’t set up for this build yet (missing Expo project ID).';
  return null;
}

/** Ask permission and get this phone's push token. Throws a friendly error if not possible. */
export async function getDeviceIdentity(): Promise<DeviceIdentity> {
  const reason = pushUnavailableReason();
  if (reason) throw new Error(reason);
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Trip and service alerts',
      // eslint-disable-next-line import/namespace -- exported via `export *` in expo-notifications; the linter can't follow it
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }
  let perm = await Notifications.getPermissionsAsync();
  if (perm.status !== 'granted') perm = await Notifications.requestPermissionsAsync();
  if (perm.status !== 'granted') throw new Error('Notifications are turned off for Toronto Move. Turn them on in your phone’s Settings.');
  const token = (await Notifications.getExpoPushTokenAsync({ projectId: projectId() })).data;
  return { expoToken: token, platform: Platform.OS };
}

export async function releaseDeviceIdentity() { /* nothing to undo on phones; the server forgets the token */ }

/** Call `onOpen(url)` when the user taps one of our notifications (also for the tap that launched the app). */
export function listenForNotificationTaps(onOpen: (url: string) => void) {
  const last = Notifications.getLastNotificationResponse();
  const firstUrl = last?.notification.request.content.data?.url;
  if (typeof firstUrl === 'string') { onOpen(firstUrl); Notifications.clearLastNotificationResponse(); }
  const sub = Notifications.addNotificationResponseReceivedListener((r) => {
    const url = r.notification.request.content.data?.url;
    if (typeof url === 'string') onOpen(url);
  });
  return () => sub.remove();
}
