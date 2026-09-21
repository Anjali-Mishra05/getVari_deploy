/**
 * The dashboard's spacing scale.
 *
 * Every card on the screen used to carry its own margins: most had a 16px
 * bottom margin, the risk card had 12px top *and* bottom, the personalized
 * target card added 16px of its own horizontal margin on top of the scroll
 * view's padding — so it sat visibly narrower than everything above it — and
 * the skeleton's blocks agreed with none of them. Read top to bottom the
 * column drifted in and out.
 *
 * These are the numbers the whole dashboard is laid out on. They are applied
 * through `style` rather than utility classes so there is one place to change
 * them, and so a card cannot quietly opt out with a class of its own.
 */

/** The gap under every card, and so the gap between any two of them. */
export const CARD_GAP = 16;

/** Inner padding of a full-width section card. */
export const CARD_PADDING = 20;

/** Corner radius of a full-width section card. */
export const CARD_RADIUS = 28;

/** Inner padding of a compact tile — the vitals row, the hardware strip. */
export const TILE_PADDING = 14;

/** Corner radius of a compact tile. */
export const TILE_RADIUS = 24;

/** The horizontal gap between tiles standing in a row. */
export const TILE_GAP = 10;

/** Outer geometry shared by every full-width card. */
export const cardStyle = {
  padding: CARD_PADDING,
  borderRadius: CARD_RADIUS,
  marginBottom: CARD_GAP,
} as const;

/** Outer geometry shared by every compact tile. */
export const tileStyle = {
  padding: TILE_PADDING,
  borderRadius: TILE_RADIUS,
} as const;
