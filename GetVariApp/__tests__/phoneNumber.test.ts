/**
 * Parsing what the SIM picker hands back, and locating a device.
 *
 * Both are "fill this in for the user" features, and both are only an
 * improvement if a wrong answer is treated as no answer: a half-parsed phone
 * number in the login field, or a city 6,000km away in the profile, is worse
 * than an empty field the user completes themselves.
 */

jest.mock(
  'react-native',
  () => ({
    Platform: { OS: 'android' },
    NativeModules: {},
  }),
  { virtual: true }
);

import { toIndianSubscriberNumber } from '../src/services/PhoneNumberService';
import { findNearestCity, getClosestCity, NEAREST_CITY_LIMIT_KM } from '../src/data/indianCities';

describe('the number returned by the SIM picker', () => {
  it('strips the country code and formatting', () => {
    expect(toIndianSubscriberNumber('+919876543210')).toBe('9876543210');
    expect(toIndianSubscriberNumber('+91 98765 43210')).toBe('9876543210');
    expect(toIndianSubscriberNumber('+91-98765-43210')).toBe('9876543210');
  });

  it('accepts a bare ten-digit number', () => {
    expect(toIndianSubscriberNumber('9876543210')).toBe('9876543210');
  });

  it('rejects anything that is not a plausible Indian mobile number', () => {
    // Landline prefix, so not a mobile.
    expect(toIndianSubscriberNumber('+912212345678')).toBeNull();
    // Too short to be a number at all.
    expect(toIndianSubscriberNumber('98765')).toBeNull();
    expect(toIndianSubscriberNumber('')).toBeNull();
    expect(toIndianSubscriberNumber(null)).toBeNull();
    expect(toIndianSubscriberNumber(undefined)).toBeNull();
  });

  it('takes the last ten digits of an over-long string', () => {
    expect(toIndianSubscriberNumber('0091 9876543210')).toBe('9876543210');
  });
});

describe('resolving a fix to a city', () => {
  it('names the city a fix is standing in', () => {
    // Mumbai: 19.0760, 72.8777
    expect(getClosestCity(19.08, 72.88)).toBe('Mumbai');
    // Bengaluru: 12.9716, 77.5946
    expect(getClosestCity(12.97, 77.59)).toBe('Bengaluru');
  });

  it('names a nearby city rather than a distant one', () => {
    const nearest = findNearestCity(19.2, 72.95);
    expect(nearest).not.toBeNull();
    expect(nearest!.distanceKm).toBeLessThan(NEAREST_CITY_LIMIT_KM);
  });

  it('refuses to name a city for a fix outside the table', () => {
    // London. The old lookup answered with the nearest Indian city.
    expect(getClosestCity(51.5074, -0.1278)).toBeNull();
    // The distance is still reported, so a caller can say why.
    expect(findNearestCity(51.5074, -0.1278)!.distanceKm).toBeGreaterThan(NEAREST_CITY_LIMIT_KM);
  });

  it('returns null for coordinates that are not numbers', () => {
    expect(findNearestCity(NaN, NaN)).toBeNull();
    expect(getClosestCity(NaN, 72.8)).toBeNull();
  });

  it('measures distance in kilometres, not in degrees', () => {
    // One degree of longitude at Chennai's latitude is ~108km, not 111km, and
    // a degrees-only comparison biases the answer northwards.
    const nearest = findNearestCity(13.0827, 80.2707);
    expect(nearest!.city).toBe('Chennai');
    expect(nearest!.distanceKm).toBeLessThan(1);
  });
});
