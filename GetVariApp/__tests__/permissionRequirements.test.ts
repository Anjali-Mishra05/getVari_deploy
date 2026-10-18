/**
 * What the permission gate lets through, and what it stops.
 *
 * The gate replaced a dashboard banner that offered one missing grant at a
 * time and could be scrolled past. The rule it enforces instead is flat: the
 * app runs when every requirement is granted, and not before.
 */

import {
  PERMISSION_REQUIREMENTS,
  allPermissionsGranted,
  firstMissing,
  missingRequirements,
  shouldShowPermissionGate,
  type PermissionSnapshot,
} from '../src/utils/permissionRequirements';

const granted: PermissionSnapshot = {
  notifications: true,
  channelAllows: true,
  fullScreenIntent: true,
  displayOverApps: true,
};

describe('the gate opens only when everything is granted', () => {
  it('lets a fully granted phone through', () => {
    expect(allPermissionsGranted(granted)).toBe(true);
    expect(missingRequirements(granted)).toEqual([]);
    expect(firstMissing(granted)).toBeNull();
  });

  it('blocks on any single missing grant', () => {
    for (const requirement of PERMISSION_REQUIREMENTS) {
      const snapshot = { ...granted, [requirement.key]: false };
      expect(allPermissionsGranted(snapshot)).toBe(false);
      expect(firstMissing(snapshot)?.key).toBe(requirement.key);
    }
  });

  it('blocks a phone with nothing granted, and names them all', () => {
    const none: PermissionSnapshot = {
      notifications: false,
      channelAllows: false,
      fullScreenIntent: false,
      displayOverApps: false,
    };
    expect(allPermissionsGranted(none)).toBe(false);
    expect(missingRequirements(none)).toHaveLength(PERMISSION_REQUIREMENTS.length);
  });
});

describe('the first missing requirement is the one to act on', () => {
  it('asks for the notification permission before anything built on it', () => {
    // Every other grant is inert without this one, so it must lead however
    // many others are also missing.
    const snapshot: PermissionSnapshot = {
      notifications: false,
      channelAllows: false,
      fullScreenIntent: false,
      displayOverApps: false,
    };
    expect(firstMissing(snapshot)?.key).toBe('notifications');
  });

  it('asks for the channel importance before the two delivery grants', () => {
    const snapshot: PermissionSnapshot = {
      notifications: true,
      channelAllows: false,
      fullScreenIntent: false,
      displayOverApps: false,
    };
    expect(firstMissing(snapshot)?.key).toBe('channelAllows');
  });

  it('falls through to the overlay grant when it is the only one left', () => {
    const snapshot = { ...granted, displayOverApps: false };
    expect(firstMissing(snapshot)?.key).toBe('displayOverApps');
  });
});

describe('the first frame is not treated as a refusal', () => {
  it('does not report anything missing before the first read lands', () => {
    // A null snapshot is "not yet known". Reporting it as missing would throw
    // the gate up over a working app for a frame on every single launch.
    expect(missingRequirements(null)).toEqual([]);
    expect(firstMissing(null)).toBeNull();
  });

  it('still refuses to call the app ready', () => {
    // ...but "not yet known" is not "granted" either, so nothing may proceed
    // on the strength of it.
    expect(allPermissionsGranted(null)).toBe(false);
  });
});

