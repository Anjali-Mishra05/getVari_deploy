import React, { useState } from 'react';
import { ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Battery,
  Bell,
  ChevronDown,
  ChevronUp,
  Droplets,
  FileText,
  Gauge,
  GlassWater,
  Info,
  LifeBuoy,
  Rocket,
  ShieldCheck,
  Watch,
  Wrench,
} from 'lucide-react-native';

import INFO_DOCUMENTS, { InfoSection, InfoTopic } from '../content/infoContent';
import { ThemeScope, tone, useThemeMode } from '../theme/theme';

/**
 * About, Terms & Conditions, Privacy Policy and Help & Support: one screen,
 * four documents, chosen by the `topic` route param, so all four share one
 * layout. Reached from the hamburger menu, and left with the back arrow or
 * the system back gesture.
 *
 * Each document is a title bar, a summary card, and then one card per
 * section. The legal documents number their sections; Help lists its topics
 * collapsed, each with its own icon, so the page reads as a list of things to
 * look up rather than as one text.
 */

type IconType = React.ComponentType<{ color?: string; size?: number }>;

const TOPIC_ICON: Record<InfoTopic, IconType> = {
  about: Info,
  terms: FileText,
  privacy: ShieldCheck,
  help: LifeBuoy,
};

/** Help topics, by heading. A heading with no entry falls back to the page icon. */
const HELP_ICON: Record<string, IconType> = {
  'Getting Started': Rocket,
  'Wearable / Device': Watch,
  'Hydration Risk Score': Gauge,
  'Daily Water Requirement': Droplets,
  'Fluid Logging': GlassWater,
  'Notifications & Reminders': Bell,
  'Wearable Battery': Battery,
  'Basic Troubleshooting': Wrench,
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  title: { fontSize: 18, fontWeight: '900', letterSpacing: -0.2 },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 48 },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    borderWidth: 1,
    padding: 16,
    marginBottom: 20,
  },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.6, textTransform: 'uppercase' },
  intro: { fontSize: 14, lineHeight: 21, marginTop: 4 },
  groupLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginBottom: 10,
    marginLeft: 4,
  },
  card: { borderRadius: 20, borderWidth: 1, marginBottom: 12, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  badge: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  badgeText: { fontSize: 12, fontWeight: '900' },
  heading: { flex: 1, fontSize: 15, fontWeight: '800', lineHeight: 20 },
  cardBody: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 2 },
  divider: { height: 1, marginHorizontal: 16, marginBottom: 12 },
  paragraph: { fontSize: 14, lineHeight: 22, marginBottom: 10 },
  itemRow: { flexDirection: 'row', marginBottom: 9 },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 8, marginRight: 12 },
  step: { width: 22, fontSize: 14, lineHeight: 22, fontWeight: '900' },
  itemText: { flex: 1, fontSize: 14, lineHeight: 22 },
});

const isTopic = (value: unknown): value is InfoTopic =>
  typeof value === 'string' && value in INFO_DOCUMENTS;

interface Palette {
  ink: string;
  body: string;
  muted: string;
  line: string;
  accent: string;
  card: string;
  tint: string;
}

/** A section's paragraphs, bullets and numbered steps. */
const SectionBody: React.FC<{ section: InfoSection; palette: Palette }> = ({ section, palette }) => (
  <View style={styles.cardBody}>
    {section.body.map((paragraph, index) => {
      const last = index === section.body.length - 1;
      const numbered = /^(\d+)\.\s+(.*)$/.exec(paragraph);
      if (paragraph.startsWith('• ')) {
        return (
          <View key={index} style={[styles.itemRow, last && { marginBottom: 0 }]}>
            <View style={[styles.dot, { backgroundColor: palette.accent }]} />
            <Text style={[styles.itemText, { color: palette.body }]}>{paragraph.slice(2)}</Text>
          </View>
        );
      }
      if (numbered) {
        return (
          <View key={index} style={[styles.itemRow, last && { marginBottom: 0 }]}>
            <Text style={[styles.step, { color: palette.accent }]}>{numbered[1]}.</Text>
            <Text style={[styles.itemText, { color: palette.body }]}>{numbered[2]}</Text>
          </View>
        );
      }
      return (
        <Text key={index} style={[styles.paragraph, { color: palette.body }, last && { marginBottom: 0 }]}>
          {paragraph}
        </Text>
      );
    })}
  </View>
);

