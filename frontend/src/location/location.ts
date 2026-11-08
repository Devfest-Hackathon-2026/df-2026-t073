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

// Off when the user turns "Map and location" off in Me: nothing reads GPS.
let locationEnabled = true;

/** Called by the settings provider whenever the switch changes. */
export function setLocationEnabled(enabled: boolean): void {
  locationEnabled = enabled;
}

const TIMEOUT_MS = 10_000;
// A fix this recent is good enough (catches happen while standing still).
const MAX_AGE_MS = 60_000;

/** Asks for location permission. Resolves true if granted. */
export async function requestLocationPermission(): Promise<boolean> {
  if (!locationEnabled) {
    return false;
  }
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

/** One position request; null on error or timeout. */
function fix(highAccuracy: boolean): Promise<Coords | null> {
  return new Promise(resolve => {
    Geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      {
        timeout: TIMEOUT_MS,
        maximumAge: MAX_AGE_MS,
        enableHighAccuracy: highAccuracy,
      },
    );
  });
}

/**
 * Current device position, or null when permission is off or no fix arrives
 * in time. Never throws: callers fall back to "no location".
 * GPS alone often gets no fix indoors, so Wi-Fi/cell location is asked for at
 * the same time and whichever answers first wins.
 */
export async function getCurrentCoords(): Promise<Coords | null> {
  if (!locationEnabled) {
    return null;
  }
  if (!(await hasPermission())) {
    return null;
  }
  const gps = fix(true);
  const network = fix(false);
  return new Promise(resolve => {
    let pending = 2;
    const settle = (coords: Coords | null) => {
      pending -= 1;
      if (coords) {
        pending = -1;
        resolve(coords);
      } else if (pending === 0) {
        resolve(null);
      }
    };
    gps.then(settle);
    network.then(settle);
  });
}
