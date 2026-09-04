import { Platform } from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import { PERMISSIONS, RESULTS, check, request } from 'react-native-permissions';

import { NEAREST_CITY_LIMIT_KM, findNearestCity } from '../data/indianCities';

/**
 * Where the user is, from the device rather than from a dropdown.
 *
 * The climate band that feeds the daily goal is a property of *where the user
 * is*, so it should be measured, not typed. Onboarding used to make the fix
 * optional — a "Detect" button beside a city picker — which meant most
 * profiles carried whichever city the user happened to scroll to, and none of
 * them updated when the user travelled.
 *
 * This service is the single way the app asks. It is deliberately quiet about
 * failure: location is a nice-to-have that sharpens the goal, not a gate, so
 * every outcome is a value the caller can render rather than an exception.
 */

export type LocationStatus =
  | 'resolved'
  /** A fix was obtained, but no city in the table is near enough to name. */
  | 'unknown_area'
  | 'permission_denied'
  | 'unavailable';

export interface ResolvedLocation {
  status: LocationStatus;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  /** Distance to the named city, for callers that want to qualify it. */
  distanceKm: number | null;
}

const FAILED = (status: LocationStatus): ResolvedLocation => ({
  status,
  city: null,
  latitude: null,
  longitude: null,
  distanceKm: null,
});

const FINE_LOCATION =
  Platform.OS === 'android'
    ? PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION
    : PERMISSIONS.IOS.LOCATION_WHEN_IN_USE;

/** Whether location has already been granted, without prompting for it. */
export const hasPermission = async (): Promise<boolean> => {
  try {
    return (await check(FINE_LOCATION)) === RESULTS.GRANTED;
  } catch (error) {
    console.warn('[Location] Permission check failed:', error);
    return false;
  }
};

/** Asks for location. Returns false for a denial, a block, or an error. */
export const requestPermission = async (): Promise<boolean> => {
  try {
    return (await request(FINE_LOCATION)) === RESULTS.GRANTED;
  } catch (error) {
    console.warn('[Location] Permission request failed:', error);
    return false;
  }
};

/**
 * One positioning attempt, wrapped as a promise.
 *
 * `enableHighAccuracy` is the difference between a GPS fix and a
 * network-derived one; the caller tries the accurate one first and falls back,
 * because indoors the GPS attempt simply times out.
 */
const getPosition = (highAccuracy: boolean, timeoutMs: number) =>
  new Promise<{ latitude: number; longitude: number }>((resolve, reject) => {
    Geolocation.getCurrentPosition(
      position => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      error => reject(error),
      { enableHighAccuracy: highAccuracy, timeout: timeoutMs, maximumAge: 60_000 }
    );
  });

/**
 * The user's current location, resolved to a city where one is close enough.
 *
 * @param options.prompt Ask for permission if it has not been granted. Pass
 *   false for a background refresh, which must never raise a dialog the user
 *   did not initiate.
 */
export const resolveCurrentLocation = async (
  options: { prompt?: boolean } = {}
): Promise<ResolvedLocation> => {
  const { prompt = true } = options;

  const granted = (await hasPermission()) || (prompt ? await requestPermission() : false);
  if (!granted) return FAILED('permission_denied');

  let fix: { latitude: number; longitude: number } | null = null;
  try {
    fix = await getPosition(true, 8000);
  } catch (gpsError) {
    console.warn('[Location] GPS fix failed, trying network positioning:', gpsError);
    try {
      fix = await getPosition(false, 8000);
    } catch (networkError) {
      console.warn('[Location] Network positioning failed:', networkError);
      return FAILED('unavailable');
    }
  }

  const nearest = findNearestCity(fix.latitude, fix.longitude);

  // A fix outside the coverage of the city table is still a fix: the
  // coordinates are kept so the profile records where the user actually is,
  // and the city is left null rather than filled with somewhere thousands of
  // kilometres away.
  if (!nearest || nearest.distanceKm > NEAREST_CITY_LIMIT_KM) {
    return {
      status: 'unknown_area',
      city: null,
      latitude: fix.latitude,
      longitude: fix.longitude,
      distanceKm: nearest?.distanceKm ?? null,
    };
  }

  return {
    status: 'resolved',
    city: nearest.city,
    latitude: fix.latitude,
    longitude: fix.longitude,
    distanceKm: nearest.distanceKm,
  };
};

/** What to tell the user when a resolve did not produce a city. */
export const describeFailure = (status: LocationStatus): string => {
  switch (status) {
    case 'permission_denied':
      return 'Location access is off, so we cannot set your climate automatically. Pick your city instead.';
    case 'unknown_area':
      return "We found you, but you're outside the cities we have climate data for. Pick the closest one.";
    case 'unavailable':
      return 'Could not get a location fix. Pick your city instead.';
    default:
      return '';
  }
};

export const LocationService = {
  hasPermission,
  requestPermission,
  resolveCurrentLocation,
  describeFailure,
};

export default LocationService;
