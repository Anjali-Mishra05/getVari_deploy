import React from 'react';
import {
  Modal,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { X } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useScopedTheme } from '../../theme/theme';
import { SHEET_SAFE_EDGES } from '../../utils/navLayout';

/**
 * The chrome every popup in the app shares: the scrim, the panel, the title
 * row and — the point of the exercise — a close button that works.
 *
 * ## Why the animation is the Modal's and not Reanimated's
 *
 * Every sheet used to animate itself with a Reanimated layout animation
 * (`entering={SlideInDown}`) on a view inside an RN `Modal`. On Android that
 * combination moves the rendered view without moving its touch target: the
 * pixels slide up, the hit box stays where the view was laid out, and every
 * control in the panel — the close X, Cancel, the delete bin — ends up
 * responding somewhere the user is not pressing. That is the "close icon
 * doesn't work in any popup" report, and it is why nothing in here uses a
 * layout animation. `Modal`'s own `animationType` is driven natively, so the
 * view and its hit box move together.
 *
 * Every control also carries `hitSlop`: a 24px icon is an 8mm target, which is
 * under the 9mm minimum even when the hit box is in the right place.
 */

interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** Small uppercase line under the title. */
  subtitle?: string;
  /** Extra header controls, drawn to the left of the close button. */
  headerActions?: React.ReactNode;
  /**
   * Panel height as a fraction of the screen. Omit to size to the content,
   * which is right for a short sheet and wrong for a scrolling list.
   */
  heightFraction?: number;
  /** Wraps the children in a ScrollView. Off for a sheet that scrolls itself. */
  scrollable?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

/** Presses land inside this many px of a control's edge. */
export const ICON_HIT_SLOP = { top: 12, bottom: 12, left: 12, right: 12 };

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  backdrop: { flex: 1 },
  panel: {
    backgroundColor: '#020617',
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
  },
  grabber: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.14)',
    marginTop: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  title: { color: '#ffffff', fontWeight: '900', fontSize: 16 },
  subtitle: {
    color: '#64748b',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 2,
    marginTop: 3,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  iconButton: { padding: 10 },
});

const Sheet: React.FC<SheetProps> = ({
  visible,
  onClose,
  title,
  subtitle,
  headerActions,
  heightFraction,
  scrollable = false,
  contentContainerStyle,
  children,
}) => {
  const { height: windowHeight } = useWindowDimensions();
  // Light only inside a screen that follows the mode; dark everywhere else.
  const { pick } = useScopedTheme();
  const panelHeight = heightFraction
    ? Math.min(windowHeight * heightFraction, windowHeight - 60)
    : undefined;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* RN's Modal opens its own native window outside the app root's
          GestureHandlerRootView; without one here, gesture-handler swallows
          touches inside the sheet on Android. */}
      <GestureHandlerRootView
        style={[styles.scrim, { backgroundColor: pick('rgba(0,0,0,0.75)', 'rgba(24,24,27,0.45)') }]}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={onClose}
          style={styles.backdrop}
          accessibilityRole="button"
          accessibilityLabel={`Close ${title}`}
        />

        {/* The panel is a safe-area view on its bottom and side edges, for
            every sheet at once: where this window runs under Android's
            navigation (a gesture handle, or the taller 3-button bar) the
            panel's surface continues behind it and the content — the last
            row, the action buttons — ends above it. The inset is measured for
            this window, so where the system keeps the window clear of its
            navigation nothing is added. */}
        <SafeAreaView
          edges={SHEET_SAFE_EDGES}
          style={[
            styles.panel,
            {
              backgroundColor: pick('#020617', '#ffffff'),
              borderColor: pick('rgba(255,255,255,0.2)', '#e4e4e7'),
            },
            panelHeight ? { height: panelHeight } : null,
          ]}
        >
          <View
            style={[styles.grabber, { backgroundColor: pick('rgba(255,255,255,0.14)', 'rgba(24,24,27,0.18)') }]}
          />

          <View
            style={[
              styles.header,
              { borderBottomColor: pick('rgba(255,255,255,0.05)', 'rgba(24,24,27,0.08)') },
            ]}
          >
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={[styles.title, { color: pick('#ffffff', '#18181b') }]} numberOfLines={1}>
                {title}
              </Text>
              {!!subtitle && (
                <Text style={styles.subtitle} numberOfLines={1}>
                  {subtitle}
                </Text>
              )}
            </View>

            <View style={styles.headerActions}>
              {headerActions}
              <TouchableOpacity
                onPress={onClose}
                style={styles.iconButton}
                hitSlop={ICON_HIT_SLOP}
                accessibilityRole="button"
                accessibilityLabel={`Close ${title}`}
                testID="sheet-close"
              >
                <X color={pick('#94a3b8', '#52525b')} size={24} />
              </TouchableOpacity>
            </View>
          </View>

          {scrollable ? (
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={[{ paddingBottom: 40 }, contentContainerStyle]}
            >
              {children}
            </ScrollView>
          ) : (
            children
          )}
        </SafeAreaView>
      </GestureHandlerRootView>
    </Modal>
  );
};

export default Sheet;
