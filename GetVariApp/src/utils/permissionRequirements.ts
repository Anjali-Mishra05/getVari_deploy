/**
 * What GetVari has to be granted before it can do its job, as data.
 *
 * ## Why this is a list and not three checks in a screen
 *
 * These grants were previously discovered one at a time, in a dashboard
 * banner that showed whichever was missing first and nothing about the
 * others. That was a reasonable way to nudge; it is not a reasonable way to
 * *gate*. A gate has to state the whole cost up front — a user who grants one
 * permission, watches the screen refuse to move on, grants another, and is
 * refused again learns only that the app is hostile.
 *
 * Keeping the requirements as an ordered list also keeps the two questions
 * apart that the banner used to conflate: which grants are missing, and which
 * one to talk about. The gate renders all of them; `firstMissing` is what
 * decides where the focus goes.
 *
 * ## Ordering
 *
 * By dependency, then by cost to the user. Notification permission comes
 * first because every other grant is inert without it — a full-screen intent
 * on a channel that may not post is a permission for nothing. The channel's
 * importance comes next for the same reason, then the two that each buy a
 * distinct delivery situation: the lock screen, and the phone in the hand.
 */

/** Everything the gate reads, in one shape. */
export interface PermissionSnapshot {
  /** POST_NOTIFICATIONS, or the platform equivalent. */
  notifications: boolean;
  /** The reminder channel is at HIGH importance or above. */
  channelAllows: boolean;
  /** USE_FULL_SCREEN_INTENT — reminders may open over the lock screen. */
  fullScreenIntent: boolean;
  /** SYSTEM_ALERT_WINDOW — reminders may open over another app. */
  displayOverApps: boolean;
}

export type PermissionKey = keyof PermissionSnapshot;

export interface PermissionRequirement {
  key: PermissionKey;
  /** The grant in the user's words, not Android's. */
  title: string;
  /** What it buys them, stated as an outcome rather than a capability. */
  body: string;
  /**
   * What the button says.
   *
   * "Allow" for the one grant that is a real dialog, "Open settings" for the
   * three that are a trip to a system screen. Promising a dialog and
   * delivering a settings page is the small dishonesty that makes a
   * permission flow feel broken.
   */
  action: string;
  /**
   * Where to find it, for the settings-page grants.
   *
   * Android's own screens are inconsistent across OEMs and this is the text
   * that saves a user hunting through Xiaomi's "Other permissions".
   */
  hint?: string;
  /**
   * The numbered way out of a *restricted setting*, shown only when one bites.
   *
   * Android blocks "Display over other apps" for any app installed outside
   * the Play Store — a sideloaded APK, which is every build handed to a
   * tester. Tapping through lands on "App was denied access … Access to this
   * permission can put your personal and financial info at risk", with the
   * real instructions behind a "Learn how to allow access" link to a help
   * article. A user who follows our button, is told the app was denied, and
   * is left on that dialog concludes the app is broken.
   *
   * So the steps are on our own screen. Kept to five short lines because a
   * wall of text on a permission gate is skipped, and the sequence genuinely
   * is short.
   */
  steps?: string[];
  /** Why the steps are there at all, in one line above them. */
  stepsIntro?: string;
}

export const PERMISSION_REQUIREMENTS: PermissionRequirement[] = [
  {
    key: 'notifications',
    title: 'Send notifications',
    body: 'Reminders, hydration alerts and your daily messages all arrive as notifications. Nothing reaches you without this.',
    action: 'Allow',
  },
  {
    key: 'channelAllows',
    title: 'Let reminders be heard',
    body: 'Reminders are currently set to silent or low priority, so they arrive without a sound and never open the screen.',
    action: 'Open settings',
    hint: 'Set the “Hydration reminders” category to Urgent or High.',
  },
  {
    key: 'fullScreenIntent',
    title: 'Open over the lock screen',
    body: 'Lets a reminder wake the screen and show itself, instead of waiting silently until you next unlock your phone.',
    action: 'Open settings',
    hint: 'Turn on “Full screen notifications” for GetVari.',
  },
  {
    key: 'displayOverApps',
    title: 'Show while you’re using another app',
    body: 'Without this a reminder stays a small banner whenever you are in another app — the most common moment to miss one.',
    action: 'Open settings',
    hint: 'Turn on “Display over other apps” for GetVari.',
    stepsIntro: 'Seeing “App was denied access”? Android restricts this for apps installed outside the Play Store. To allow it:',
    steps: [
      'Settings › Apps › App management › GetVari.',
      'Tap ⋮ (top right) › Allow restricted settings.',
      'Confirm with your PIN or fingerprint.',
      'Return here and tap “Open settings”.',
      'Turn on “Display over other apps”.',
    ],
  },
];

/** The requirements not yet satisfied, in the order above. */
export const missingRequirements = (
  snapshot: PermissionSnapshot | null
): PermissionRequirement[] => {
  // No snapshot yet is not the same as everything missing: the gate must not
  // flash on the first frame before the first read lands.
  if (!snapshot) return [];
  return PERMISSION_REQUIREMENTS.filter(requirement => !snapshot[requirement.key]);
};

/** Whether the app may run — every requirement granted. */
export const allPermissionsGranted = (snapshot: PermissionSnapshot | null): boolean =>
  snapshot !== null && missingRequirements(snapshot).length === 0;

/**
 * Whether the permission screen shows, from Android's current state only.
 *
 * Not before onboarding has finished (`armed`), not before the first read of
 * the real grants has landed (`checking`) — so it never flashes at a user who
 * granted everything — and not when every grant is in place: a permission
 * already granted is skipped, however long ago or in whatever way it was.
 */
export const shouldShowPermissionGate = ({
  armed,
  checking,
  snapshot,
}: {
  armed: boolean;
  checking: boolean;
  snapshot: PermissionSnapshot | null;
}): boolean => armed && !checking && snapshot !== null && !allPermissionsGranted(snapshot);

/** The one to point the user at, or null when nothing is missing. */
export const firstMissing = (
  snapshot: PermissionSnapshot | null
): PermissionRequirement | null => missingRequirements(snapshot)[0] ?? null;

export default PERMISSION_REQUIREMENTS;
