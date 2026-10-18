/**
 * Where the dashboard's bottom bar, the chat button above it and the end of
 * the scrolling content sit, given the system's bottom inset.
 *
 * The app draws edge to edge, so the bottom of the screen is shared with
 * Android's own navigation: a thin gesture handle, or the taller 3-button
 * bar. The bar is docked to the bottom edge and spans the full width; its
 * surface runs behind the system navigation and its row of items sits just
 * above it, by the inset the system reports — so it is right for either kind,
 * and for any device, since nothing here is a device's number.
 *
 * Pure, so the three places that must agree (the bar, the chat button and the
 * scroll padding) are computed from one rule and can be tested.
 */

/** Height of the bar's row of items, not counting the system inset under it. */
export const NAV_HEIGHT = 64;

/** The least space kept between the system navigation area and a pinned footer. */
export const NAV_SYSTEM_GAP = 8;

/** Space between the top of the bar and the chat button. */
export const CHAT_GAP = 12;

/** What the content must clear above the chat button's bottom edge: the button and a margin. */
export const CONTENT_CLEARANCE = 76;

const inset = (value?: number | null): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;

/**
 * The distance from the bottom of the screen to the bar's row of items.
 *
 * The bar itself is docked at the very bottom; this is the padding under its
 * items, so they clear a gesture handle or a 3-button bar while the bar's
 * surface carries on behind it. Nothing of the system's there, nothing added.
 */
export const navBottomOffset = (insetBottom?: number | null): number => inset(insetBottom);

/** The chat button's distance from the bottom: just above the bar, wherever that is. */
export const chatButtonBottom = (insetBottom?: number | null): number =>
  navBottomOffset(insetBottom) + NAV_HEIGHT + CHAT_GAP;

/** Bottom padding of the dashboard's scroll content, so the last card clears the bar and the chat button. */
export const dashboardBottomPadding = (insetBottom?: number | null): number =>
  chatButtonBottom(insetBottom) + CONTENT_CLEARANCE;

/**
 * A side inset to add to an absolutely positioned element's own margin.
 * Absolute children ignore their parent's safe-area padding, so in landscape
 * a cutout or a side navigation bar has to be added by hand.
 */
export const sideInset = (value?: number | null): number => inset(value);

/**
 * The edges on which a bottom sheet's panel is a safe-area view (`ui/Sheet`):
 * the bottom, for Android's navigation, and the sides, for a cutout or a side
 * navigation bar in landscape. Not the top — a sheet starts below the status
 * bar already.
 */
export const SHEET_SAFE_EDGES = ['bottom', 'left', 'right'] as const;

/**
 * The distance to keep between the bottom of the screen and something that
 * has a usual bottom padding or offset of its own — the chat's input row, the
 * loading screen's footer line: that usual figure, or enough to clear the
 * system navigation when that is taller. A gesture handle changes little or
 * nothing and a 3-button bar is always cleared.
 *
 * For an element that is absolutely positioned or lives in a window with no
 * safe-area view of its own. Anything inside `ui/Sheet`, `ui/Dialog` or a
 * screen's `SafeAreaView` is already clear and needs none of this.
 */
export const footerBottomPadding = (basePadding: number, insetBottom?: number | null): number =>
  Math.max(basePadding, inset(insetBottom) + NAV_SYSTEM_GAP);

export default { navBottomOffset, chatButtonBottom, dashboardBottomPadding, sideInset, footerBottomPadding };
