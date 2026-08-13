/**
 * The amounts offered as one-tap shortcuts.
 *
 * One list, used by both the home screen's quick-log sheet and the chat's
 * quick replies, so the two can never drift into offering different amounts.
 * `label` doubles as the text the chat feeds back through the intake parser,
 * which is why it is phrased the way a person would type it.
 */

export interface QuickAmount {
  ml: number;
  /** "250 ml" — also parseable by `parseIntakeMl`. */
  label: string;
  /** The everyday object the amount corresponds to. */
  caption: string;
  /** Marks the amount most people reach for, highlighted in the UI. */
  primary?: boolean;
}

export const QUICK_LOG_AMOUNTS: QuickAmount[] = [
  { ml: 250, label: '250 ml', caption: 'A glass' },
  { ml: 500, label: '500 ml', caption: 'A bottle', primary: true },
  { ml: 1000, label: '1 litre', caption: 'A large bottle' },
];

export default QUICK_LOG_AMOUNTS;
