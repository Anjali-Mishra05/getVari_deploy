import React from 'react';
import { StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { ChevronRight, FileText, Info, LifeBuoy, Moon, ShieldCheck, Sun } from 'lucide-react-native';

import Sheet from '../ui/Sheet';
import type { InfoTopic } from '../../content/infoContent';
import { accent, setThemeMode, themedStyles, tone, useThemeMode } from '../../theme/theme';

/**
 * The hamburger menu: About, Terms & Conditions, Privacy Policy, Help &
 * Support and the Dark/Light mode switch — the things that are about the app
 * rather than about today's hydration.
 *
 * The switch has no state of its own. It shows the shared theme mode and
 * writes to it, so it always agrees with the toggle on the dashboard.
 */

interface DashboardMenuProps {
  visible: boolean;
  onClose: () => void;
  /** Opens one of the four documents. The menu is closed by the caller. */
  onOpenTopic: (topic: InfoTopic) => void;
}

const idle = () => tone('#94a3b8', '#52525b');
const muted = () => tone('#475569', '#a1a1aa');

const styles = themedStyles(() => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: tone('rgba(255,255,255,0.05)', 'rgba(24,24,27,0.08)'),
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    backgroundColor: tone('rgba(255,255,255,0.04)', 'rgba(24,24,27,0.04)'),
    borderWidth: 1,
    borderColor: tone('rgba(255,255,255,0.08)', 'rgba(24,24,27,0.10)'),
  },
  label: { flex: 1, color: tone('#ffffff', '#18181b'), fontSize: 14, fontWeight: '800' },
  value: {
    color: '#64748b',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginRight: 10,
  },
}));

interface RowProps {
  testID: string;
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
}

const Row: React.FC<RowProps> = ({ testID, icon, label, onPress }) => (
  <TouchableOpacity
    style={styles.row}
    onPress={onPress}
    activeOpacity={0.7}
    accessibilityRole="button"
    accessibilityLabel={label}
    testID={testID}
  >
    <View style={styles.icon}>{icon}</View>
    <Text style={styles.label} numberOfLines={1}>
      {label}
    </Text>
    <ChevronRight color={muted()} size={16} />
  </TouchableOpacity>
);

const DashboardMenu: React.FC<DashboardMenuProps> = ({ visible, onClose, onOpenTopic }) => {
  const light = useThemeMode() === 'light';
  const setLight = (next: boolean) => setThemeMode(next ? 'light' : 'dark');

  return (
    <Sheet visible={visible} onClose={onClose} title="Menu" subtitle="GETVARI" scrollable>
      <Row
        testID="menu-about"
        icon={<Info color={accent()} size={17} />}
        label="About"
        onPress={() => onOpenTopic('about')}
      />
      <Row
        testID="menu-terms"
        icon={<FileText color={idle()} size={17} />}
        label="Terms & Conditions"
        onPress={() => onOpenTopic('terms')}
      />
      <Row
        testID="menu-privacy"
        icon={<ShieldCheck color={idle()} size={17} />}
        label="Privacy Policy"
        onPress={() => onOpenTopic('privacy')}
      />
      <Row
        testID="menu-help"
        icon={<LifeBuoy color={idle()} size={17} />}
        label="Help & Support"
        onPress={() => onOpenTopic('help')}
      />

      {/* The whole row toggles, and so does the switch in it: one control. */}
      <TouchableOpacity
        style={styles.row}
        onPress={() => setLight(!light)}
        activeOpacity={0.7}
        accessibilityRole="switch"
        accessibilityLabel="Light mode"
        accessibilityState={{ checked: light }}
        testID="menu-theme"
      >
        <View style={styles.icon}>
          {light ? <Sun color="#b45309" size={17} /> : <Moon color={idle()} size={17} />}
        </View>
        <Text style={styles.label} numberOfLines={1}>
          Dark Mode / Light Mode
        </Text>
        <Text style={styles.value} numberOfLines={1}>
          {light ? 'Light' : 'Dark'}
        </Text>
        <Switch
          value={light}
          onValueChange={setLight}
          trackColor={{ false: 'rgba(255,255,255,0.15)', true: 'rgba(8,145,178,0.35)' }}
          thumbColor={light ? '#0891b2' : '#94a3b8'}
          importantForAccessibility="no"
          testID="menu-theme-switch"
        />
      </TouchableOpacity>
    </Sheet>
  );
};

export default DashboardMenu;
