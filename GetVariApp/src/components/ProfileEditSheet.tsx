import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';
import {
  Check,
  ChevronDown,
  CircleAlert,
  MapPin,
  Moon,
  Sunrise,
  Target,
  X,
} from 'lucide-react-native';
import { request, PERMISSIONS, RESULTS } from 'react-native-permissions';
import Geolocation from '@react-native-community/geolocation';

import CustomSlider from './CustomSlider';
import TimeField from './TimeField';
import CityPickerModal from './CityPickerModal';
import ProfileService from '../services/ProfileService';
import { computeTargetDailyMl } from '../utils/hydrationTarget';
import { getClosestCity } from '../data/indianCities';
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

const CONDITIONS = [
  { id: 'diabetes', title: 'Diabetes (Type I/II)' },
  { id: 'hypertension', title: 'Hypertension / High BP' },
  { id: 'ckd', title: 'Kidney Disease / CKD' },
  { id: 'heart', title: 'Heart Condition' },
  { id: 'stones', title: 'Kidney Stone History' },
];

const ACTIVITY_LEVELS = [
  { id: 'sedentary', title: 'Sedentary' },
  { id: 'light', title: 'Light Active' },
  { id: 'moderate', title: 'Moderate Load' },
  { id: 'active', title: 'High Strain' },
  { id: 'elite', title: 'Elite / Hybrid' },
];

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
  const { height: windowHeight } = useWindowDimensions();

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

  const detectLocation = async () => {
    setIsLocating(true);
    setErrorMsg('');
    try {
      const permission = await request(
        Platform.OS === 'android'
          ? PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION
          : PERMISSIONS.IOS.LOCATION_WHEN_IN_USE
      );
      if (permission !== RESULTS.GRANTED) {
        setErrorMsg('Location permission denied. Pick a city instead.');
        setIsLocating(false);
        return;
      }

      Geolocation.getCurrentPosition(
        (position: any) => {
          const { latitude: lat, longitude: lon } = position.coords;
          setLatitude(lat);
          setLongitude(lon);
          setSelectedCity(getClosestCity(lat, lon));
          setIsLocating(false);
        },
        () => {
          setErrorMsg('Could not read your location. Pick a city instead.');
          setIsLocating(false);
        },
        { enableHighAccuracy: false, timeout: 5000 }
      );
    } catch (error) {
      console.error('[Profile] Location detection failed:', error);
      setErrorMsg('Could not read your location. Pick a city instead.');
      setIsLocating(false);
    }
  };

  // The goal is derived, so it is shown as it will be stored — an edit that
  // moves it should not be a surprise the user only sees on the dashboard.
  const projectedTargetMl = computeTargetDailyMl({
    weightKg: weight,
    activityLevel,
    medicalConditions,
    selectedCity,
  });
  const currentTargetMl = Number(userProfile?.targetDailyMl) || 0;
  const targetDelta = projectedTargetMl - currentTargetMl;

  const sleepSchedule = { sleepStart, wakeUp };
  const sleepHours = sleepDurationMinutes(sleepSchedule) / 60;
  const awakeHours = awakeHoursPerDay(sleepSchedule);

  const save = async () => {
    const trimmedEmail = email.trim();
    if (trimmedEmail && !looksLikeEmail(trimmedEmail)) {
      setErrorMsg('That email address does not look right.');
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
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Same reason as the account sheet: RN's Modal opens its own native
          window outside the app root's GestureHandlerRootView. */}
      <GestureHandlerRootView
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' }}
      >
        <TouchableOpacity activeOpacity={1} onPress={onClose} style={{ flex: 1 }} />

        <Animated.View
          entering={SlideInDown.duration(300)}
          exiting={SlideOutDown.duration(250)}
          style={{
            maxHeight: Math.min(windowHeight * 0.9, windowHeight - 40),
            backgroundColor: '#020617',
            borderTopLeftRadius: 40,
            borderTopRightRadius: 40,
            borderTopWidth: 1,
            borderColor: 'rgba(255,255,255,0.2)',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <View className="flex-row items-center justify-between px-6 py-4 border-b border-white/5">
            <View>
              <Text className="text-white font-black text-[16px]">Edit details</Text>
              <Text className="text-[9px] text-slate-500 font-black tracking-[2px] mt-1">
                PERSONAL INFORMATION
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              className="p-2.5"
              accessibilityRole="button"
              accessibilityLabel="Close profile editor"
            >
              <X color="#94a3b8" size={24} />
            </TouchableOpacity>
          </View>

          <ScrollView
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

            <CustomSlider label="Age (years)" min={14} max={90} value={age} onChange={setAge} />

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

            <CustomSlider
              label="Baseline Weight"
              min={40}
              max={140}
              value={weight}
              onChange={setWeight}
              unit="kg"
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

            {CONDITIONS.map(cond => (
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
              {ACTIVITY_LEVELS.map(opt => (
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
              {[
                { id: 'indoor', label: 'Indoor/Office' },
                { id: 'ac_office', label: 'AC Office' },
                { id: 'hybrid', label: 'Hybrid' },
                { id: 'outdoor', label: 'Outdoor' },
                { id: 'heavy_outdoor', label: 'Heavy Outdoor' }
              ].map((env) => (
                <TouchableOpacity key={env.id} onPress={() => setWorkEnvironment(env.id as any)} className={`px-4 py-3 rounded-xl border items-center ${workEnvironment === env.id ? 'bg-[#00f2fe]/10 border-[#00f2fe]' : 'bg-white/5 border-white/5'}`}>
                  <Text className={`text-[11px] font-bold ${workEnvironment === env.id ? 'text-[#00f2fe]' : 'text-neutral-400'}`}>{env.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {(medicalConditions.includes('hypertension') || medicalConditions.includes('ckd') || medicalConditions.includes('heart')) && (
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
                  {projectedTargetMl}
                </Text>
                <Text className="text-neutral-500 text-[11px] font-mono">ml / day</Text>
                {!!currentTargetMl && targetDelta !== 0 && (
                  <Text
                    className="text-[11px] font-mono font-black ml-auto"
                    style={{ color: targetDelta > 0 ? '#34d399' : '#f59e0b' }}
                  >
                    {targetDelta > 0 ? '+' : ''}
                    {targetDelta} ml
                  </Text>
                )}
              </View>
              <Text className="text-neutral-500 text-[10px] mt-2 leading-relaxed">
                Derived from your weight, activity strain, medical states and local climate.
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
            <TouchableOpacity
              onPress={onClose}
              disabled={saving}
              className="flex-1 py-4 bg-white/5 rounded-[22px] border border-white/5 items-center"
              accessibilityRole="button"
              accessibilityLabel="Discard changes"
            >
              <Text className="text-slate-400 text-[12px] font-black uppercase tracking-wider">
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={save}
              disabled={saving}
              activeOpacity={0.85}
              className={`flex-[2] py-4 bg-[#00f2fe] rounded-[22px] items-center justify-center ${
                saving ? 'opacity-50' : ''
              }`}
              accessibilityRole="button"
              accessibilityLabel="Save profile changes"
            >
              {saving ? (
                <ActivityIndicator color="#020617" size="small" />
              ) : (
                <Text className="text-[#020617] text-[12px] font-black uppercase tracking-wider">
                  Save changes
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </Animated.View>

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
      </GestureHandlerRootView>
    </Modal>
  );
};

export default ProfileEditSheet;
