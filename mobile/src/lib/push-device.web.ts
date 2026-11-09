import { apiBase } from './config';

/*
 * Website: standard Web Push through the service worker the server already serves at /sw.js.
 * Works when the website is served by the Toronto Move server (same origin), over HTTPS or localhost.
 */

export type DeviceIdentity = { subscription: PushSubscriptionJSON; endpoint: string; platform: string };

const b64ToBytes = (b64: string) => {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

export function pushUnavailableReason(): string | null {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return /iphone|ipad/i.test(navigator.userAgent)
      ? 'On iPhone, add this site to your Home Screen (Share → Add to Home Screen) and open it from there to get notifications.'
      : 'This browser does not support notifications.';
  }
  if (apiBase() !== '') return 'Notifications work on the website served by the Toronto Move server (not the development preview).';
  return null;
}

export async function getDeviceIdentity(): Promise<DeviceIdentity> {
  const reason = pushUnavailableReason();
  if (reason) throw new Error(reason);
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifications were blocked. Allow them for this site in your browser settings.');
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const { publicKey } = await fetch('/api/push/key').then((r) => r.json());
  const sub = (await reg.pushManager.getSubscription())
    ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) }));
  return { subscription: sub.toJSON(), endpoint: sub.endpoint, platform: 'web' };
}

export async function releaseDeviceIdentity() {
  try { await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription().then((s) => s?.unsubscribe()); } catch { /* ignore */ }
}

/** The service worker opens the right page itself when a notification is tapped. */
export function listenForNotificationTaps(_onOpen: (url: string) => void) {
  return () => {};
}
