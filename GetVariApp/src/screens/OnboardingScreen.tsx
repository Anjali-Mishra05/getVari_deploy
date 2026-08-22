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
  ChevronDown,
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
import Geolocation from '@react-native-community/geolocation';

import GlassCard from '../components/GlassCard';
import CustomSlider from '../components/CustomSlider';
import TimeField from '../components/TimeField';
import CityPickerModal from '../components/CityPickerModal';
import { supabase } from '../services/SupabaseClient';
import { AuthService } from '../services/AuthService';
import NotificationService from '../services/NotificationService';
import { getClosestCity } from '../data/indianCities';
import { computeTargetDailyMl } from '../utils/hydrationTarget';
import { WorkEnvironment } from '../types';
import {
  DEFAULT_SLEEP_SCHEDULE,
  awakeHoursPerDay,
  formatClockLabel,
  sleepDurationMinutes,
} from '../utils/sleepWindow';

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

  const handleDetectLocation = async () => {
    setIsLocating(true);
    setLocationErrorMsg('');
    setSelectedCity('');

    try {
      const hasPermission = await request(
        Platform.OS === 'android' ? PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION : PERMISSIONS.IOS.LOCATION_WHEN_IN_USE
      );

      if (hasPermission !== RESULTS.GRANTED) {
        setLocationErrorMsg('Location permission denied.');
        setIsLocating(false);
        return;
      }

      // 1. Try High Accuracy (GPS)
      Geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;
          setLatitude(lat);
          setLongitude(lon);
          setIsLocating(false);
          const city = getClosestCity(lat, lon);
          setSelectedCity(city);
        },
        (error) => {
          console.warn('GPS failed, trying network fallback...', error);
          // 2. Fallback to Network-based location
          Geolocation.getCurrentPosition(
            (pos) => {
              const lat = pos.coords.latitude;
              const lon = pos.coords.longitude;
              setLatitude(lat);
              setLongitude(lon);
              setIsLocating(false);
              const city = getClosestCity(lat, lon);
              setSelectedCity(city);
            },
            (err) => {
              console.error(err);
              setLocationErrorMsg('Unable to retrieve location. Select a city manually.');
              setIsLocating(false);
            },
            { enableHighAccuracy: false, timeout: 5000 }
          );
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    } catch (err) {
      console.error(err);
      setLocationErrorMsg('An error occurred during location detection.');
      setIsLocating(false);
    }
  };

  const handleNext = async () => {
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

                    <View className="mb-6">
                      <Text className="text-[11px] text-neutral-400 font-mono uppercase tracking-wider mb-2">Full Name</Text>
                      <TextInput
                        className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-[13px] font-bold"
                        placeholder="e.g. John Doe"
                        placeholderTextColor="#475569"
                        value={fullName}
                        onChangeText={setFullName}
                      />
                    </View>

                    <View className="mb-8">
                      <Text className="text-[11px] text-neutral-400 font-mono uppercase tracking-wider mb-2">Email Address</Text>
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

                    <CustomSlider label="Age (years)" min={14} max={90} value={age} onChange={setAge} />
                    <Text className="text-[11px] text-neutral-400 font-mono uppercase tracking-wider mb-3">Gender</Text>
                    <View className="flex-row gap-2 mb-8">
                      {['Female', 'Male', 'Non-Binary'].map((g) => (
                        <TouchableOpacity key={g} onPress={() => setGender(g)} className={`flex-1 py-3 rounded-xl border items-center ${gender === g ? 'bg-[#00f2fe]/10 border-[#00f2fe]' : 'bg-white/5 border-white/5'}`}>
                          <Text className={`text-[11px] font-bold ${gender === g ? 'text-[#00f2fe]' : 'text-neutral-400'}`}>{g}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <CustomSlider label="Baseline Weight" min={40} max={140} value={weight} onChange={setWeight} unit="kg" />

                    <View className="mt-4 pt-4 border-t border-white/5">
                      <Text className="text-[11px] text-neutral-400 font-mono uppercase tracking-wider mb-3">Location (Climate Tracking)</Text>
                      <View className="flex-row gap-2">
                        <TouchableOpacity
                          onPress={() => setShowCityPicker(true)}
                          activeOpacity={0.7}
                          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 flex-row items-center justify-between"
                        >
                          <Text className={`text-[13px] font-bold ${selectedCity ? 'text-white' : 'text-neutral-500'}`}>
                            {selectedCity || "Select City"}
                          </Text>
                          <ChevronDown size={14} color="#64748b" />
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={handleDetectLocation}
                          disabled={isLocating}
                          className={`flex-row items-center gap-2 px-4 py-3 rounded-xl border transition-all ${
                            latitude !== null
                              ? 'border-emerald-500/50 bg-emerald-950/20'
                              : 'border-[#00f2fe]/30 bg-[#00f2fe]/10'
                          }`}
                        >
                          <MapPin size={14} color={latitude !== null ? "#10b981" : "#00f2fe"} />
                          <Text className={`text-[11px] font-black uppercase ${latitude !== null ? 'text-emerald-400' : 'text-[#00f2fe]'}`}>
                            {isLocating ? 'Locating...' : latitude !== null ? 'Located' : 'Detect'}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {selectedCity && (
                        <View className="mt-3 flex-row items-center gap-2 bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/20">
                          <Check size={12} color="#10b981" />
                          <Text className="text-[10px] text-emerald-500 font-mono">Captured: <Text className="font-bold">{selectedCity}</Text></Text>
                        </View>
                      )}

                      {locationErrorMsg && (
                        <View className="mt-3 flex-row items-center gap-2">
                          <CircleAlert size={12} color="#f87171" />
                          <Text className="text-[10px] text-red-400 font-mono">{locationErrorMsg}</Text>
                        </View>
                      )}
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
                  </Animated.View>
                )}

                {step === 3 && (
                  <Animated.View entering={FadeInRight} exiting={FadeOutLeft} className="w-full">
                    <Text className="text-2xl font-black text-white mb-1">Pre-existing Medical States</Text>
                    <Text className="text-[12px] text-neutral-400 mb-8 leading-relaxed">Select any active diagnoses. GetVari dynamically tunes cardiovascular fluid strain thresholds and sweat predictions accordingly.</Text>
                    {[
                      { id: 'diabetes', title: 'Diabetes (Type I/II)', desc: 'Heightened systemic glucose requires higher osmotic dilution.' },
                      { id: 'hypertension', title: 'Hypertension / High BP', desc: 'Heart pressure feedback active. Physician limit recommended.' },
                      { id: 'ckd', title: 'Kidney Disease / CKD', desc: 'Ensures strict clearance limit control to relieve tubules. Physician limit mandatory.' },
                      { id: 'heart', title: 'Heart Condition', desc: 'Prevents rapid blood volume expansion. Physician limit mandatory.' },
                      { id: 'stones', title: 'Kidney Stone History', desc: 'Prompts for higher base target to prevent crystallization.' },
                    ].map((cond) => (
                      <TouchableOpacity key={cond.id} onPress={() => toggleCondition(cond.id)} activeOpacity={0.7} className={`w-full p-4 rounded-2xl border mb-3 flex-row items-center justify-between ${medicalConditions.includes(cond.id) ? 'bg-[#00f2fe]/5 border-[#00f2fe]/50' : 'bg-white/[0.02] border-white/5'}`}>
                        <View className="flex-1 pr-4">
                          <Text className="text-white font-bold text-[14px] mb-1">{cond.title}</Text>
                          <Text className="text-neutral-500 text-[10px] leading-relaxed">{cond.desc}</Text>
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
                    {[
                      { id: 'sedentary', title: 'Sedentary', desc: 'Minimal physical exertion. Remote work style.' },
                      { id: 'light', title: 'Light Active', desc: 'Slight exertion. Light walks or stretching/yoga.' },
                      { id: 'moderate', title: 'Moderate Load', desc: 'Moderate physical load, gym session 3-4x/week.' },
                      { id: 'active', title: 'High Strain', desc: 'Daily athletic strain, high sweating baseline.' },
                      { id: 'elite', title: 'Elite / Hybrid', desc: 'Double sessions daily or intensive endurance sports.' },
                    ].map((opt) => (
                      <TouchableOpacity key={opt.id} onPress={() => setActivityLevel(opt.id)} activeOpacity={0.7} className={`w-full p-4 rounded-2xl border mb-3 ${activityLevel === opt.id ? 'bg-[#00f2fe]/5 border-[#00f2fe]' : 'bg-white/5 border-white/5'}`}>
                        <Text className={`font-bold text-[14px] mb-0.5 ${activityLevel === opt.id ? 'text-[#00f2fe]' : 'text-white'}`}>{opt.title}</Text>
                        <Text className="text-neutral-500 text-[10px]">{opt.desc}</Text>
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
                      <View>
                        <Text className="text-[11px] text-neutral-400 font-mono uppercase tracking-wider mb-2">Physician Daily Limit (ml)</Text>
                        <TextInput
                          className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-[13px] font-bold mb-2"
                          placeholder="e.g. 2000"
                          placeholderTextColor="#475569"
                          value={physicianLimit}
                          onChangeText={setPhysicianLimit}
                          keyboardType="numeric"
                        />
                        <Text className="text-[10px] text-amber-500/80 leading-relaxed italic">
                          Mandatory for gated conditions to ensure safety.
                        </Text>
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

              <View className="flex-row gap-4 mt-auto pt-6 border-t border-white/5">
                {step > 1 && (
                  <TouchableOpacity onPress={handleBack} className="flex-1 py-4 bg-white/5 rounded-[22px] border border-white/5 flex-row items-center justify-center">
                    <ChevronLeft color="#64748b" size={18} strokeWidth={3} />
                    <Text className="text-slate-500 text-[13px] font-black uppercase tracking-wider ml-1">Back</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={handleNext}
                  activeOpacity={0.8}
                  disabled={isFinalizing}
                  className={`${step === 1 ? 'w-full' : 'flex-[2]'} py-4 bg-[#00f2fe] rounded-[22px] flex-row items-center justify-center shadow-2xl ${isFinalizing ? 'opacity-50' : ''}`}
                  style={{ shadowColor: '#00f2fe', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 10 }}
                >
                  {isFinalizing ? (
                    <ActivityIndicator color="#020617" size="small" />
                  ) : (
                    <>
                      <Text className="text-[#020617] text-[13px] font-black uppercase tracking-wider mr-1">
                        {step === totalSteps ? 'Finalize connection' : 'Next'}
                      </Text>
                      <ChevronRight color="#020617" size={18} strokeWidth={3} />
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </GlassCard>
          </Animated.View>
        </View>
      </SafeAreaView>
    </View>
  );
};

export default OnboardingScreen;
