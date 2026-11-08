import Geolocation from '@react-native-community/geolocation';
import { PermissionsAndroid, Platform } from 'react-native';

export interface Coords {
  lat: number;
  lng: number;
}

// Android's own location service: works on emulators and phones without
// relying on Google Play Services.
Geolocation.setRNConfiguration({
  skipPermissionRequests: true,
  locationProvider: 'android',
});

const TIMEOUT_MS = 10_000;
// A fix this recent is good enough (catches happen while standing still).
const MAX_AGE_MS = 60_000;

/** Asks for location permission. Resolves true if granted. */
export async function requestLocationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }
  const result = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
  ]);
  return Object.values(result).some(
    r => r === PermissionsAndroid.RESULTS.GRANTED,
  );
}

async function hasPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }
  return PermissionsAndroid.check(
    PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
  );
}

/**
 * Current device position, or null when permission is off or no fix arrives
 * in time. Never throws: callers fall back to "no location".
 */
export async function getCurrentCoords(): Promise<Coords | null> {
  if (!(await hasPermission())) {
    return null;
  }
  return new Promise(resolve => {
    Geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: TIMEOUT_MS, maximumAge: MAX_AGE_MS, enableHighAccuracy: true },
    );
  });
}
