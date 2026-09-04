import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
  NativeModules,
  TextInput,
} from 'react-native';
import {
  Waves,
  ChevronRight,
  ChevronLeft,
  Check,
  MapPin,
  Radio,
  Info,
  CircleAlert,
  Bluetooth,
  Moon,
  Sunrise,
  BellOff,
} from 'lucide-react-native';
import Animated, {
  FadeInRight,
  FadeOutLeft,
  FadeInUp,
} from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Stop, Rect as SvgRect } from 'react-native-svg';
import { BleManager, Device } from 'react-native-ble-plx';
import { request, PERMISSIONS, RESULTS } from 'react-native-permissions';

import GlassCard from '../components/GlassCard';
import Button from '../components/ui/Button';
import NumberField from '../components/ui/NumberField';
import TimeField from '../components/TimeField';
import CityPickerModal from '../components/CityPickerModal';
import { supabase } from '../services/SupabaseClient';
import { AuthService } from '../services/AuthService';
import NotificationService from '../services/NotificationService';
import LocationService from '../services/LocationService';
import ConfigService from '../services/ConfigService';
import useAppConfig from '../hooks/useAppConfig';
import { computeTargetDailyMl } from '../utils/hydrationTarget';
import { WorkEnvironment } from '../types';
import {
  DEFAULT_SLEEP_SCHEDULE,
  awakeHoursPerDay,
  formatClockLabel,
  sleepDurationMinutes,
} from '../utils/sleepWindow';

/**
 * A labelled field that says it is required, and why it is not satisfied.
 *
 * The asterisk is the visible half of defect 6: nothing marked these as
 * mandatory, so walking past them looked allowed.
 */
const RequiredField: React.FC<{
  label: string;
  error?: string | null;
  className?: string;
  children: React.ReactNode;
}> = ({ label, error, className = '', children }) => (
  <View className={className}>
    <Text className="text-[11px] text-neutral-400 font-mono uppercase tracking-wider mb-2">
      {label} <Text className="text-red-400">*</Text>
    </Text>
    {children}
    {!!error && <Text className="text-[10px] text-red-400 mt-1.5">{error}</Text>}
  </View>
);

const manager = new BleManager();
const GETVARI_SERVICE_UUID = '0000ffe0-0000-1000-8000-00805f9b34fb';


