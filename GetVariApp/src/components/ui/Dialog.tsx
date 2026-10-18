import React from 'react';
import { Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { X } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ICON_HIT_SLOP } from './Sheet';
import { useScopedTheme } from '../../theme/theme';

/**
 * A centred dialog — the confirm/receipt half of the popup family.
 *
 * Same rule as `Sheet`: the animation is the Modal's own, never a Reanimated
 * layout animation, because that combination leaves the touch targets behind
 * on Android and makes Cancel and the close X unpressable.
 *
 * Every dialog gets a close affordance whether or not it also has buttons.
 * Two of these used to have none at all, so a dialog that failed to save left
 * the user tapping the scrim and hoping.
 */

interface DialogProps {
  visible: boolean;
  /** Called by the close button, the scrim and the Android back gesture. */
  onDismiss: () => void;
  /** Hides the corner close button for a dialog that must be answered. */
  hideCloseButton?: boolean;
  /** Blocks the scrim and back-gesture dismissals while a write is in flight. */
  busy?: boolean;
  accessibilityLabel?: string;
  children: React.ReactNode;
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(1,4,10,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  safeArea: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  panel: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 36,
    padding: 24,
    alignItems: 'center',
    backgroundColor: '#080d16',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  close: {
    position: 'absolute',
    top: 10,
    right: 10,
    padding: 10,
    zIndex: 2,
  },
});

const Dialog: React.FC<DialogProps> = ({
  visible,
  onDismiss,
  hideCloseButton = false,
  busy = false,
  accessibilityLabel,
  children,
}) => {
  const dismiss = () => {
    if (!busy) onDismiss();
  };
  const { pick } = useScopedTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={dismiss}
    >
      <GestureHandlerRootView
        style={[styles.scrim, { backgroundColor: pick('rgba(1,4,10,0.92)', 'rgba(24,24,27,0.5)') }]}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={dismiss}
          style={styles.backdrop}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        />

        {/* The card is centred in what is left of the window once the system
            bars are taken out, so it never sits under Android's navigation.
            `box-none`: the empty space around it still dismisses. */}
        <SafeAreaView style={styles.safeArea} pointerEvents="box-none">
        <View
          style={[
            styles.panel,
            {
              backgroundColor: pick('#080d16', '#ffffff'),
              borderColor: pick('rgba(255,255,255,0.1)', 'rgba(24,24,27,0.12)'),
            },
          ]}
          accessibilityLabel={accessibilityLabel}
        >
          {!hideCloseButton && (
            <TouchableOpacity
              onPress={dismiss}
              disabled={busy}
              style={styles.close}
              hitSlop={ICON_HIT_SLOP}
              accessibilityRole="button"
              accessibilityLabel="Close"
              testID="dialog-close"
            >
              <X color={busy ? pick('#334155', '#d4d4d8') : pick('#94a3b8', '#52525b')} size={20} />
            </TouchableOpacity>
          )}
          {children}
        </View>
        </SafeAreaView>
      </GestureHandlerRootView>
    </Modal>
  );
};

export default Dialog;
