import React, { useMemo, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { RotateCcw } from 'lucide-react-native';

import Sheet from './ui/Sheet';
import { HydrationRiskEngine } from '../utils/hydrationRiskEngine';
import { SensorOverride } from '../hooks/useHydrationTelemetry';
import { RISK_SPEC_PRESETS, RiskSpecPreset } from '../utils/riskSpecPresets';
import {
  RISK_CHANNELS,
  RiskChannelSpec,
  channelText,
  overrideFromDraft,
  trimToDecimals,
} from '../utils/riskChannels';
import { UserProfile } from '../types';

/**
 * The sensor override panel used to check the risk algorithm on a device.
 *
 * ## Why this exists
 *
 * The dashboard never shows a solve over readings anyone chose. The stream is
 * simulated from the profile — the activity level sets the resting heart rate
 * and movement index, the city's climate band sets ambient temperature and
 * humidity — and it drifts. So "the document says an 85 kg diabetic in Mumbai
 * scores 64, the app shows 26" was, for a long time, impossible to investigate
 * from the app: both numbers were right, for different readings, and nothing
 * on screen said what readings were in play.
 *
 * This panel pins the five channels the engine actually weighs and prints the
 * solve beside them, so that question is answered by looking rather than by
 * reading `useHydrationTelemetry`.
 *
 * ## What it is not
 *
 * It does not override the *profile*. Weight, medical conditions and city stay
 * as onboarding stored them, and they move the score as much as the readings
 * do — which is why each preset below names the profile it expects and the
 * panel says plainly when the current one differs.
 */

/**
 * The channels, their units and their bounds now live beside the engine they
 * describe (`utils/riskChannels`), because the dashboard's load breakdown
 * edits the same five readings and the two must not disagree about what is
 * accepted.
 */
type ChannelSpec = RiskChannelSpec;
const CHANNELS = RISK_CHANNELS;

const STATUS_COLOR: Record<string, string> = {
  Hydrated: '#10b981',
  'Mild Risk': '#f59e0b',
  'High Risk': '#f97316',
  Critical: '#ef4444',
  'Insufficient Data': '#64748b',
  'Device Error': '#a78bfa',
};

interface SensorTestPanelProps {
  visible: boolean;
  onClose: () => void;
  profile?: UserProfile;
  /** Readings the stream is showing right now, used to seed the fields. */
  live: { heartRate: number | null; activityLoad: number | null; temperature: number | null; humidity: number | null; gapHours: number };
  override: SensorOverride | null;
  onApply: (override: SensorOverride | null) => void;
}

const SensorTestPanel: React.FC<SensorTestPanelProps> = ({
  visible,
  onClose,
  profile,
  live,
  override,
  onApply,
}) => {
  /**
   * Field values as *text*, not numbers.
   *
   * A numeric state cannot represent "the user has cleared the box to type a
   * new value", and coercing an empty string to 0 mid-edit both jumps the
   * score and fights the keyboard.
   */
  const [draft, setDraft] = useState<Record<string, string>>(() => seed(override, live));

  // Re-seed whenever the sheet is opened, so it always opens showing what the
  // engine is currently being given rather than a stale edit from last time.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setDraft(seed(override, live));
  }

  /** The draft as an override, dropping anything blank or out of range. */
  const parsed = useMemo<SensorOverride>(() => overrideFromDraft(draft), [draft]);

  /**
   * The solve over the draft, against the real profile.
   *
   * Computed here rather than read back off the dashboard so the panel shows
   * the answer while the user is still typing, and so it is the *unsmoothed*
   * score — the published one is held back by `MIN_REPUBLISH_MS` and would lag
   * the fields it is supposed to explain.
   */
  const preview = useMemo(() => {
    const complete =
      parsed.heartRate !== undefined &&
      parsed.activityLoad !== undefined &&
      parsed.temperature !== undefined &&
      parsed.humidity !== undefined &&
      parsed.gapHours !== undefined;
    if (!complete) return null;

    return HydrationRiskEngine.solveRisk(
      {
        heartRate: parsed.heartRate!,
        activityLoad: parsed.activityLoad!,
        temperature: parsed.temperature!,
        humidity: parsed.humidity!,
        timeSinceWaterIntake: parsed.gapHours!,
      },
      profile
    );
  }, [parsed, profile]);

  const weights = useMemo(() => HydrationRiskEngine.getNormalizedWeights(profile), [profile]);

  const nudge = (c: ChannelSpec, direction: 1 | -1) => {
    const current = Number(draft[c.key] ?? 0);
    const base = Number.isFinite(current) ? current : 0;
    const next = Math.min(c.max, Math.max(c.min, base + direction * c.step));
    setDraft(d => ({ ...d, [c.key]: trimToDecimals(next, c.decimals) }));
  };

  const loadPreset = (preset: RiskSpecPreset) => {
    setDraft({
      heartRate: String(preset.readings.heartRate),
      activityLoad: String(preset.readings.activityLoad),
      temperature: String(preset.readings.temperature),
      humidity: String(preset.readings.humidity),
      gapHours: String(preset.readings.gapHours),
    });
  };

  /** How the current profile differs from what a preset's score assumes. */
  const mismatch = (preset: RiskSpecPreset): string | null => {
    if (!profile) return 'no profile loaded';
    const gaps: string[] = [];
    if (Math.round(profile.weightKg) !== preset.needs.weightKg) {
      gaps.push(`${Math.round(profile.weightKg)} kg not ${preset.needs.weightKg}`);
    }
    const have = [...(profile.medicalConditions ?? [])].sort().join(',');
    const want = [...preset.needs.conditions].sort().join(',');
    if (have !== want) gaps.push(want === '' ? 'has conditions' : `not ${want}`);
    const city = profile.location ?? profile.selectedCity ?? '';
    if (!city.includes(preset.needs.city)) gaps.push(`in ${city || 'no city'}`);
    return gaps.length > 0 ? gaps.join(' · ') : null;
  };

  const statusColor = preview?.status ? STATUS_COLOR[preview.status] ?? '#64748b' : '#64748b';

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Sensor test panel"
      subtitle="ALGORITHM VERIFICATION"
      heightFraction={0.92}
      scrollable
    >
      <View className="px-6 pb-8">
        {/* Live solve */}
        <View
          className="rounded-2xl border px-5 py-4 mb-5"
          style={{ borderColor: `${statusColor}55`, backgroundColor: `${statusColor}12` }}
        >
          <View className="flex-row items-end justify-between">
            <View>
              <Text className="text-[9px] uppercase tracking-[0.18em] text-neutral-400 font-mono font-black">
                Risk score
              </Text>
              <Text className="text-[44px] leading-[50px] font-black text-white">
                {preview?.score ?? '--'}
              </Text>
            </View>
            <View className="items-end pb-2">
              <Text className="text-[13px] font-black" style={{ color: statusColor }}>
                {preview?.status ?? 'Fill every field'}
              </Text>
              {preview?.glassesRequired !== undefined && (
                <Text className="text-[10px] text-neutral-400 font-mono mt-1">
                  {preview.glassesRequired} glass{preview.glassesRequired === 1 ? '' : 'es'}
                </Text>
              )}
            </View>
          </View>

          {preview && (
            <View className="mt-4 pt-3 border-t border-white/10">
              <Text className="text-[9px] uppercase tracking-[0.15em] text-neutral-500 font-mono font-black mb-2">
                Load × weight per channel
              </Text>
              {([
                ['Heart', preview.heartLoad, weights.heart],
                ['Activity', preview.activityLoad, weights.activity],
                ['Temp', preview.temperatureLoad, weights.temp],
                ['Humidity', preview.humidityLoad, weights.humidity],
                ['Gap', preview.timeLoad, weights.time],
              ] as [string, number | null, number][]).map(([name, load, weight]) => (
                <View key={name} className="flex-row items-center justify-between py-[3px]">
                  <Text className="text-[11px] text-neutral-300 font-medium w-20">{name}</Text>
                  <View className="flex-1 h-[6px] rounded-full bg-white/[0.06] mx-2 overflow-hidden">
                    <View
                      className="h-full rounded-full"
                      style={{ width: `${Math.min(100, load ?? 0)}%`, backgroundColor: statusColor }}
                    />
                  </View>
                  <Text className="text-[10px] text-neutral-400 font-mono w-24 text-right">
                    {load ?? '--'} × {weight.toFixed(2)}
                  </Text>
                </View>
              ))}
              <Text className="text-[9px] text-neutral-500 font-mono mt-2 leading-[13px]">
                Weights come from this profile. Loads shown are pre-multiplier; condition and
                climate multipliers are applied inside the solve.
              </Text>
            </View>
          )}
        </View>

        {/* Channels */}
        {CHANNELS.map(c => (
          <View key={c.key} className="mb-4">
            <View className="flex-row items-center justify-between mb-1.5">
              <Text className="text-[12px] font-bold text-white">{c.label}</Text>
              <Text className="text-[10px] text-neutral-500 font-mono">{c.unit}</Text>
            </View>
            <View className="flex-row items-center gap-2">
              <TouchableOpacity
                className="w-11 h-11 rounded-xl bg-white/[0.04] border border-white/10 items-center justify-center"
                onPress={() => nudge(c, -1)}
                accessibilityRole="button"
                accessibilityLabel={`Decrease ${c.label}`}
              >
                <Text className="text-white text-[20px] font-black">−</Text>
              </TouchableOpacity>
              <TextInput
                className="flex-1 h-11 rounded-xl bg-white/[0.03] border border-white/10 text-white text-[16px] font-black text-center"
                value={draft[c.key] ?? ''}
                onChangeText={t => setDraft(d => ({ ...d, [c.key]: t }))}
                keyboardType="numeric"
                placeholder="--"
                placeholderTextColor="#475569"
                underlineColorAndroid="transparent"
                accessibilityLabel={`${c.label} in ${c.unit}`}
              />
              <TouchableOpacity
                className="w-11 h-11 rounded-xl bg-white/[0.04] border border-white/10 items-center justify-center"
                onPress={() => nudge(c, 1)}
                accessibilityRole="button"
                accessibilityLabel={`Increase ${c.label}`}
              >
                <Text className="text-white text-[20px] font-black">+</Text>
              </TouchableOpacity>
            </View>
            <Text className="text-[9px] text-neutral-500 font-mono mt-1">bands {c.bands}</Text>
          </View>
        ))}

        {/* Presets */}
        <Text className="text-[9px] uppercase tracking-[0.18em] text-neutral-400 font-mono font-black mt-2 mb-2">
          Documented use cases
        </Text>
        {RISK_SPEC_PRESETS.map(p => {
          const gap = mismatch(p);
          return (
            <TouchableOpacity
              key={p.id}
              className="rounded-xl bg-white/[0.02] border border-white/10 px-4 py-3 mb-2"
              onPress={() => loadPreset(p)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Load ${p.title}`}
            >
              <View className="flex-row items-center justify-between">
                <Text className="text-[12px] font-bold text-white flex-1 pr-3">{p.title}</Text>
                <Text className="text-[12px] font-black text-[#00f2fe]">→ {p.expected}</Text>
              </View>
              <Text className="text-[9px] text-neutral-500 font-mono mt-1">
                HR {p.readings.heartRate} · act {p.readings.activityLoad} · {p.readings.temperature}°C ·{' '}
                {p.readings.humidity}% · {p.readings.gapHours}h → {p.expectedStatus}
              </Text>
              {gap && (
                <Text className="text-[9px] text-amber-500/90 font-mono mt-1 leading-[13px]">
                  Your profile is {gap} — expect a different score.
                </Text>
              )}
            </TouchableOpacity>
          );
        })}

        {/* Actions */}
        <View className="flex-row gap-3 mt-5">
          <TouchableOpacity
            className="flex-1 h-12 rounded-2xl bg-white/[0.04] border border-white/10 items-center justify-center flex-row gap-2"
            onPress={() => {
              onApply(null);
              setDraft(seed(null, live));
            }}
            accessibilityRole="button"
            accessibilityLabel="Release the pinned readings"
          >
            <RotateCcw size={15} color="#94a3b8" />
            <Text className="text-[12px] font-black text-neutral-300 uppercase tracking-wider">
              Release
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="flex-1 h-12 rounded-2xl bg-[#00f2fe] items-center justify-center"
            onPress={() => {
              onApply(parsed);
              onClose();
            }}
            accessibilityRole="button"
            accessibilityLabel="Pin these readings to the dashboard"
          >
            <Text className="text-[12px] font-black text-[#020617] uppercase tracking-wider">
              Pin to dashboard
            </Text>
          </TouchableOpacity>
        </View>

        <Text className="text-[9px] text-neutral-500 font-mono mt-3 leading-[14px]">
          Pinned readings hold still — no drift, no noise — until released. They change only what
          the dashboard displays on this device; nothing is written to the account.
        </Text>
      </View>
    </Sheet>
  );
};

/** Field text for the sheet's initial state: the pin if there is one, else the live stream. */
const seed = (
  override: SensorOverride | null,
  live: SensorTestPanelProps['live']
): Record<string, string> => ({
  heartRate: channelText(override?.heartRate ?? live.heartRate, 0),
  activityLoad: channelText(override?.activityLoad ?? live.activityLoad, 0),
  temperature: channelText(override?.temperature ?? live.temperature, 1),
  humidity: channelText(override?.humidity ?? live.humidity, 0),
  gapHours: channelText(override?.gapHours ?? live.gapHours, 2),
});

export default SensorTestPanel;
