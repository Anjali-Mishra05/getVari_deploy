import React, { useEffect, useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import {
  Check,
  ChevronDown,
  CircleAlert,
  MapPin,
  Moon,
  Sunrise,
  Target,
} from 'lucide-react-native';

import Button from './ui/Button';
import Sheet from './ui/Sheet';
import NumberField from './ui/NumberField';
import TimeField from './TimeField';
import CityPickerModal from './CityPickerModal';
import ProfileService from '../services/ProfileService';
import ConfigService from '../services/ConfigService';
import useAppConfig from '../hooks/useAppConfig';
import { computeTargetDailyMl, validatePhysicianLimitMl } from '../utils/hydrationTarget';
import LocationService from '../services/LocationService';
import {
  DEFAULT_SLEEP_SCHEDULE,
  awakeHoursPerDay,
  normaliseSleepSchedule,
  sleepDurationMinutes,
} from '../utils/sleepWindow';
import type { UserProfile } from '../types';

interface ProfileEditSheetProps {
  visible: boolean;
  /** The stored profile blob, used to seed the form. */
  userProfile: any;
  onClose: () => void;
  /** Called with the saved blob so the dashboard can update without a refetch. */
  onSaved: (profile: UserProfile) => void;
}

const ACCENT = '#00f2fe';

const GENDERS = ['Female', 'Male', 'Non-Binary'];

// The condition and activity lists used to be typed out here *and* in
// onboarding, with the target calculator holding a third copy under different
// ids. They now come from the admin config, so there is one list and the app
// picks up an edit without a release.

/** Deliberately permissive: this is a typo check, not an address validator. */
const looksLikeEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Text className="text-[10px] text-neutral-500 font-mono uppercase tracking-[2px] mb-3 mt-2">
    {children}
  </Text>
);

const FieldLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Text className="text-[11px] text-neutral-400 font-mono uppercase tracking-wider mb-2">
    {children}
  </Text>
);

/**
 * The profile editor behind "Edit details" in the account sheet.
 *
 * Everything onboarding asked for except the wearable pairing, because these
 * are the answers that go stale: people change weight, move city, take on a
 * new diagnosis, shift their working hours. The daily goal is derived from
 * several of them, so the recalculated target is shown live while editing
 * rather than appearing as a surprise afterwards.
 *
 * The form is seeded from the stored profile every time it opens, so an
 * abandoned edit leaves nothing behind.
 */
