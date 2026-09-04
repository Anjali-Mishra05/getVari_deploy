import { NativeModules, Platform } from 'react-native';

/**
 * The device's own phone number, so the user does not have to type it.
 *
 * Backed by the Android Phone Number Hint API (see `PhoneNumberModule.kt`):
 * Play Services shows a sheet listing the numbers on the device's SIMs, the
 * user taps one, and it arrives here. No runtime permission is involved — the
 * tap is the consent — and on a dual-SIM phone the user chooses which line.
 *
 * Everything here degrades to `null`. iOS has no equivalent API at all (the
 * platform does not expose the subscriber number to apps), and on Android the
 * sheet is unavailable without Play Services and can be dismissed. The login
 * screen keeps its text field for every one of those cases.
 */

export interface PhoneNumberHint {
  /** E.164, e.g. "+919876543210". Null when nothing was chosen. */
  phoneNumber: string | null;
  /** True when the user saw the sheet and closed it without choosing. */
  dismissed: boolean;
}

interface NativePhoneNumberModule {
  requestPhoneNumberHint(): Promise<PhoneNumberHint>;
}

const native: NativePhoneNumberModule | undefined =
  Platform.OS === 'android' ? NativeModules.PhoneNumberModule : undefined;

/** Whether this build can offer the picker at all. */
export const isSupported = (): boolean => !!native;

/**
 * The ten digits of an Indian mobile number, from whatever Play Services
 * returned.
 *
 * The hint arrives in E.164 ("+919876543210"), and the login field holds the
 * subscriber number with the country code shown beside it as a fixed label.
 * Returns null for anything that is not a plausible Indian mobile number,
 * rather than putting a partial number in the field for the user to puzzle
 * over — a wrong prefill is worse than an empty one.
 */
export const toIndianSubscriberNumber = (raw: string | null | undefined): string | null => {
  if (!raw) return null;

  const digits = raw.replace(/\D/g, '');
  // "+91 98765 43210" → 12 digits with the country code, or 10 without it.
  const local = digits.length > 10 ? digits.slice(-10) : digits;
  if (local.length !== 10) return null;
  // Indian mobile numbers start 6-9; anything else is a landline or a
  // mis-parse, and neither belongs in this field.
  if (!/^[6-9]\d{9}$/.test(local)) return null;
  return local;
};

/**
 * Show the picker and return what the user chose.
 *
 * Never throws: an unsupported platform, a missing module and a native error
 * all come back as "nothing chosen, not dismissed", which the caller reads as
 * "this device cannot offer it".
 */
export const requestPhoneNumber = async (): Promise<PhoneNumberHint> => {
  if (!native) return { phoneNumber: null, dismissed: false };

  try {
    const result = await native.requestPhoneNumberHint();
    return {
      phoneNumber: result?.phoneNumber ?? null,
      dismissed: !!result?.dismissed,
    };
  } catch (error) {
    console.warn('[PhoneNumber] Hint request failed:', error);
    return { phoneNumber: null, dismissed: false };
  }
};

export const PhoneNumberService = {
  isSupported,
  requestPhoneNumber,
  toIndianSubscriberNumber,
};

export default PhoneNumberService;
