/**
 * Runtime permissions, asked for only when Android says they are missing.
 *
 * Android's current state is the only source of truth: nothing here is
 * remembered, so a permission granted before a relaunch, an update or a
 * trip to App info is found granted and never asked for again.
 */

/** The subset of `react-native-permissions` this needs (injected for tests). */
export interface PermissionsApi<P extends string> {
  checkMultiple: (permissions: P[]) => Promise<Record<P, string>>;
  requestMultiple: (permissions: P[]) => Promise<Record<P, string>>;
  RESULTS: { GRANTED: string; LIMITED: string; DENIED: string; BLOCKED: string };
}

/**
 * - `granted`: every permission is granted (asked for only the missing ones);
 * - `blocked`: at least one can now only be granted in Settings;
 * - `denied`: the user said no this time.
 */
export type EnsureResult = 'granted' | 'denied' | 'blocked';

export const ensureRuntimePermissions = async <P extends string>(
  permissions: P[],
  api: PermissionsApi<P>
): Promise<EnsureResult> => {
  const { GRANTED, LIMITED, DENIED, BLOCKED } = api.RESULTS;
  const isGranted = (status: string | undefined) => status === GRANTED || status === LIMITED;

  const current = await api.checkMultiple(permissions);
  if (permissions.every(p => isGranted(current[p]))) return 'granted';

  // Only what Android will still show a dialog for; a blocked one would
  // return at once without asking, so it is left to the Settings route.
  const requestable = permissions.filter(p => current[p] === DENIED);
  if (requestable.length > 0) await api.requestMultiple(requestable);

  // The real state after the dialog, not what the dialog reported.
  const after = await api.checkMultiple(permissions);
  if (permissions.every(p => isGranted(after[p]))) return 'granted';
  return permissions.some(p => after[p] === BLOCKED) ? 'blocked' : 'denied';
};

export default ensureRuntimePermissions;