const OnboardingScreen = ({ navigation }: any) => {
  const [step, setStep] = useState(1);
  const totalSteps = 7;

  // State for Step 2
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [age, setAge] = useState(26);
  const [gender, setGender] = useState('Male');
  const [weight, setWeight] = useState(75);
  const [selectedCity, setSelectedCity] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationErrorMsg, setLocationErrorMsg] = useState('');
  const [showCityPicker, setShowCityPicker] = useState(false);
  /** True when the city came from the device rather than from the picker. */
  const [locationAuto, setLocationAuto] = useState(false);
  /** Guards the one automatic attempt per visit to the location step. */
  const [locationAttempted, setLocationAttempted] = useState(false);

  // State for Step 3
  const [medicalConditions, setMedicalConditions] = useState<string[]>([]);

  // State for Step 4
  const [sleepStart, setSleepStart] = useState(DEFAULT_SLEEP_SCHEDULE.sleepStart);
  const [wakeUp, setWakeUp] = useState(DEFAULT_SLEEP_SCHEDULE.wakeUp);

  // State for Step 5
  const [activityLevel, setActivityLevel] = useState('moderate');

  // State for Step 7
  const [workEnvironment, setWorkEnvironment] = useState<WorkEnvironment>('indoor');
  const [physicianLimit, setPhysicianLimit] = useState('');

  // State for Step 6
  const [bleState, setBleState] = useState<'idle' | 'checking' | 'bluetoothOff' | 'requesting' | 'scanning' | 'devicesFound' | 'noDevicesFound' | 'connecting' | 'connected' | 'error'>('idle');
  const [devices, setDevices] = useState<Device[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Subscribed, not sampled: the config arrives over the network and can land
  // after this screen has painted, or change while it is open.
  const appConfig = useAppConfig();
  const conditions = appConfig.medicalConditions.filter(c => c.enabled !== false);
  const activityLevels = appConfig.activityLevels.filter(level => level.enabled !== false);
  const workEnvironments = appConfig.workEnvironments.filter(env => env.enabled !== false);

  /**
   * Which required fields the user has left, once they have tried to move on.
   *
   * Errors appear on the first "Next" rather than while the field is still
   * being filled in — flagging an email as invalid at "j@" is noise, and the
   * user has not made a mistake yet.
   */
  const [showFieldErrors, setShowFieldErrors] = useState(false);

  const nameError = fullName.trim().length < 2 ? 'Enter your name.' : null;
  // Deliberately permissive: this only has to catch a typo or an empty field,
  // and a stricter pattern rejects addresses that are perfectly deliverable.
  const emailError = !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())
    ? 'Enter a valid email address.'
    : null;
  /** Fluid-restricted conditions are unsafe to pace without a doctor's number. */
  const physicianLimitError =
    ConfigService.requiresPhysicianLimit(medicalConditions) &&
    !(Number.parseInt(physicianLimit, 10) > 0)
      ? 'A physician daily limit is required for the conditions you selected.'
      : null;

  /** Blocks `Next` on the step that owns the offending field. */
  const blockingError =
    step === 2 ? nameError ?? emailError : step === 6 ? physicianLimitError : null;

  const sleepSchedule = { sleepStart, wakeUp };
  const sleepHours = sleepDurationMinutes(sleepSchedule) / 60;
  const awakeHours = awakeHoursPerDay(sleepSchedule);

  useEffect(() => {
    return () => {
      manager.stopDeviceScan();
    };
  }, []);

  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      const apiLevel = parseInt(String(Platform.Version), 10);
      if (apiLevel >= 31) {
        const result = await Promise.all([
          request(PERMISSIONS.ANDROID.BLUETOOTH_SCAN),
          request(PERMISSIONS.ANDROID.BLUETOOTH_CONNECT),
          request(PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION),
        ]);
        return result.every((res) => res === RESULTS.GRANTED);
      } else {
        const result = await request(PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION);
        return result === RESULTS.GRANTED;
      }
    }
    return true;
  };

  /**
   * Resolve the user's city from the device.
   *
   * Runs on its own when the user reaches this step (see the effect below)
   * rather than waiting for a "Detect" tap — where the user is is something
   * the phone knows, and asking them to type it produced profiles that were
   * wrong the moment they travelled. The picker stays as a correction for a
   * bad fix or a refused permission, not as the primary path.
   *
   * @param prompt Whether a permission dialog may be raised. False for the
   *   automatic attempt on a step the user did not ask anything of yet.
   */
  const detectLocation = async (prompt: boolean) => {
    setIsLocating(true);
    setLocationErrorMsg('');

    try {
      const result = await LocationService.resolveCurrentLocation({ prompt });

      // Coordinates are worth keeping even when no city matched: they are what
      // a future climate lookup would use, and they record where the profile
      // was actually created.
      if (result.latitude !== null) setLatitude(result.latitude);
      if (result.longitude !== null) setLongitude(result.longitude);

      if (result.city) {
        setSelectedCity(result.city);
        setLocationAuto(true);
      } else {
        setLocationAuto(false);
        setLocationErrorMsg(LocationService.describeFailure(result.status));
      }
    } catch (error) {
      console.error('[Onboarding] Location detection failed:', error);
      setLocationErrorMsg('Could not detect your location. Pick your city instead.');
    } finally {
      setIsLocating(false);
    }
  };

  // One automatic attempt per visit to the location step. `prompt` is true so
  // the permission dialog appears in context, next to the field it explains,
  // rather than at some unrelated moment later.
  useEffect(() => {
    if (step !== 2 || locationAttempted) return;
    setLocationAttempted(true);
    detectLocation(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, locationAttempted]);

  const handleNext = async () => {
    // Defect 6: the user could walk past the identity step without a name or
    // an email, so profiles arrived with neither and nothing said so.
    if (blockingError) {
      setShowFieldErrors(true);
      setErrorMsg(blockingError);
      return;
    }
    setShowFieldErrors(false);
    setErrorMsg('');

    if (step < totalSteps) {
      setStep(step + 1);
    } else {
      setIsFinalizing(true);
      setErrorMsg('');
      try {
        const userId = await AuthService.getCurrentUserId();
        if (userId) {
          // Shared with the profile editor, so a later correction to weight,
          // activity or diagnoses moves the goal by exactly these rules.
          const targetMl = computeTargetDailyMl({
            weightKg: weight,
            activityLevel,
            medicalConditions,
            selectedCity,
          });

          const profileData = {
            fullName,
            email,
            age,
            gender,
            weightKg: weight,
            selectedCity,
            // The dashboard's ambient card reads `location`; both are written
            // so neither name can go stale against the other.
            location: selectedCity,
            latitude: latitude || null,
            longitude: longitude || null,
            medicalConditions,
            activityLevel,
            targetDailyMl: targetMl,
            // Local wall-clock times, not instants: a bedtime is a habit that
            // stays 11pm wherever the user travels.
            sleepSchedule,
            // Stored alongside so averages and pacing never have to re-derive
            // it — the daily goal is spread over waking hours, not 24.
            awakeHoursPerDay: Number(awakeHours.toFixed(2)),
            connectedDeviceId: connectedDevice?.id || null,
            workEnvironment,
            physicianLimitMl: physicianLimit ? parseInt(physicianLimit, 10) : undefined,
          };

          const { error } = await supabase
            .from('getvari_profiles')
            .upsert({
              id: userId,
              profile: profileData,
              updated_at: new Date().toISOString(),
            });

          if (error) {
            console.error('[Supabase] Profile save error:', error.message);
            setErrorMsg('System busy. Syncing locally...');
            setTimeout(() => navigation.replace('Home'), 1500);
            return;
          }

          // Reminders live in the OS, so the sleep window has to be handed to
          // the notification layer explicitly — it cannot read the profile row
          // from a background handler or a cold start.
          try {
            await NotificationService.setSleepSchedule(sleepSchedule);
          } catch (sleepError) {
            console.error('[Onboarding] Failed to apply sleep window:', sleepError);
          }

          // Mark onboarding complete locally to bypass startup check next time
          await AuthService.markOnboardingComplete();
        }
        navigation.replace('Home');
      } catch (error) {
        console.error('[Supabase] Fatal error in handleNext onboarding:', error);
        navigation.replace('Home');
      } finally {
        setIsFinalizing(false);
      }
    }
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const toggleCondition = (id: string) => {
    if (medicalConditions.includes(id)) {
      setMedicalConditions(medicalConditions.filter(c => c !== id));
    } else {
      setMedicalConditions([...medicalConditions, id]);
    }
  };

  const handleScanBLE = async () => {
    if (bleState === 'scanning') return;

    setBleState('checking');
    setDevices([]);

    const currentState = await manager.state();
    if (currentState !== 'PoweredOn') {
      setBleState('bluetoothOff');
      Alert.alert(
        "Bluetooth is turned off",
        "Please turn on Bluetooth to scan and connect to your device.",
        [
          { text: "Cancel", onPress: () => setBleState('idle'), style: "cancel" },
          {
            text: "Turn On",
            onPress: async () => {
              if (Platform.OS === 'android') {
                try {
                  // Listen for state change BEFORE enabling
                  const sub = manager.onStateChange((state) => {
                    console.log('[Onboarding] Bluetooth state changed:', state);
                    if (state === 'PoweredOn') {
                      sub.remove();
                      // Small delay to ensure stack is ready
                      setTimeout(handleScanBLE, 800);
                    }
                  }, true);

                  const { BluetoothModule } = NativeModules;
                  if (BluetoothModule) {
                    const enabled = await BluetoothModule.enableBluetooth();
                    if (!enabled) {
                      sub.remove();
                      setBleState('idle');
                    }
                  } else {
                    console.warn('[Onboarding] BluetoothModule is not registered');
                    Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS');
                    setBleState('idle');
                  }
                } catch (e) {
                  console.error('[Onboarding] Native enable failed:', e);
                  Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS');
                  setBleState('idle');
                }
              } else {
                Linking.openSettings();
              }
            }
          }
        ]
      );
      return;
    }

    const hasPermission = await requestPermissions();
    if (!hasPermission) {
      setBleState('error');
      Alert.alert(
        "Permissions Required",
        "GetVari needs Bluetooth and Location access to find your device.",
        [
          { text: "Cancel", style: "cancel", onPress: () => setBleState('idle') },
          { text: "Open Settings", onPress: () => Linking.openSettings() }
        ]
      );
      return;
    }

    setBleState('scanning');
    setErrorMsg('');

    // Track if any device is found to avoid stale closure issues with 'devices' state
    let foundAny = false;

    manager.startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
      if (error) {
        if (error.message.includes('powered off')) {
          setBleState('bluetoothOff');
        } else {
          console.log('[Onboarding] BLE Scan Error:', error.message);
          setBleState('error');
          setErrorMsg(error.message);
        }
        manager.stopDeviceScan();
        return;
      }

      if (device) {
        foundAny = true;
        setDevices((prevDevices) => {
          const index = prevDevices.findIndex((d) => d.id === device.id);
          if (index === -1) {
            console.log('[Onboarding] Found new device:', device.name || 'Unnamed', device.id);
            // Identify if this is a GetVari device based on UUID or Name
            const isGetVari = (device.serviceUUIDs && device.serviceUUIDs.includes(GETVARI_SERVICE_UUID)) ||
                             (device.name && device.name.toLowerCase().includes('getvari'));

            (device as any).isGetVari = isGetVari;
            return [...prevDevices, device];
          } else {
            // Update RSSI for existing device if it changed significantly
            const oldDevice = prevDevices[index];
            if (Math.abs((oldDevice.rssi || 0) - (device.rssi || 0)) > 5) {
               const newDevices = [...prevDevices];
               newDevices[index] = device;
               return newDevices;
            }
          }
          return prevDevices;
        });
      }
    });

    // Stop scanning after 10 seconds
    setTimeout(() => {
      manager.stopDeviceScan();
      setBleState((current) => {
        if (current === 'scanning') {
          return foundAny ? 'idle' : 'noDevicesFound';
        }
        return current;
      });
    }, 10000);
  };

  const connectToDevice = async (device: Device) => {
    manager.stopDeviceScan();
    try {
      const connected = await manager.connectToDevice(device.id);
      await connected.discoverAllServicesAndCharacteristics();
      setConnectedDevice(connected);
      setBleState('connected');
    } catch (e: any) {
      console.error('Connection error:', e);
      Alert.alert("Connection Failed", `Could not connect to ${device.name || 'device'}`);
      setBleState('idle');
    }
  };

  return (
    <View className="flex-1 bg-[#01040a]">
      <View className="absolute inset-0">
        <Svg height="100%" width="100%">
          <Defs>
            <RadialGradient id="grad" cx="50%" cy="50%" rx="45%" ry="35%" fx="50%" fy="50%" gradientUnits="userSpaceOnUse">
              <Stop offset="0%" stopColor="#0b2133" stopOpacity="0.2" />
              <Stop offset="100%" stopColor="#01040a" stopOpacity="1" />
            </RadialGradient>
          </Defs>
          <SvgRect x="0" y="0" width="100%" height="100%" fill="url(#grad)" />
        </Svg>
      </View>

      <SafeAreaView className="flex-1">
        <View className="flex-1 px-6 pt-10">
          <Animated.View entering={FadeInUp.duration(1000)} className="flex-1">
            <GlassCard className="flex-1 py-10 px-8 rounded-[42px] bg-white/[0.01] border-white/5 shadow-2xl">
              <View className="flex-row justify-center gap-2 mb-10">
                {Array.from({ length: totalSteps }).map((_, idx) => (
                  <View key={idx} className={`h-1.5 rounded-full transition-all duration-300 ${idx + 1 === step ? 'w-10 bg-[#00f2fe]' : 'w-2 bg-white/10'}`} />
                ))}
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
                {step === 1 && (
                  <Animated.View entering={FadeInRight} exiting={FadeOutLeft} className="items-center w-full">
                    <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(0, 242, 254, 0.03)', borderWidth: 1, borderColor: 'rgba(0, 242, 254, 0.1)', justifyContent: 'center', alignItems: 'center', marginBottom: 32 }}>
                      <Waves color="#00f2fe" size={40} strokeWidth={1.5} opacity={0.8} />
                    </View>
                    <View className="flex-row items-baseline justify-center mb-1">
                      <Text style={{ fontSize: 34, fontFamily: Platform.OS === 'android' ? 'sans-serif-thin' : 'HelveticaNeue-Thin', color: '#a3b3cc', letterSpacing: -0.5 }}>get</Text>
                      <Text style={{ fontSize: 40, fontWeight: '900', color: '#ffffff', letterSpacing: -1, marginLeft: 2 }}>Vāri</Text>
                    </View>
                    <View className="w-full items-center mb-10">
                      <Text className="text-[9px] text-[#00f2fe] font-black uppercase text-center w-full" style={{ letterSpacing: 3.6 }}>AI-POWERED HYDRATION INTELLIGENCE</Text>
                    </View>
                    <Text className="text-[13px] text-neutral-400 text-center leading-relaxed font-medium mb-12 px-2">
                      Monitor hydration risk using real-time body signals like heart rate, activity, temperature, and recovery patterns.
                    </Text>
                  </Animated.View>
                )}

                {step === 2 && (
                  <Animated.View entering={FadeInRight} exiting={FadeOutLeft} className="w-full">
                    <Text className="text-2xl font-black text-white mb-1">Biometric Blueprint</Text>
                    <Text className="text-[12px] text-neutral-400 mb-8">Provide basic values to adjust hydration metabolic models.</Text>

                    <RequiredField
                      label="Full Name"
                      error={showFieldErrors ? nameError : null}
                      className="mb-6"
                    >
                      <TextInput
                        className="bg-white/5 border rounded-xl px-4 py-3 text-white text-[13px] font-bold"
                        style={{
                          borderColor:
                            showFieldErrors && nameError
                              ? 'rgba(248,113,113,0.6)'
                              : 'rgba(255,255,255,0.10)',
                        }}
                        placeholder="e.g. John Doe"
                        placeholderTextColor="#475569"
                        value={fullName}
                        onChangeText={setFullName}
                        autoCapitalize="words"
                      />
                    </RequiredField>

                    <RequiredField
                      label="Email Address"
                      error={showFieldErrors ? emailError : null}
                      className="mb-8"
                    >
                      <TextInput
                        className="bg-white/5 border rounded-xl px-4 py-3 text-white text-[13px] font-bold"
                        style={{
                          borderColor:
                            showFieldErrors && emailError
                              ? 'rgba(248,113,113,0.6)'
                              : 'rgba(255,255,255,0.10)',
                        }}
                        placeholder="e.g. john@example.com"
                        placeholderTextColor="#475569"
                        value={email}
                        onChangeText={setEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                    </RequiredField>

                    <NumberField
                      label="Age"
                      unit="years"
                      min={14}
                      max={90}
                      value={age}
                      onChange={setAge}
                    />
                    <Text className="text-[11px] text-neutral-400 font-mono uppercase tracking-wider mb-3">Gender</Text>
                    <View className="flex-row gap-2 mb-8">
                      {['Female', 'Male', 'Non-Binary'].map((g) => (
                        <TouchableOpacity key={g} onPress={() => setGender(g)} className={`flex-1 py-3 rounded-xl border items-center ${gender === g ? 'bg-[#00f2fe]/10 border-[#00f2fe]' : 'bg-white/5 border-white/5'}`}>
                          <Text className={`text-[11px] font-bold ${gender === g ? 'text-[#00f2fe]' : 'text-neutral-400'}`}>{g}</Text>
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

                    <View className="mt-4 pt-4 border-t border-white/5">
                      <Text className="text-[11px] text-neutral-400 font-mono uppercase tracking-wider mb-3">Location (Climate Tracking)</Text>

                      {/* The city is measured, not asked for. This block
                          reports what the device found; the picker below is
                          the correction, which is why it is a quiet link and
                          not the primary control it used to be. */}
                      {isLocating ? (
                        <View className="flex-row items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3.5">
                          <ActivityIndicator size="small" color="#00f2fe" />
                          <Text className="text-[12px] text-neutral-400 font-medium">
                            Finding your location…
                          </Text>
                        </View>
                      ) : selectedCity ? (
                        <View className="flex-row items-center gap-3 bg-emerald-500/[0.07] border border-emerald-500/25 rounded-xl px-4 py-3.5">
                          <MapPin size={16} color="#10b981" />
                          <View className="flex-1">
                            <Text className="text-[14px] font-black text-white">{selectedCity}</Text>
                            <Text className="text-[10px] text-emerald-500/80 font-mono mt-0.5">
                              {locationAuto ? 'Detected automatically' : 'Chosen manually'}
                            </Text>
                          </View>
                        </View>
                      ) : (
                        <View className="flex-row items-center gap-3 bg-amber-500/[0.07] border border-amber-500/25 rounded-xl px-4 py-3.5">
                          <CircleAlert size={16} color="#f59e0b" />
                          <Text className="text-[11px] text-amber-500/90 leading-[16px] flex-1">
                            {locationErrorMsg || 'Location not set yet.'}
                          </Text>
                        </View>
                      )}

                      <View className="flex-row items-center gap-4 mt-3">
                        <TouchableOpacity
                          onPress={() => detectLocation(true)}
                          disabled={isLocating}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          accessibilityRole="button"
                          accessibilityLabel="Detect my location again"
                        >
                          <Text className="text-[11px] font-black uppercase text-[#00f2fe] tracking-wider">
                            Detect again
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => setShowCityPicker(true)}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          accessibilityRole="button"
                          accessibilityLabel="Choose a city manually"
                        >
                          <Text className="text-[11px] font-black uppercase text-neutral-400 tracking-wider">
                            Choose manually
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    <CityPickerModal
                      visible={showCityPicker}
                      selectedCity={selectedCity}
                      onSelect={(city, lat, lon) => {
                        setSelectedCity(city);
                        setLatitude(lat);
                        setLongitude(lon);
                        // A manual pick overrides the fix, and says so, so the
                        // user can tell which one they are looking at.
                        setLocationAuto(false);
                        setLocationErrorMsg('');
                        setShowCityPicker(false);
                      }}
                      onClose={() => setShowCityPicker(false)}
                    />
                  </Animated.View>
                )}

                {step === 3 && (
                  <Animated.View entering={FadeInRight} exiting={FadeOutLeft} className="w-full">
                    <Text className="text-2xl font-black text-white mb-1">Pre-existing Medical States</Text>
                    <Text className="text-[12px] text-neutral-400 mb-8 leading-relaxed">Select any active diagnoses. GetVari dynamically tunes cardiovascular fluid strain thresholds and sweat predictions accordingly.</Text>
                    {conditions.map((cond) => (
                      <TouchableOpacity key={cond.id} onPress={() => toggleCondition(cond.id)} activeOpacity={0.7} className={`w-full p-4 rounded-2xl border mb-3 flex-row items-center justify-between ${medicalConditions.includes(cond.id) ? 'bg-[#00f2fe]/5 border-[#00f2fe]/50' : 'bg-white/[0.02] border-white/5'}`}>
                        <View className="flex-1 pr-4">
                          <Text className="text-white font-bold text-[14px] mb-1">{cond.title}</Text>
                          <Text className="text-neutral-500 text-[10px] leading-relaxed">{cond.description}</Text>
                        </View>
                        <View className={`w-6 h-6 rounded-lg border items-center justify-center ${medicalConditions.includes(cond.id) ? 'bg-[#00f2fe] border-[#00f2fe]' : 'border-white/20'}`}>
                          {medicalConditions.includes(cond.id) && <Check size={14} color="#01040a" strokeWidth={4} />}
                        </View>
                      </TouchableOpacity>
                    ))}
                  </Animated.View>
                )}

                {step === 4 && (
                  <Animated.View entering={FadeInRight} exiting={FadeOutLeft} className="w-full">
                    <Text className="text-2xl font-black text-white mb-1">Circadian Window</Text>
                    <Text className="text-[12px] text-neutral-400 mb-8 leading-relaxed">
                      Roughly when do you sleep and wake? Hours you spend asleep are excluded from your hydration averages, and GetVari stays silent through them.
                    </Text>

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
                    />

                    <View className="w-full p-4 rounded-2xl border border-[#00f2fe]/20 bg-[#00f2fe]/[0.04] mb-3">
                      <Text className="text-[10px] text-neutral-500 font-mono uppercase tracking-[2px] mb-2">Derived Baseline</Text>
                      <View className="flex-row justify-between items-center mb-1">
                        <Text className="text-neutral-400 text-[12px]">Sleep window</Text>
                        <Text className="text-white text-[12px] font-black">
                          {formatClockLabel(sleepStart)} - {formatClockLabel(wakeUp)}
                        </Text>
                      </View>
                      <View className="flex-row justify-between items-center mb-1">
                        <Text className="text-neutral-400 text-[12px]">Rest duration</Text>
                        <Text className="text-white text-[12px] font-black">{sleepHours.toFixed(1)} h</Text>
                      </View>
                      <View className="flex-row justify-between items-center">
                        <Text className="text-neutral-400 text-[12px]">Waking hours (averaging base)</Text>
                        <Text className="text-[#00f2fe] text-[12px] font-black">{awakeHours.toFixed(1)} h</Text>
                      </View>
                    </View>

                    {sleepHours < 3 && (
                      <View className="flex-row items-center gap-2 mb-3">
                        <CircleAlert size={12} color="#f59e0b" />
                        <Text className="text-[10px] text-amber-500 font-mono flex-1">
                          That is under 3 hours of rest. Adjust it if the times were picked by mistake.
                        </Text>
                      </View>
                    )}

                    <View className="flex-row items-start gap-3 p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                      <BellOff size={14} color="#64748b" />
                      <Text className="text-neutral-500 text-[10px] leading-relaxed flex-1">
                        Hydration reminders and alerts pause for the whole window and pick up again at your wake-up time.
                      </Text>
                    </View>
                  </Animated.View>
                )}

                {step === 5 && (
                  <Animated.View entering={FadeInRight} exiting={FadeOutLeft} className="w-full">
                    <Text className="text-2xl font-black text-white mb-1">Metabolic Dynamics</Text>
                    <Text className="text-[12px] text-neutral-400 mb-8">Lifestyle habits dramatically update cellular sweating thresholds.</Text>
                    <Text className="text-[10px] text-neutral-500 font-mono uppercase tracking-[2px] mb-4">Daily Activity Strain</Text>
                    {activityLevels.map((opt) => (
                      <TouchableOpacity key={opt.id} onPress={() => setActivityLevel(opt.id)} activeOpacity={0.7} className={`w-full p-4 rounded-2xl border mb-3 ${activityLevel === opt.id ? 'bg-[#00f2fe]/5 border-[#00f2fe]' : 'bg-white/5 border-white/5'}`}>
                        <Text className={`font-bold text-[14px] mb-0.5 ${activityLevel === opt.id ? 'text-[#00f2fe]' : 'text-white'}`}>{opt.title}</Text>
                        <Text className="text-neutral-500 text-[10px]">{opt.description}</Text>
                      </TouchableOpacity>
                    ))}
                  </Animated.View>
                )}

                {step === 6 && (
                  <Animated.View entering={FadeInRight} exiting={FadeOutLeft} className="w-full">
                    <Text className="text-2xl font-black text-white mb-1">Environment & Limits</Text>
                    <Text className="text-[12px] text-neutral-400 mb-8 leading-relaxed">Where do you spend most of your day? This calibrates your PBWR baseline.</Text>

                    <Text className="text-[11px] text-neutral-400 font-mono uppercase tracking-wider mb-3">Work Environment</Text>
                    <View className="flex-row flex-wrap gap-2 mb-8">
                      {workEnvironments.map((env) => (
                        <TouchableOpacity key={env.id} onPress={() => setWorkEnvironment(env.id as any)} className={`px-4 py-3 rounded-xl border items-center ${workEnvironment === env.id ? 'bg-[#00f2fe]/10 border-[#00f2fe]' : 'bg-white/5 border-white/5'}`}>
                          <Text className={`text-[11px] font-bold ${workEnvironment === env.id ? 'text-[#00f2fe]' : 'text-neutral-400'}`}>{env.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    {/* Which diagnoses need a doctor's limit is a property of
                        the condition in the admin config, not a list of ids
                        repeated on every screen that asks. */}
                    {ConfigService.requiresPhysicianLimit(medicalConditions) && (
                      <View>
                        <Text className="text-[11px] text-neutral-400 font-mono uppercase tracking-wider mb-2">
                          Physician Daily Limit (ml) <Text className="text-red-400">*</Text>
                        </Text>
                        <TextInput
                          className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-[13px] font-bold mb-2"
                          placeholder="e.g. 2000"
                          placeholderTextColor="#475569"
                          value={physicianLimit}
                          onChangeText={setPhysicianLimit}
                          keyboardType="numeric"
                        />
                        <Text className="text-[10px] text-amber-500/80 leading-relaxed italic">
                          Mandatory for the conditions you selected — the app will not pace your
                          intake without your doctor's number.
                        </Text>
                        {showFieldErrors && !!physicianLimitError && (
                          <Text className="text-[10px] text-red-400 mt-1.5">
                            {physicianLimitError}
                          </Text>
                        )}
                      </View>
                    )}
                  </Animated.View>
                )}

                {step === 7 && (
                  <Animated.View entering={FadeInRight} exiting={FadeOutLeft} className="w-full">
                    <Text className="text-2xl font-black text-white mb-1">Sensor Synaptic Connect</Text>
                    <Text className="text-[12px] text-neutral-400 mb-10">Connect the proprietary GetVari wearable.</Text>

                    <View className="w-full p-6 bg-white/[0.02] border border-white/5 rounded-3xl mb-4">
                      <View className="flex-row justify-between items-start mb-6">
                        <View>
                          <View className="bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded self-start mb-2">
                            <Text className="text-[8px] text-amber-500 font-mono font-bold uppercase tracking-widest">Prototyping Node</Text>
                          </View>
                          <View className="flex-row items-center gap-2">
                            <Radio size={16} color="#00f2fe" />
                            <Text className="text-white font-black text-[15px]">
                              {connectedDevice?.name || 'GetVari Wearable Node'}
                            </Text>
                          </View>
                          <Text className="text-neutral-500 text-[10px] mt-1">Pairs directly over standard BLE.</Text>
                        </View>
                        <TouchableOpacity
                          onPress={handleScanBLE}
                          disabled={bleState === 'scanning' || !!connectedDevice}
                          className={`px-4 py-2 rounded-xl items-center justify-center ${connectedDevice ? 'bg-white/5 border border-white/10' : 'bg-[#00f2fe]'}`}
                        >
                          <Text className={`text-[11px] font-black uppercase ${connectedDevice ? 'text-neutral-500' : 'text-[#01040a]'}`}>
                            {connectedDevice ? 'Connected' : bleState === 'scanning' ? 'Scanning...' : (devices.length > 0 ? 'Scan Again' : 'Scan BLE')}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {bleState === 'scanning' && (
                        <View className="space-y-2">
                          <View className="flex-row justify-between">
                            <Text className="text-[9px] text-[#00f2fe] font-mono">SCANNING CARRIER WAVE...</Text>
                            <ActivityIndicator size="small" color="#00f2fe" style={{ transform: [{ scale: 0.6 }] }} />
                          </View>
                          <View className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden mt-2">
                            <View style={{ width: '65%' }} className="h-full bg-[#00f2fe]" />
                          </View>
                        </View>
                      )}

                      {bleState === 'noDevicesFound' && (
                        <View className="mt-2">
                          <Text className="text-[10px] text-red-400 font-medium text-center">No BLE devices found. Make sure your device is nearby and try again.</Text>
                        </View>
                      )}

                      {connectedDevice && (
                        <View className="bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-xl flex-row items-center gap-3">
                          <Info size={14} color="#10b981" />
                          <Text className="text-[10px] text-emerald-500 font-medium flex-1">
                            {connectedDevice.name || 'Device'} paired successfully. Real-time streaming link established.
                          </Text>
                        </View>
                      )}
                    </View>

                    {devices.length > 0 && !connectedDevice && (
                      <View className="space-y-2">
                        <Text className="text-[10px] text-neutral-500 font-mono uppercase tracking-widest mb-2">Available Devices</Text>
                        {devices.map((device) => (
                          <TouchableOpacity key={device.id} onPress={() => connectToDevice(device)} className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl flex-row items-center justify-between">
                            <View className="flex-row items-center gap-3">
                              <Bluetooth size={16} color="#a3b3cc" />
                              <View>
                                <Text className="text-white font-bold text-sm">{device.name || 'Unnamed Device'}</Text>
                                <Text className="text-[10px] text-neutral-500 font-mono">{device.id}</Text>
                              </View>
                            </View>
                            <View className="flex-row items-center gap-2">
                              <Text className="text-[10px] text-neutral-500 font-mono">{device.rssi} dBm</Text>
                              <ChevronRight size={14} color="#64748b" />
                            </View>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </Animated.View>
                )}
              </ScrollView>

              {!!errorMsg && (
                <View className="flex-row items-center gap-2 mt-3">
                  <CircleAlert size={12} color="#f87171" />
                  <Text className="text-[10px] text-red-400 font-mono flex-1">{errorMsg}</Text>
                </View>
              )}

              {/* Step 1 has no Back button, so its single action is centred
                  rather than left to sit against the start of the row.
                  `alignSelf: 'stretch'` was the wrong tool for that: in a row
                  container it stretches the cross axis, so the button kept its
                  content width and stayed pinned to the left edge. */}
              <View
                className="flex-row gap-4 mt-auto pt-6 border-t border-white/5"
                style={step === 1 ? { justifyContent: 'center' } : undefined}
              >
                {step > 1 && (
                  <Button
                    label="Back"
                    onPress={handleBack}
                    variant="secondary"
                    size="lg"
                    icon={<ChevronLeft color="#64748b" size={18} strokeWidth={3} />}
                    style={{ flex: 1 }}
                    textStyle={{ textTransform: 'uppercase' }}
                  />
                )}
                <Button
                  label={step === totalSteps ? 'Finalize connection' : 'Next'}
                  onPress={handleNext}
                  size="lg"
                  loading={isFinalizing}
                  style={{
                    // Centred and comfortably wide on step 1; sharing the row
                    // with Back on every step after it.
                    ...(step === 1 ? { minWidth: 200 } : { flex: 2 }),
                    shadowColor: '#00f2fe',
                    shadowOffset: { width: 0, height: 6 },
                    shadowOpacity: 0.4,
                    shadowRadius: 12,
                    elevation: 10,
                  }}
                  textStyle={{ textTransform: 'uppercase' }}
                />
              </View>
            </GlassCard>
          </Animated.View>
        </View>
      </SafeAreaView>
    </View>
  );
};

export default OnboardingScreen;
