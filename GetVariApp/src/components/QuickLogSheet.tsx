import React, { useEffect, useState } from 'react';
import { Keyboard, Platform, Text, View } from 'react-native';

import Button from './ui/Button';
import Sheet from './ui/Sheet';
import QuickLogAmounts, {
  quickLogButtonAccessibilityLabel,
  quickLogButtonLabel,
  useQuickLogSelection,
} from './QuickLogAmounts';
import { nearestQuickAmount } from '../utils/hydrationAmounts';
import { formatMl } from '../utils/hydrationFormat';
import { useThemeMode } from '../theme/theme';

interface QuickLogSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Writes the entry. Resolves `false` when nothing was recorded. */
  onLog: (amountMl: number) => Promise<boolean>;
  totalMl: number;
  /** The daily goal, or null while the profile is still loading. */
  targetMl: number | null;
  /**
   * An amount to open selected instead of the usual default, in ml.
   *
   * Set when the sheet is opened from a suggestion — the risk card's water
   * requirement pill — so the user confirms the amount they were just shown
   * rather than having to find it. Snapped to the nearest offered amount, and
   * ignored when null, which is every other way the sheet opens.
   */
  prefillMl?: number | null;
}

/** How long the tick stays up before the sheet closes itself. */
/** Presses on "Log" within this long of the sheet opening are ignored. */
const OPEN_GUARD_MS = 600;

const CONFIRM_MS = 850;

/**
 * The "+" on the hydration card: log a glass, a bottle or a litre in one tap.
 *
 * Writing is delegated to the caller (which goes through `HydrationService`),
 * so an entry made here obeys the same idempotency and reminder-reset rules as
 * one made from the chat. The sheet only owns the interaction: one write at a
 * time, a visible outcome, and a close that the user does not have to perform.
 */
const QuickLogSheet: React.FC<QuickLogSheetProps> = ({
  visible,
  onClose,
  onLog,
  totalMl,
  targetMl,
  prefillMl = null,
}) => {
  // Subscribed to the shared mode itself, not only re-rendered by the screen
  // that mounts it, so the sheet is in the app's mode however it was opened.
  useThemeMode();

  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [savingMl, setSavingMl] = useState<number | null>(null);
  const [loggedMl, setLoggedMl] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  /** True once a write is in flight or done — selection is frozen from then on. */
  const busy = savingMl !== null || loggedMl !== null;
  const selection = useQuickLogSelection(busy, () => setFailed(false));
  const { selectedMl, reset } = selection;

  // Every open starts clean, so a previous failure or tick is never inherited
  // — and back on the pre-selected amount, not on whatever was chosen last.
  /** When the sheet last opened; see `commit`. */
  const openedAt = React.useRef(0);

  /**
   * The suggestion to open on, read at open rather than tracked.
   *
   * Kept in a ref so the reset below can depend on `visible` alone. The parent
   * clears the prefill as it closes the sheet, and with the prefill in the
   * dependency list that clear would re-run the reset — throwing away the
   * amount the user had just picked, mid-close, for no reason the user could
   * see.
   */
  const prefillRef = React.useRef(prefillMl);
  prefillRef.current = prefillMl;

  useEffect(() => {
    if (!visible) return;
    openedAt.current = Date.now();
    const suggested = prefillRef.current;
    reset(typeof suggested === 'number' && suggested > 0 ? nearestQuickAmount(suggested).ml : undefined);
    setSavingMl(null);
    setLoggedMl(null);
    setFailed(false);
  }, [visible, reset]);

  // The sheet is a Modal, whose window does not resize for the keyboard, so
  // the content is lifted by the keyboard's height while the field is in use.
  useEffect(() => {
    if (!visible) {
      setKeyboardHeight(0);
      return;
    }
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, e => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [visible]);

  // Close on a delay so the confirmation is actually seen. Tied to `loggedMl`
  // rather than fired inline so an unmount mid-countdown cancels it.
  useEffect(() => {
    if (loggedMl === null) return;
    const timer = setTimeout(onClose, CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [loggedMl, onClose]);

  const commit = async () => {
    if (selectedMl === null || savingMl !== null || loggedMl !== null) return;
    // The "Log" button sits where the navbar's "Log" tab is, so a double tap
    // on the tab used to open the sheet *and* log 500 ml. A press this soon
    // after opening is that second tap, not a decision.
    if (Date.now() - openedAt.current < OPEN_GUARD_MS) return;

    Keyboard.dismiss();
    setSavingMl(selectedMl);
    setFailed(false);
    try {
      const ok = await onLog(selectedMl);
      if (ok) {
        setLoggedMl(selectedMl);
      } else {
        setFailed(true);
      }
    } catch (error) {
      console.error('[Hydration] Quick log failed:', error);
      setFailed(true);
    } finally {
      setSavingMl(null);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Log water"
      subtitle={
        targetMl === null
          ? `${formatMl(totalMl)} TODAY`.toUpperCase()
          : `${formatMl(totalMl)} OF ${formatMl(targetMl)} TODAY`.toUpperCase()
      }
    >
      {/* Amounts. The sheet sizes to its content, so the bottom inset lives
          here rather than on the panel. */}
      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: keyboardHeight > 0 ? keyboardHeight + 16 : 28,
        }}
      >
        <QuickLogAmounts selection={selection} busy={busy} savingMl={savingMl} loggedMl={loggedMl} />

        {failed && (
          <Text
            style={{
              color: '#f43f5e',
              fontSize: 11,
              fontWeight: '700',
              textAlign: 'center',
              marginTop: 12,
            }}
          >
            Couldn't save that entry. Check your connection and try again.
          </Text>
        )}

        {/* Nothing is written until this is pressed, so an amount can be
            changed as many times as the user likes first. */}
        <Button
          label={quickLogButtonLabel(selection, loggedMl !== null)}
          onPress={commit}
          size="lg"
          fullWidth
          loading={savingMl !== null}
          disabled={selectedMl === null || loggedMl !== null}
          style={{ marginTop: 16 }}
          accessibilityLabel={quickLogButtonAccessibilityLabel(selection)}
        />
      </View>
    </Sheet>
  );
};

export default QuickLogSheet;