const ProfileEditSheet: React.FC<ProfileEditSheetProps> = ({
  visible,
  userProfile,
  onClose,
  onSaved,
}) => {

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [age, setAge] = useState(26);
  const [gender, setGender] = useState('Male');
  const [weight, setWeight] = useState(75);
  const [selectedCity, setSelectedCity] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [medicalConditions, setMedicalConditions] = useState<string[]>([]);
  const [activityLevel, setActivityLevel] = useState('moderate');
  const [workEnvironment, setWorkEnvironment] = useState<WorkEnvironment>('indoor');
  const [physicianLimit, setPhysicianLimit] = useState('');
  const [sleepStart, setSleepStart] = useState(DEFAULT_SLEEP_SCHEDULE.sleepStart);
  const [wakeUp, setWakeUp] = useState(DEFAULT_SLEEP_SCHEDULE.wakeUp);

  const [showCityPicker, setShowCityPicker] = useState(false);

  // Subscribed, not sampled: the admin config can arrive (or change) while
  // this sheet is open.
  const appConfig = useAppConfig();
  const conditions = appConfig.medicalConditions.filter(c => c.enabled !== false);
  const activityLevels = appConfig.activityLevels.filter(level => level.enabled !== false);
  const workEnvironments = appConfig.workEnvironments.filter(env => env.enabled !== false);
  const [isLocating, setIsLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Seeded on open rather than on mount: the sheet stays mounted between
  // visits, and a reopen should show what is stored, not the last draft.
  useEffect(() => {
    if (!visible) return;

    const schedule = normaliseSleepSchedule(userProfile) ?? DEFAULT_SLEEP_SCHEDULE;
    setFullName(userProfile?.fullName ?? '');
    setEmail(userProfile?.email ?? '');
    setAge(Number(userProfile?.age) || 26);
    setGender(userProfile?.gender ?? 'Male');
    setWeight(Number(userProfile?.weightKg) || 75);
    setSelectedCity(userProfile?.selectedCity ?? userProfile?.location ?? '');
    setLatitude(userProfile?.latitude ?? null);
    setLongitude(userProfile?.longitude ?? null);
    setMedicalConditions(
      Array.isArray(userProfile?.medicalConditions) ? userProfile.medicalConditions : []
    );
    setActivityLevel(userProfile?.activityLevel ?? 'moderate');
    setWorkEnvironment(userProfile?.workEnvironment ?? 'indoor');
    setPhysicianLimit(userProfile?.physicianLimitMl?.toString() ?? '');
    setSleepStart(schedule.sleepStart);
    setWakeUp(schedule.wakeUp);
    setErrorMsg('');
  }, [visible, userProfile]);

  const toggleCondition = (id: string) =>
    setMedicalConditions(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );

  /**
   * Re-resolve the city from the device.
   *
   * Shares `LocationService` with onboarding, so a fix taken here obeys the
   * same rules — GPS first, network second, and no city named when the nearest
   * one in the table is too far away to be the user's.
   */
  const detectLocation = async () => {
    setIsLocating(true);
    setErrorMsg('');
    try {
      const result = await LocationService.resolveCurrentLocation();
      if (result.latitude !== null) setLatitude(result.latitude);
      if (result.longitude !== null) setLongitude(result.longitude);

      if (result.city) {
        setSelectedCity(result.city);
      } else {
        setErrorMsg(LocationService.describeFailure(result.status));
      }
    } catch (error) {
      console.error('[Profile] Location detection failed:', error);
      setErrorMsg('Could not read your location. Pick a city instead.');
    } finally {
      setIsLocating(false);
    }
  };

  // The goal is derived, so it is shown as it will be stored — an edit that
  // moves it should not be a surprise the user only sees on the dashboard.
  const projectedTargetMl = computeTargetDailyMl({
    weightKg: weight,
    gender,
    age,
    workEnvironment,
    activityLevel,
    medicalConditions,
    physicianLimitMl: physicianLimit ? parseInt(physicianLimit, 10) : undefined,
  });
  const currentTargetMl = Number(userProfile?.targetDailyMl) || 0;
  // `null` is "there is no goal to show" — a fluid-restricted profile with no
  // doctor's number yet. A delta against it would be arithmetic on a value
  // that does not exist, so the projection row is hidden instead.
  const targetDelta = projectedTargetMl === null ? null : projectedTargetMl - currentTargetMl;

  /**
   * The same rule onboarding enforces.
   *
   * This sheet used to label the field "Mandatory" and then save whatever was
   * in it, blank included — so adding a fluid-restricted diagnosis here left
   * the profile restricted with no limit on file, which is the one state the
   * app is not allowed to guess its way out of.
   */
  const physicianLimitError = ConfigService.requiresPhysicianLimit(medicalConditions)
    ? validatePhysicianLimitMl(physicianLimit)
    : null;

  const sleepSchedule = { sleepStart, wakeUp };
  const sleepHours = sleepDurationMinutes(sleepSchedule) / 60;
  const awakeHours = awakeHoursPerDay(sleepSchedule);

  const save = async () => {
    const trimmedEmail = email.trim();
    if (trimmedEmail && !looksLikeEmail(trimmedEmail)) {
      setErrorMsg('That email address does not look right.');
      return;
    }

    if (physicianLimitError) {
      setErrorMsg(physicianLimitError);
      return;
    }

    setSaving(true);
    setErrorMsg('');

    const result = await ProfileService.updateProfile({
      fullName: fullName.trim(),
      email: trimmedEmail,
      age,
      gender,
      weightKg: weight,
      selectedCity,
      latitude,
      longitude,
      medicalConditions,
      activityLevel,
      workEnvironment,
      physicianLimitMl: physicianLimit ? parseInt(physicianLimit, 10) : undefined,
      sleepSchedule,
    });

    setSaving(false);

    if (result.status === 'saved') {
      onSaved(result.profile);
      onClose();
      return;
    }
    setErrorMsg(
      result.status === 'unauthenticated'
        ? 'You are signed out. Sign in again to save changes.'
        : 'Could not save your changes. Check your connection and try again.'
    );
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Edit details"
      subtitle="PERSONAL INFORMATION"
      heightFraction={0.9}
    >
      {/* `flex: 1` so the form scrolls inside the panel's fixed height and the
          action row below it stays pinned to the bottom. */}
      <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 22, paddingBottom: 30 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <SectionLabel>Identity</SectionLabel>

            <View className="mb-5">
              <FieldLabel>Full Name</FieldLabel>
              <TextInput
                className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-[13px] font-bold"
                placeholder="e.g. John Doe"
                placeholderTextColor="#475569"
                value={fullName}
                onChangeText={setFullName}
              />
            </View>

            <View className="mb-6">
              <FieldLabel>Email Address</FieldLabel>
              <TextInput
                className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-[13px] font-bold"
                placeholder="e.g. john@example.com"
                placeholderTextColor="#475569"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <SectionLabel>Biometrics</SectionLabel>

            <NumberField label="Age" unit="years" min={14} max={90} value={age} onChange={setAge} />

            <FieldLabel>Gender</FieldLabel>
            <View className="flex-row gap-2 mb-7">
              {GENDERS.map(g => (
                <TouchableOpacity
                  key={g}
                  onPress={() => setGender(g)}
                  className={`flex-1 py-3 rounded-xl border items-center ${
                    gender === g ? 'bg-[#00f2fe]/10 border-[#00f2fe]' : 'bg-white/5 border-white/5'
                  }`}
                >
                  <Text
                    className={`text-[11px] font-bold ${
                      gender === g ? 'text-[#00f2fe]' : 'text-neutral-400'
                    }`}
                  >
                    {g}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <NumberField
              label="Baseline Weight"
              unit="kg"
              min={40}
              max={140}
              value={weight}
              onChange={setWeight}
              hint="Sets your daily goal"
            />

            <SectionLabel>Location (Climate Tracking)</SectionLabel>

            <View className="flex-row gap-2 mb-6">
              <TouchableOpacity
                onPress={() => setShowCityPicker(true)}
                activeOpacity={0.7}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 flex-row items-center justify-between"
              >
                <Text
                  className={`text-[13px] font-bold ${
                    selectedCity ? 'text-white' : 'text-neutral-500'
                  }`}
                >
                  {selectedCity || 'Select City'}
                </Text>
                <ChevronDown size={14} color="#64748b" />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={detectLocation}
                disabled={isLocating}
                className="flex-row items-center gap-2 px-4 py-3 rounded-xl border border-[#00f2fe]/30 bg-[#00f2fe]/10"
              >
                <MapPin size={14} color={ACCENT} />
                <Text className="text-[11px] font-black uppercase text-[#00f2fe]">
                  {isLocating ? 'Locating...' : 'Detect'}
                </Text>
              </TouchableOpacity>
            </View>

            <SectionLabel>Medical States</SectionLabel>

            {conditions.map(cond => (
              <TouchableOpacity
                key={cond.id}
                onPress={() => toggleCondition(cond.id)}
                activeOpacity={0.7}
                className={`w-full p-4 rounded-2xl border mb-2.5 flex-row items-center justify-between ${
                  medicalConditions.includes(cond.id)
                    ? 'bg-[#00f2fe]/5 border-[#00f2fe]/50'
                    : 'bg-white/[0.02] border-white/5'
                }`}
              >
                <Text className="text-white font-bold text-[13px] flex-1 pr-4">{cond.title}</Text>
                <View
                  className={`w-6 h-6 rounded-lg border items-center justify-center ${
                    medicalConditions.includes(cond.id)
                      ? 'bg-[#00f2fe] border-[#00f2fe]'
                      : 'border-white/20'
                  }`}
                >
                  {medicalConditions.includes(cond.id) && (
                    <Check size={14} color="#01040a" strokeWidth={4} />
                  )}
                </View>
              </TouchableOpacity>
            ))}

            <View className="mt-4" />
            <SectionLabel>Daily Activity Strain</SectionLabel>

            <View className="flex-row flex-wrap gap-2 mb-6">
              {activityLevels.map(opt => (
                <TouchableOpacity
                  key={opt.id}
                  onPress={() => setActivityLevel(opt.id)}
                  activeOpacity={0.7}
                  className={`px-4 py-3 rounded-xl border ${
                    activityLevel === opt.id
                      ? 'bg-[#00f2fe]/10 border-[#00f2fe]'
                      : 'bg-white/5 border-white/5'
                  }`}
                >
                  <Text
                    className={`text-[11px] font-bold ${
                      activityLevel === opt.id ? 'text-[#00f2fe]' : 'text-neutral-400'
                    }`}
                  >
                    {opt.title}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <SectionLabel>Work Environment</SectionLabel>
            <View className="flex-row flex-wrap gap-2 mb-6">
              {workEnvironments.map((env) => (
                <TouchableOpacity key={env.id} onPress={() => setWorkEnvironment(env.id as any)} className={`px-4 py-3 rounded-xl border items-center ${workEnvironment === env.id ? 'bg-[#00f2fe]/10 border-[#00f2fe]' : 'bg-white/5 border-white/5'}`}>
                  <Text className={`text-[11px] font-bold ${workEnvironment === env.id ? 'text-[#00f2fe]' : 'text-neutral-400'}`}>{env.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Which diagnoses need a doctor's daily limit is a property of
                the condition in the admin config, not a list of ids repeated
                on every screen that asks. */}
            {ConfigService.requiresPhysicianLimit(medicalConditions) && (
              <View className="mb-6">
                <FieldLabel>Physician Daily Limit (ml)</FieldLabel>
                <TextInput
                  className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-[13px] font-bold mb-1"
                  placeholder="e.g. 2000"
                  placeholderTextColor="#475569"
                  value={physicianLimit}
                  onChangeText={setPhysicianLimit}
                  keyboardType="numeric"
                />
                <Text className="text-[9px] text-amber-500 italic">Mandatory for fluid-restricted conditions.</Text>
              </View>
            )}

            <SectionLabel>Circadian Window</SectionLabel>

            <TimeField
              label="Usual Sleep Time"
              icon={Moon}
              value={sleepStart}
              onChange={setSleepStart}
            />
            <TimeField
              label="Usual Wake-up Time"
              icon={Sunrise}
              value={wakeUp}
              onChange={setWakeUp}
              caption={`${sleepHours.toFixed(1)}h of rest · ${awakeHours.toFixed(
                1
              )}h awake. Alerts stay paused through this window.`}
            />

            {sleepHours < 3 && (
              <View className="flex-row items-center gap-2 mb-4">
                <CircleAlert size={12} color="#f59e0b" />
                <Text className="text-[10px] text-amber-500 font-mono flex-1">
                  That is under 3 hours of rest. Adjust it if the times were picked by mistake.
                </Text>
              </View>
            )}

            {/* Recalculated goal */}
            <View className="w-full p-4 rounded-2xl border border-[#00f2fe]/20 bg-[#00f2fe]/[0.04] mt-2">
              <View className="flex-row items-center gap-2 mb-2">
                <Target size={14} color={ACCENT} />
                <Text className="text-[10px] text-neutral-400 font-mono uppercase tracking-[2px]">
                  Recalculated Daily Goal
                </Text>
              </View>
              <View className="flex-row items-baseline gap-2">
                <Text className="text-[#00f2fe] text-[22px] font-black font-mono">
                  {projectedTargetMl === null ? '—' : projectedTargetMl}
                </Text>
                <Text className="text-neutral-500 text-[11px] font-mono">ml / day</Text>
                {!!currentTargetMl && targetDelta !== null && targetDelta !== 0 && (
                  <Text
                    className="text-[11px] font-mono font-black ml-auto"
                    style={{ color: targetDelta > 0 ? '#34d399' : '#f59e0b' }}
                  >
                    {targetDelta > 0 ? '+' : ''}
                    {targetDelta} ml
                  </Text>
                )}
              </View>
              {/* Three different explanations, because the number above comes
                  from three different places: a doctor's restriction, the
                  formula, or nothing at all. Saying "derived from your weight
                  and climate" over a physician-set limit would be false. */}
              <Text className="text-neutral-500 text-[10px] mt-2 leading-relaxed">
                {projectedTargetMl === null
                  ? 'Your diagnosis needs your doctor’s daily limit before the app can pace your intake.'
                  : ConfigService.requiresPhysicianLimit(medicalConditions)
                  ? 'Set by your physician’s daily limit, which replaces the calculated goal.'
                  : 'Derived from your weight, activity strain, medical states and local climate.'}
              </Text>
            </View>

            {!!errorMsg && (
              <View className="flex-row items-center gap-2 mt-4">
                <CircleAlert size={12} color="#f87171" />
                <Text className="text-[10px] text-red-400 font-mono flex-1">{errorMsg}</Text>
              </View>
            )}
          </ScrollView>

      {/* Actions */}
      <View className="flex-row gap-3 px-5 pt-4 pb-7 border-t border-white/5">
        <Button
          label="Cancel"
          onPress={onClose}
          variant="secondary"
          size="lg"
          disabled={saving}
          style={{ flex: 1 }}
          textStyle={{ textTransform: 'uppercase' }}
          accessibilityLabel="Discard changes"
        />
        <Button
          label="Save changes"
          onPress={save}
          size="lg"
          loading={saving}
          style={{ flex: 2 }}
          textStyle={{ textTransform: 'uppercase' }}
          accessibilityLabel="Save profile changes"
        />
      </View>

      <CityPickerModal
        visible={showCityPicker}
          selectedCity={selectedCity}
          onSelect={(city, lat, lon) => {
            setSelectedCity(city);
            setLatitude(lat);
            setLongitude(lon);
            setShowCityPicker(false);
          }}
        onClose={() => setShowCityPicker(false)}
      />
    </Sheet>
  );
};

export default ProfileEditSheet;
