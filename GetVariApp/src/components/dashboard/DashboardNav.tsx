import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ChartColumn, Droplets, TrendingUp } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NAV_HEIGHT, navBottomOffset, sideInset } from '../../utils/navLayout';
import { ACCENT } from './riskTheme';
import { tone } from '../../theme/theme';

/**
 * The bottom bar.
 *
 * ## What was wrong with the old one
 *
 * It had four items. The first had no `onPress` at all — it was drawn in the
 * selected style permanently and did nothing. The third expanded a panel that
 * already lives inside the dashboard, so tapping it produced *the same screen
 * with one extra section*, while lighting up in the same selected style. Two
 * items therefore looked active at once, and the app appeared to have two
 * destinations that showed the same data.
 *
 * ## What it is now
 *
 * There is one screen, so there is one destination, and only it can be
 * selected. The other two entries are *actions* — they open a sheet and come
 * back — and are drawn as actions: no pill, no accent fill, no selected state
 * to compete with the destination. The recovery telemetry keeps the expander
 * it already has inside the dashboard, which is where a section of a page
 * belongs.
 */

/** The two destinations: the live dashboard and the history/analytics view. */
export type DashboardTab = 'dashboard' | 'analytics';

interface DashboardNavProps {
  /** The current destination. One entry today; the shape holds for more. */
  active: DashboardTab;
  onSelect: (tab: DashboardTab) => void;
  onLogWater: () => void;
  onOpenProfile: () => void;
  /** Initial drawn in the account avatar. */
  profileInitial: string;
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    // Docked edge to edge. Its height and padding are set at render, from the
    // system insets.
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(10,10,10,0.92)',
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  // Four equal columns, whatever the width: each item is centred in its own
  // quarter of the bar and the whole quarter is the touch target.
  item: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  slot: {
    width: 40,
    height: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedSlot: {
    backgroundColor: 'rgba(0,242,254,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0,242,254,0.35)',
  },
  label: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 4,
    alignSelf: 'stretch',
    textAlign: 'center',
    paddingHorizontal: 2,
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const IDLE = '#64748b';
const ICON_SIZE = 20;

/**
 * The bar has a fixed height and four equal columns, so its labels cannot grow
 * with the system font size: at 130% "ANALYTICS" ran into "ACCOUNT". They
 * stay on one line and shrink to fit instead.
 */
const LABEL_FIT = { numberOfLines: 1, adjustsFontSizeToFit: true, maxFontSizeMultiplier: 1 } as const;

const DashboardNav: React.FC<DashboardNavProps> = ({
  active,
  onSelect,
  onLogWater,
  onOpenProfile,
  profileInitial,
}) => {
  // The system's own navigation shares the bottom of the screen: the bar's
  // surface runs behind it and its items sit above it, whichever kind it is
  // (see `navLayout`).
  const insets = useSafeAreaInsets();
  const bottomInset = navBottomOffset(insets.bottom);
  const dashboardSelected = active === 'dashboard';
  const analyticsSelected = active === 'analytics';
  /** The accent is too pale to read on a light bar. */
  const selected = tone(ACCENT, '#0e7490');
  /** Unselected icons and labels: darker on white, to hold their contrast. */
  const idle = tone(IDLE, '#52525b');
  /** A neutral grey behind the selected item, not a blue block: the accent
   *  is carried by the icon and label alone. Translucent like the bar. */
  const selectedSlot = tone(styles.selectedSlot, {
    backgroundColor: 'rgba(24,24,27,0.06)',
    borderWidth: 0,
    borderColor: 'transparent',
  });

  return (
    <View
      style={[
        styles.bar,
        {
          height: NAV_HEIGHT + bottomInset,
          paddingBottom: bottomInset,
          // The surface spans the screen; the items keep clear of a cutout or
          // a side navigation bar in landscape.
          paddingLeft: 8 + sideInset(insets.left),
          paddingRight: 8 + sideInset(insets.right),
          // The same translucency in both modes — 92% — over each mode's own
          // surface colour: near-black in dark, a light neutral grey in light
          // (a step darker than the off-white page and the white cards, so
          // the bar still reads as its own surface).
          //
          // No shadow: Android draws one *through* a translucent view, as a
          // grey smear inside the bar. The top border separates it from the page.
          backgroundColor: tone('rgba(10,10,10,0.92)', 'rgba(233,233,231,0.92)'),
          borderColor: tone('rgba(255,255,255,0.1)', 'rgba(24,24,27,0.14)'),
        },
      ]}
    >
      <TouchableOpacity
        style={styles.item}
        onPress={() => onSelect('dashboard')}
        accessibilityRole="tab"
        accessibilityState={{ selected: dashboardSelected }}
        accessibilityLabel="Dashboard"
      >
        <View style={[styles.slot, dashboardSelected && selectedSlot]}>
          <TrendingUp
            color={dashboardSelected ? selected : idle}
            size={ICON_SIZE}
            strokeWidth={dashboardSelected ? 2.5 : 2}
          />
        </View>
        <Text {...LABEL_FIT} style={[styles.label, { color: dashboardSelected ? selected : idle }]}>Dashboard</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.item}
        onPress={onLogWater}
        accessibilityRole="button"
        accessibilityLabel="Log water"
      >
        <View style={styles.slot}>
          <Droplets color={idle} size={ICON_SIZE} />
        </View>
        <Text {...LABEL_FIT} style={[styles.label, { color: idle }]}>Log</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.item}
        onPress={() => onSelect('analytics')}
        accessibilityRole="tab"
        accessibilityState={{ selected: analyticsSelected }}
        accessibilityLabel="Analytics"
      >
        <View style={[styles.slot, analyticsSelected && selectedSlot]}>
          <ChartColumn
            color={analyticsSelected ? selected : idle}
            size={ICON_SIZE}
            strokeWidth={analyticsSelected ? 2.5 : 2}
          />
        </View>
        <Text {...LABEL_FIT} style={[styles.label, { color: analyticsSelected ? selected : idle }]}>Analytics</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.item}
        onPress={onOpenProfile}
        accessibilityRole="button"
        accessibilityLabel="Profile and account settings"
      >
        <View style={styles.slot}>
          <View
            style={[
              styles.avatar,
              {
                backgroundColor: tone('rgba(255,255,255,0.06)', '#f4f4f5'),
                borderColor: tone('rgba(255,255,255,0.12)', '#d4d4d8'),
              },
            ]}
          >
            <Text style={{ fontSize: 10, fontWeight: '900', color: idle }}>{profileInitial}</Text>
          </View>
        </View>
        <Text {...LABEL_FIT} style={[styles.label, { color: idle }]}>Account</Text>
      </TouchableOpacity>
    </View>
  );
};

export default DashboardNav;
