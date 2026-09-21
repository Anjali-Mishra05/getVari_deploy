import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ChartColumn, Droplets, TrendingUp } from 'lucide-react-native';

import { ACCENT } from './riskTheme';

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
    bottom: 32,
    left: 32,
    right: 32,
    height: 80,
    backgroundColor: 'rgba(10,10,10,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
  },
  item: { alignItems: 'center', justifyContent: 'center' },
  slot: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedSlot: {
    backgroundColor: 'rgba(0,242,254,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0,242,254,0.35)',
  },
  label: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const IDLE = '#64748b';

/**
 * The bar has a fixed height and four fixed slots, so its labels cannot grow
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
  const dashboardSelected = active === 'dashboard';
  const analyticsSelected = active === 'analytics';

  return (
    <View style={styles.bar}>
      <TouchableOpacity
        style={styles.item}
        onPress={() => onSelect('dashboard')}
        accessibilityRole="tab"
        accessibilityState={{ selected: dashboardSelected }}
        accessibilityLabel="Dashboard"
      >
        <View style={[styles.slot, dashboardSelected && styles.selectedSlot]}>
          <TrendingUp
            color={dashboardSelected ? ACCENT : IDLE}
            size={22}
            strokeWidth={dashboardSelected ? 2.5 : 2}
          />
        </View>
        <Text {...LABEL_FIT} style={[styles.label, { color: dashboardSelected ? ACCENT : IDLE }]}>Dashboard</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.item}
        onPress={onLogWater}
        accessibilityRole="button"
        accessibilityLabel="Log water"
      >
        <View style={styles.slot}>
          <Droplets color={IDLE} size={22} />
        </View>
        <Text {...LABEL_FIT} style={[styles.label, { color: IDLE }]}>Log</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.item}
        onPress={() => onSelect('analytics')}
        accessibilityRole="tab"
        accessibilityState={{ selected: analyticsSelected }}
        accessibilityLabel="Analytics"
      >
        <View style={[styles.slot, analyticsSelected && styles.selectedSlot]}>
          <ChartColumn
            color={analyticsSelected ? ACCENT : IDLE}
            size={22}
            strokeWidth={analyticsSelected ? 2.5 : 2}
          />
        </View>
        <Text {...LABEL_FIT} style={[styles.label, { color: analyticsSelected ? ACCENT : IDLE }]}>Analytics</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.item}
        onPress={onOpenProfile}
        accessibilityRole="button"
        accessibilityLabel="Profile and account settings"
      >
        <View style={styles.slot}>
          <View style={styles.avatar}>
            <Text style={{ fontSize: 10, fontWeight: '900', color: IDLE }}>{profileInitial}</Text>
          </View>
        </View>
        <Text {...LABEL_FIT} style={[styles.label, { color: IDLE }]}>Account</Text>
      </TouchableOpacity>
    </View>
  );
};

export default DashboardNav;