describe('every requirement is presentable', () => {
  it('has copy for the user and an action label', () => {
    for (const requirement of PERMISSION_REQUIREMENTS) {
      expect(requirement.title.length).toBeGreaterThan(0);
      expect(requirement.body.length).toBeGreaterThan(0);
      expect(requirement.action.length).toBeGreaterThan(0);
    }
  });

  it('promises a dialog only for the grant that is one', () => {
    // The three settings-page grants must not say "Allow": promising a dialog
    // and delivering a trip to Android's settings is what makes a permission
    // flow feel broken.
    for (const requirement of PERMISSION_REQUIREMENTS) {
      if (requirement.key === 'notifications') {
        expect(requirement.action).toBe('Allow');
      } else {
        expect(requirement.action).toBe('Open settings');
        // And each names where to look, because OEM settings trees differ.
        expect(requirement.hint).toBeTruthy();
      }
    }
  });

  it('has no duplicate keys', () => {
    const keys = PERMISSION_REQUIREMENTS.map(r => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('the restricted-settings way out is on the screen', () => {
  const overlay = PERMISSION_REQUIREMENTS.find(r => r.key === 'displayOverApps')!;

  it('is attached to the overlay grant, which is the one Android restricts', () => {
    // A sideloaded build cannot be given "Display over other apps" until
    // restricted settings are unlocked; Android's own dialog says only that
    // the app "was denied access" and hides the fix behind a help link.
    expect(overlay.steps).toBeDefined();
    expect(overlay.stepsIntro).toBeTruthy();
  });

  it('names the two things a user cannot guess', () => {
    const all = overlay.steps!.join(' ');
    expect(all).toContain('Allow restricted settings');
    expect(all).toContain('Display over other apps');
  });

  it('ends by sending the user back to the grant, not leaving them in Settings', () => {
    expect(overlay.steps![overlay.steps!.length - 1]).toContain('Display over other apps');
  });

  it('stays short enough to read on a permission screen', () => {
    expect(overlay.steps!.length).toBeLessThanOrEqual(5);
    for (const step of overlay.steps!) {
      expect(step.length).toBeLessThanOrEqual(60);
    }
  });

  it('is not repeated on the grants that are not restricted', () => {
    for (const requirement of PERMISSION_REQUIREMENTS) {
      if (requirement.key !== 'displayOverApps') expect(requirement.steps).toBeUndefined();
    }
  });
});

describe('the permission screen follows Android’s real state', () => {
  const show = (snapshot: PermissionSnapshot | null, over: { armed?: boolean; checking?: boolean } = {}) =>
    shouldShowPermissionGate({ armed: over.armed ?? true, checking: over.checking ?? false, snapshot });

  it('everything already granted (e.g. before a relaunch or an update): skipped', () => {
    expect(show(granted)).toBe(false);
  });

  it('a permission not granted: shown, pointing at that one', () => {
    const snapshot = { ...granted, notifications: false };
    expect(show(snapshot)).toBe(true);
    expect(firstMissing(snapshot)?.key).toBe('notifications');
  });

  it('full-screen notifications already enabled: that step is skipped', () => {
    const snapshot = { ...granted, displayOverApps: false };
    expect(missingRequirements(snapshot).map(r => r.key)).not.toContain('fullScreenIntent');
    expect(firstMissing(snapshot)?.key).toBe('displayOverApps');
  });

  it('full-screen notifications not enabled: shown, and that is the step asked for', () => {
    const snapshot = { ...granted, fullScreenIntent: false };
    expect(show(snapshot)).toBe(true);
    expect(firstMissing(snapshot)?.key).toBe('fullScreenIntent');
  });

  it('granted after the request: the next missing one comes up, then the screen goes away', () => {
    let snapshot: PermissionSnapshot = { notifications: false, channelAllows: true, fullScreenIntent: false, displayOverApps: true };
    expect(firstMissing(snapshot)?.key).toBe('notifications');
    snapshot = { ...snapshot, notifications: true }; // re-read after the dialog
    expect(firstMissing(snapshot)?.key).toBe('fullScreenIntent');
    snapshot = { ...snapshot, fullScreenIntent: true }; // re-read on return from Settings
    expect(show(snapshot)).toBe(false);
  });

  it('denied: stays shown on that step (no loop to another, no skipping it)', () => {
    const snapshot = { ...granted, notifications: false };
    expect(show(snapshot)).toBe(true);
    expect(firstMissing(snapshot)?.key).toBe('notifications');
  });

  it('never before onboarding is finished, and never before the first real read', () => {
    const missing = { ...granted, notifications: false };
    expect(show(missing, { armed: false })).toBe(false);
    expect(show(missing, { checking: true })).toBe(false);
    expect(show(null)).toBe(false);
  });
});
