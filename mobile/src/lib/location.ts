import * as Location from 'expo-location';

/** Ask for location (foreground only) and return the current position, or throw a friendly error. */
export async function getMyLocation(): Promise<{ lat: number; lon: number }> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') throw new Error('Location permission was not given. You can type an address instead.');
  const last = await Location.getLastKnownPositionAsync({ maxAge: 60_000 }).catch(() => null);
  const pos = last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
  return { lat: pos.coords.latitude, lon: pos.coords.longitude };
}

/** Current position only if location is already allowed (never shows a permission prompt). */
export async function getLocationIfAllowed(): Promise<{ lat: number; lon: number } | null> {
  if (!(await hasLocationPermission())) return null;
  try {
    const pos = (await Location.getLastKnownPositionAsync({ maxAge: 10 * 60_000 }))
      ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    return { lat: pos.coords.latitude, lon: pos.coords.longitude };
  } catch {
    return null;
  }
}

/** True when the user already allowed location (so we can use it without a prompt). */
export async function hasLocationPermission() {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}
