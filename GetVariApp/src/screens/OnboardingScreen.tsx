import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  Platform,
  Dimensions,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
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
  Bluetooth
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
import { supabase } from '../services/SupabaseClient';
import { AuthService } from '../services/AuthService';

const { width } = Dimensions.get('window');
const manager = new BleManager();

const CustomSlider = ({ min, max, value, onChange, label, unit = '' }: any) => {
  const sliderWidth = width - 120;
  const position = ((value - min) / (max - min)) * sliderWidth;

  const handleTouch = (event: any) => {
    const touchX = event.nativeEvent.locationX;
    let newValue = Math.round(((touchX / sliderWidth) * (max - min)) + min);
    newValue = Math.max(min, Math.min(max, newValue));
    onChange(newValue);
  };

  return (
    <View className="w-full mb-6">
      <View className="flex-row justify-between items-center mb-3">
        <Text className="text-[11px] text-neutral-400 font-mono uppercase tracking-wider">{label}</Text>
        <Text className="text-xl font-black text-[#00f2fe] font-mono">{value}{unit}</Text>
      </View>
      <View
        className="h-6 justify-center"
        onStartShouldSetResponder={() => true}
        onResponderMove={handleTouch}
        onResponderRelease={handleTouch}
      >
        <View className="h-1 w-full bg-white/10 rounded-full">
          <View
            style={{ width: position }}
            className="h-full bg-[#00f2fe] rounded-full"
          />
        </View>
        <View
          style={{
            position: 'absolute',
            left: position - 10,
            width: 20,
            height: 20,
            borderRadius: 10,
            backgroundColor: '#00f2fe',
            borderWidth: 4,
            borderColor: '#01040a',
            shadowColor: '#00f2fe',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.8,
            shadowRadius: 10,
            elevation: 5,
          }}
        />
      </View>
    </View>
  );
};

const OnboardingScreen = ({ navigation }: any) => {
  const [step, setStep] = useState(1);
  const totalSteps = 5;

  // State for Step 2
  const [age, setAge] = useState(26);
  const [gender, setGender] = useState('Male');
  const [weight, setWeight] = useState(75);
  const [selectedCity, setSelectedCity] = useState('');

  // State for Step 3
  const [medicalConditions, setMedicalConditions] = useState<string[]>([]);

  // State for Step 4
  const [activityLevel, setActivityLevel] = useState('moderate');

  // State for Step 5
  const [bleState, setBleState] = useState<'idle' | 'checking' | 'bluetoothOff' | 'requesting' | 'scanning' | 'devicesFound' | 'noDevicesFound' | 'connecting' | 'connected' | 'error'>('idle');
  const [devices, setDevices] = useState<Device[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

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

  const handleNext = async () => {
    if (step < totalSteps) {
      setStep(step + 1);
    } else {
      setIsFinalizing(true);
      setErrorMsg('');
      try {
        const userId = await AuthService.getCurrentUserId();
        if (userId) {
          let targetMl = weight * 35;
          if (activityLevel === 'active') targetMl += 600;
          if (activityLevel === 'elite') targetMl += 1200;

          if (medicalConditions.includes('diabetes')) targetMl += 450;
          if (medicalConditions.includes('kidney')) targetMl -= 250;
          if (medicalConditions.includes('hypertension')) targetMl += 150;

          targetMl = Math.round(targetMl / 50) * 50;
          targetMl = Math.min(4500, Math.max(1500, targetMl));

          const profileData = {
            age,
            gender,
            weightKg: weight,
            selectedCity,
            medicalConditions,
            activityLevel,
            targetDailyMl: targetMl,
            connectedDeviceId: connectedDevice?.id || null,
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
        }
        // Remember that the wizard is done so a later cold start (including one
        // from a reminder tap) goes straight to the dashboard.
        await AuthService.markOnboardingComplete();
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
                    if (state === 'PoweredOn') {
                      sub.remove();
                      // Small delay to ensure stack is ready
                      setTimeout(handleScanBLE, 500);
                    }
                  }, true);

                  await manager.enable();
                } catch (e) {
                  console.error('Manual enable failed, opening settings:', e);
                  Linking.openSettings();
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

    manager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        console.error('BLE Scan Error:', error);
        setBleState('error');
        return;
      }

      if (device && device.name) {
        setDevices((prevDevices) => {
          if (!prevDevices.find((d) => d.id === device.id)) {
            return [...prevDevices, device];
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
          // If no devices found, show the message
          return devices.length > 0 ? 'idle' : 'noDevicesFound';
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
                  </Animated.View>
                )}

                {step === 3 && (
                  <Animated.View entering={FadeInRight} exiting={FadeOutLeft} className="w-full">
                    <Text className="text-2xl font-black text-white mb-1">Pre-existing Medical States</Text>
                    <Text className="text-[12px] text-neutral-400 mb-8 leading-relaxed">Select any active diagnoses. GetVari dynamically tunes cardiovascular fluid strain thresholds and sweat predictions accordingly.</Text>
                    {[
                      { id: 'diabetes', title: 'Diabetes (Type I/II)', desc: 'Heightened systemic glucose requires higher osmotic dilution. (+450ml adaptive cushion)' },
                      { id: 'hypertension', title: 'Hypertension / High BP', desc: 'Heart pressure feedback active. Micro-hydration bursts help reduce blood vessel resistance.' },
                      { id: 'kidney', title: 'Kidney / Renal Disease', desc: 'Ensures strict clearance limit control to relieve tubules. (-250ml adaptive ceiling)' },
                      { id: 'cardio', title: 'Cardiovascular / Heart Condition', desc: 'Prevents rapid blood volume expansion; steady, predictable intake triggers active.' },
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

                {step === 5 && (
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
                            <Text className="text-white font-black text-[15px]">GetVari Wearable Node</Text>
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

          <View className="py-8 items-center">
            <TouchableOpacity onPress={() => navigation.replace('Home')} className="flex-row items-center gap-2 opacity-50">
              <Text className="text-base">🚀</Text>
              <Text className="text-[10px] text-neutral-600 font-mono tracking-[4px] font-bold">BYPASS SETUP WIZARD (INVESTOR FAST-TRACK)</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
};

export default OnboardingScreen;