const InfoScreen = ({ navigation, route }: any) => {
  const mode = useThemeMode();
  const requested = route?.params?.topic;
  const topic: InfoTopic = isTopic(requested) ? requested : 'help';
  const document = INFO_DOCUMENTS[topic];
  const isHelp = topic === 'help';

  /** Help topic open at the moment; the first one to begin with. */
  const [openTopic, setOpenTopic] = useState<string | null>(document.sections[0]?.heading ?? null);

  const palette: Palette = {
    ink: tone('#ffffff', '#18181b'),
    body: tone('#cbd5e1', '#3f3f46'),
    muted: tone('#64748b', '#71717a'),
    line: tone('rgba(255,255,255,0.08)', 'rgba(24,24,27,0.10)'),
    accent: tone('#00f2fe', '#0891b2'),
    card: tone('rgba(255,255,255,0.03)', '#ffffff'),
    tint: tone('rgba(0,242,254,0.10)', 'rgba(8,145,178,0.10)'),
  };
  const background = tone('#02050e', '#f5f5f3');
  const TopicIcon = TOPIC_ICON[topic];

  return (
    <ThemeScope.Provider value>
      <View style={[styles.fill, { backgroundColor: background }]}>
        <StatusBar barStyle={mode === 'light' ? 'dark-content' : 'light-content'} />
        <SafeAreaView style={styles.fill} edges={['top', 'left', 'right', 'bottom']}>
          <View style={[styles.header, { borderBottomColor: palette.line }]}>
            <TouchableOpacity
              style={[styles.back, { borderColor: palette.line }]}
              onPress={() => navigation.goBack()}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Back"
              testID="info-back"
            >
              <ArrowLeft color={palette.body} size={20} />
            </TouchableOpacity>
            <Text
              style={[styles.title, styles.fill, { color: palette.ink }]}
              numberOfLines={1}
              accessibilityRole="header"
              testID="info-title"
            >
              {document.title}
            </Text>
          </View>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {/* Summary */}
            <View style={[styles.hero, { backgroundColor: palette.card, borderColor: palette.line }]}>
              <View style={[styles.heroIcon, { backgroundColor: palette.tint }]}>
                <TopicIcon color={palette.accent} size={22} />
              </View>
              <View style={styles.fill}>
                <Text style={[styles.eyebrow, { color: palette.accent }]}>{document.subtitle}</Text>
                <Text style={[styles.intro, { color: palette.body }]}>{document.intro}</Text>
              </View>
            </View>

            {isHelp && <Text style={[styles.groupLabel, { color: palette.muted }]}>Topics</Text>}

            {document.sections.map((section, index) => {
              const open = !isHelp || openTopic === section.heading;
              const SectionIcon = HELP_ICON[section.heading] ?? TopicIcon;
              const header = (
                <>
                  <View style={[styles.badge, { backgroundColor: palette.tint }]}>
                    {isHelp ? (
                      <SectionIcon color={palette.accent} size={16} />
                    ) : (
                      <Text style={[styles.badgeText, { color: palette.accent }]}>{index + 1}</Text>
                    )}
                  </View>
                  <Text style={[styles.heading, { color: palette.ink }]} accessibilityRole="header">
                    {section.heading}
                  </Text>
                </>
              );

              return (
                <View
                  key={section.heading}
                  style={[styles.card, { backgroundColor: palette.card, borderColor: palette.line }]}
                >
                  {isHelp ? (
                    <TouchableOpacity
                      style={styles.cardHeader}
                      onPress={() => setOpenTopic(open ? null : section.heading)}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={section.heading}
                      accessibilityState={{ expanded: open }}
                      testID={`help-topic-${index}`}
                    >
                      {header}
                      {open ? (
                        <ChevronUp color={palette.muted} size={18} />
                      ) : (
                        <ChevronDown color={palette.muted} size={18} />
                      )}
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.cardHeader}>{header}</View>
                  )}

                  {open && (
                    <>
                      <View style={[styles.divider, { backgroundColor: palette.line }]} />
                      <SectionBody section={section} palette={palette} />
                    </>
                  )}
                </View>
              );
            })}
          </ScrollView>
        </SafeAreaView>
      </View>
    </ThemeScope.Provider>
  );
};

export default InfoScreen;
