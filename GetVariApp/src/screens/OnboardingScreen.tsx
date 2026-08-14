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
  NativeModules,
  Modal,
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
  Search,
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
import { supabase } from '../services/SupabaseClient';
import { AuthService } from '../services/AuthService';

const { width } = Dimensions.get('window');
const manager = new BleManager();
const GETVARI_SERVICE_UUID = '0000ffe0-0000-1000-8000-00805f9b34fb';

const popularCities = [
  "Mumbai", "Delhi", "Bengaluru", "Hyderabad", "Ahmedabad", "Chennai", "Kolkata", "Surat", "Pune", "Jaipur",
  "Lucknow", "Kanpur", "Nagpur", "Indore", "Thane", "Bhopal", "Visakhapatnam", "Pimpri-Chinchwad", "Patna", "Vadodara",
  "Ghaziabad", "Ludhiana", "Agra", "Nashik", "Faridabad", "Meerut", "Rajkot", "Kalyan-Dombivli", "Vasai-Virar", "Varanasi",
  "Srinagar", "Aurangabad", "Dhanbad", "Amritsar", "Navi Mumbai", "Prayagraj", "Howrah", "Ranchi", "Gwalior", "Jabalpur",
  "Coimbatore", "Vijayawada", "Jodhpur", "Madurai", "Raipur", "Kota", "Guwahati", "Chandigarh", "Solapur", "Hubballi-Dharwad",
  "Bareilly", "Moradabad", "Mysuru", "Gurugram", "Aligarh", "Jalandhar", "Tiruchirappalli", "Bhubaneswar", "Salem", "Mira-Bhayandar",
  "Warangal", "Thiruvananthapuram", "Guntur", "Bhiwandi", "Saharanpur", "Gorakhpur", "Bikaner", "Amravati", "Noida", "Jamshedpur",
  "Bhilai", "Cuttack", "Firozabad", "Kochi", "Nellore", "Bhavnagar", "Dehradun", "Durgapur", "Asansol", "Rourkela",
  "Nanded", "Kolhapur", "Ajmer", "Akola", "Kalaburagi", "Jamnagar", "Ujjain", "Loni", "Siliguri", "Jhansi",
  "Ulhasnagar", "Jammu", "Sangli-Miraj & Kupwad", "Belagavi", "Mangaluru", "Ambattur", "Tirunelveli", "Malegaon", "Gaya", "Jalgaon"
];

const CITY_COORDINATES: { [key: string]: { lat: number; lon: number } } = {
  'Mumbai': { lat: 19.0760, lon: 72.8777 },
  'Delhi': { lat: 28.6139, lon: 77.2090 },
  'Bengaluru': { lat: 12.9716, lon: 77.5946 },
  'Hyderabad': { lat: 17.3850, lon: 78.4867 },
  'Ahmedabad': { lat: 23.0225, lon: 72.5714 },
  'Chennai': { lat: 13.0827, lon: 80.2707 },
  'Kolkata': { lat: 22.5726, lon: 88.3639 },
  'Surat': { lat: 21.1702, lon: 72.8311 },
  'Pune': { lat: 18.5204, lon: 73.8567 },
  'Jaipur': { lat: 26.9124, lon: 75.7873 },
  'Lucknow': { lat: 26.8467, lon: 80.9462 },
  'Kanpur': { lat: 26.4499, lon: 80.3319 },
  'Nagpur': { lat: 21.1458, lon: 79.0882 },
  'Indore': { lat: 22.7196, lon: 75.8577 },
  'Thane': { lat: 19.2183, lon: 72.9781 },
  'Bhopal': { lat: 23.2599, lon: 77.4126 },
  'Visakhapatnam': { lat: 17.6868, lon: 83.2185 },
  'Pimpri-Chinchwad': { lat: 18.6298, lon: 73.7997 },
  'Patna': { lat: 25.5941, lon: 85.1376 },
  'Vadodara': { lat: 22.3072, lon: 73.1812 },
  'Ghaziabad': { lat: 28.6692, lon: 77.4538 },
  'Ludhiana': { lat: 30.9010, lon: 75.8573 },
  'Agra': { lat: 27.1767, lon: 78.0081 },
  'Nashik': { lat: 19.9975, lon: 73.7898 },
  'Faridabad': { lat: 28.4089, lon: 77.3178 },
  'Meerut': { lat: 28.9845, lon: 77.7064 },
  'Rajkot': { lat: 22.3039, lon: 70.8022 },
  'Kalyan-Dombivli': { lat: 19.2437, lon: 73.1352 },
  'Vasai-Virar': { lat: 19.3919, lon: 72.8397 },
  'Varanasi': { lat: 25.3176, lon: 82.9739 },
  'Srinagar': { lat: 34.0837, lon: 74.7973 },
  'Aurangabad': { lat: 19.8762, lon: 75.3433 },
  'Dhanbad': { lat: 23.7957, lon: 86.4304 },
  'Amritsar': { lat: 31.6340, lon: 74.8723 },
  'Navi Mumbai': { lat: 19.0330, lon: 73.0297 },
  'Prayagraj': { lat: 25.4358, lon: 81.8463 },
  'Howrah': { lat: 22.5958, lon: 88.2636 },
  'Ranchi': { lat: 23.3441, lon: 85.3096 },
  'Gwalior': { lat: 26.2124, lon: 78.1772 },
  'Jabalpur': { lat: 23.1815, lon: 79.9864 },
  'Coimbatore': { lat: 11.0168, lon: 76.9558 },
  'Vijayawada': { lat: 16.5062, lon: 80.6480 },
  'Jodhpur': { lat: 26.2389, lon: 73.0243 },
  'Madurai': { lat: 9.9252, lon: 78.1198 },
  'Raipur': { lat: 21.2514, lon: 81.6296 },
  'Kota': { lat: 25.2138, lon: 75.8648 },
  'Guwahati': { lat: 26.1445, lon: 91.7362 },
  'Chandigarh': { lat: 30.7333, lon: 76.7794 },
  'Solapur': { lat: 17.6599, lon: 75.9064 },
  'Hubballi-Dharwad': { lat: 15.3647, lon: 75.1240 },
  'Bareilly': { lat: 28.3670, lon: 79.4304 },
  'Moradabad': { lat: 28.8351, lon: 78.7733 },
  'Mysuru': { lat: 12.2958, lon: 76.6394 },
  'Gurugram': { lat: 28.4595, lon: 77.0266 },
  'Aligarh': { lat: 27.8974, lon: 78.0880 },
  'Jalandhar': { lat: 31.3260, lon: 75.5762 },
  'Tiruchirappalli': { lat: 10.7905, lon: 78.7047 },
  'Bhubaneswar': { lat: 20.2961, lon: 85.8245 },
  'Salem': { lat: 11.6643, lon: 78.1460 },
  'Mira-Bhayandar': { lat: 19.2906, lon: 72.8550 },
  'Warangal': { lat: 17.9689, lon: 79.5941 },
  'Thiruvananthapuram': { lat: 8.5241, lon: 76.9366 },
  'Guntur': { lat: 16.3067, lon: 80.4365 },
  'Bhiwandi': { lat: 19.2813, lon: 73.0483 },
  'Saharanpur': { lat: 29.9640, lon: 77.5460 },
  'Gorakhpur': { lat: 26.7606, lon: 83.3731 },
  'Bikaner': { lat: 28.0229, lon: 73.3119 },
  'Amravati': { lat: 20.9320, lon: 77.7523 },
  'Noida': { lat: 28.5355, lon: 77.3910 },
  'Jamshedpur': { lat: 22.8046, lon: 86.2029 },
  'Bhilai': { lat: 21.1938, lon: 81.3509 },
  'Cuttack': { lat: 20.4625, lon: 85.8830 },
  'Firozabad': { lat: 27.1508, lon: 78.4000 },
  'Kochi': { lat: 9.9312, lon: 76.2673 },
  'Nellore': { lat: 14.4426, lon: 79.9865 },
  'Bhavnagar': { lat: 21.7645, lon: 72.1519 },
  'Dehradun': { lat: 30.3165, lon: 78.0322 },
  'Durgapur': { lat: 23.5204, lon: 87.3119 },
  'Asansol': { lat: 23.6739, lon: 86.9524 },
  'Rourkela': { lat: 22.2604, lon: 84.8536 },
  'Nanded': { lat: 19.1628, lon: 77.3183 },
  'Kolhapur': { lat: 16.7050, lon: 74.2433 },
  'Ajmer': { lat: 26.4499, lon: 74.6399 },
  'Akola': { lat: 20.7002, lon: 77.0082 },
  'Kalaburagi': { lat: 17.3297, lon: 76.8343 },
  'Jamnagar': { lat: 22.4707, lon: 70.0577 },
  'Ujjain': { lat: 23.1760, lon: 75.7885 },
  'Loni': { lat: 28.7505, lon: 77.2889 },
  'Siliguri': { lat: 26.7271, lon: 88.3953 },
  'Jhansi': { lat: 25.4484, lon: 78.5685 },
  'Ulhasnagar': { lat: 19.2215, lon: 73.1645 },
  'Jammu': { lat: 32.7266, lon: 74.8570 },
  'Sangli-Miraj & Kupwad': { lat: 16.8524, lon: 74.5815 },
  'Belagavi': { lat: 15.8497, lon: 74.4977 },
  'Mangaluru': { lat: 12.9141, lon: 74.8560 },
  'Ambattur': { lat: 13.1143, lon: 80.1480 },
  'Tirunelveli': { lat: 8.7139, lon: 77.7567 },
  'Malegaon': { lat: 20.5517, lon: 74.5085 },
  'Gaya': { lat: 24.7914, lon: 85.0002 },
  'Jalgaon': { lat: 21.0077, lon: 75.5626 }
};

const INDIAN_CITIES = popularCities.map(city => {
  const states: { [key: string]: string } = {
    'Mumbai': 'Maharashtra', 'Delhi': 'Delhi', 'Bengaluru': 'Karnataka', 'Hyderabad': 'Telangana', 'Ahmedabad': 'Gujarat',
    'Chennai': 'Tamil Nadu', 'Kolkata': 'West Bengal', 'Surat': 'Gujarat', 'Pune': 'Maharashtra', 'Jaipur': 'Rajasthan',
    'Lucknow': 'Uttar Pradesh', 'Kanpur': 'Uttar Pradesh', 'Nagpur': 'Maharashtra', 'Indore': 'Madhya Pradesh',
    'Thane': 'Maharashtra', 'Bhopal': 'Madhya Pradesh', 'Visakhapatnam': 'Andhra Pradesh', 'Pimpri-Chinchwad': 'Maharashtra',
    'Patna': 'Bihar', 'Vadodara': 'Gujarat', 'Ghaziabad': 'Uttar Pradesh', 'Ludhiana': 'Punjab', 'Agra': 'Uttar Pradesh',
    'Nashik': 'Maharashtra', 'Faridabad': 'Haryana', 'Meerut': 'Uttar Pradesh', 'Rajkot': 'Gujarat', 'Kalyan-Dombivli': 'Maharashtra',
    'Vasai-Virar': 'Maharashtra', 'Varanasi': 'Uttar Pradesh', 'Srinagar': 'Jammu & Kashmir', 'Aurangabad': 'Maharashtra',
    'Dhanbad': 'Jharkhand', 'Amritsar': 'Punjab', 'Navi Mumbai': 'Maharashtra', 'Prayagraj': 'Uttar Pradesh',
    'Howrah': 'West Bengal', 'Ranchi': 'Jharkhand', 'Gwalior': 'Madhya Pradesh', 'Jabalpur': 'Madhya Pradesh',
    'Coimbatore': 'Tamil Nadu', 'Vijayawada': 'Andhra Pradesh', 'Jodhpur': 'Rajasthan', 'Madurai': 'Tamil Nadu',
    'Raipur': 'Chhattisgarh', 'Kota': 'Rajasthan', 'Guwahati': 'Assam', 'Chandigarh': 'Chandigarh', 'Solapur': 'Maharashtra',
    'Hubballi-Dharwad': 'Karnataka', 'Bareilly': 'Uttar Pradesh', 'Moradabad': 'Uttar Pradesh', 'Mysuru': 'Karnataka',
    'Gurugram': 'Haryana', 'Aligarh': 'Uttar Pradesh', 'Jalandhar': 'Punjab', 'Tiruchirappalli': 'Tamil Nadu',
    'Bhubaneswar': 'Odisha', 'Salem': 'Tamil Nadu', 'Mira-Bhayandar': 'Maharashtra', 'Warangal': 'Telangana',
    'Thiruvananthapuram': 'Kerala', 'Guntur': 'Andhra Pradesh', 'Bhiwandi': 'Maharashtra', 'Saharanpur': 'Uttar Pradesh',
    'Gorakhpur': 'Uttar Pradesh', 'Bikaner': 'Rajasthan', 'Amravati': 'Maharashtra', 'Noida': 'Uttar Pradesh',
    'Jamshedpur': 'Jharkhand', 'Bhilai': 'Chhattisgarh', 'Cuttack': 'Odisha', 'Firozabad': 'Uttar Pradesh',
    'Kochi': 'Kerala', 'Nellore': 'Andhra Pradesh', 'Bhavnagar': 'Gujarat', 'Dehradun': 'Uttarakhand', 'Durgapur': 'West Bengal',
    'Asansol': 'West Bengal', 'Rourkela': 'Odisha', 'Nanded': 'Maharashtra', 'Kolhapur': 'Maharashtra', 'Ajmer': 'Rajasthan',
    'Akola': 'Maharashtra', 'Kalaburagi': 'Karnataka', 'Jamnagar': 'Gujarat', 'Ujjain': 'Madhya Pradesh', 'Loni': 'Uttar Pradesh',
    'Siliguri': 'West Bengal', 'Jhansi': 'Uttar Pradesh', 'Ulhasnagar': 'Maharashtra', 'Jammu': 'Jammu & Kashmir',
    'Sangli-Miraj & Kupwad': 'Maharashtra', 'Belagavi': 'Karnataka', 'Mangaluru': 'Karnataka', 'Ambattur': 'Tamil Nadu',
    'Tirunelveli': 'Tamil Nadu', 'Malegaon': 'Maharashtra', 'Gaya': 'Bihar', 'Jalgaon': 'Maharashtra'
  };
  return {
    city,
    state: states[city] || 'India',
    lat: CITY_COORDINATES[city].lat,
    lon: CITY_COORDINATES[city].lon
  };
});

const getClosestCity = (lat: number, lon: number): string => {
  let closestCity = 'Bengaluru';
  let minDistance = Infinity;
  for (const [city, coords] of Object.entries(CITY_COORDINATES)) {
    const distance = Math.sqrt(Math.pow(coords.lat - lat, 2) + Math.pow(coords.lon - lon, 2));
    if (distance < minDistance) {
      minDistance = distance;
      closestCity = city;
    }
  }
  return closestCity;
};

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
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationErrorMsg, setLocationErrorMsg] = useState('');
  const [showCityPicker, setShowCityPicker] = useState(false);
  const [citySearchQuery, setCitySearchQuery] = useState('');

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
          let targetMl = weight * 35;
          if (activityLevel === 'active') targetMl += 600;
          if (activityLevel === 'elite') targetMl += 1200;

          if (medicalConditions.includes('diabetes')) targetMl += 450;
          if (medicalConditions.includes('kidney')) targetMl -= 250;
          if (medicalConditions.includes('hypertension')) targetMl += 150;

          // Climate coefficient adjustments based on chosen location
          let climateModifier = 0;
          if (selectedCity) {
            const hotCities = ['Mumbai', 'Delhi', 'Chennai', 'Kolkata', 'Hyderabad', 'Ahmedabad', 'Jaipur'];
            const moderateCities = ['Bengaluru', 'Pune', 'Tokyo', 'San Francisco'];

            if (hotCities.some(city => selectedCity.includes(city))) {
              climateModifier = 350; // Extra hydration allocation for tropical climate baseline
            } else if (moderateCities.some(city => selectedCity.includes(city))) {
              climateModifier = 100; // Mild base elevation
            }
          }
          targetMl += climateModifier;

          targetMl = Math.round(targetMl / 50) * 50;
          targetMl = Math.min(4500, Math.max(1500, targetMl));

          const profileData = {
            age,
            gender,
            weightKg: weight,
            selectedCity,
            latitude: latitude || null,
            longitude: longitude || null,
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

                    <Modal
                      visible={showCityPicker}
                      transparent
                      animationType="slide"
                      onRequestClose={() => setShowCityPicker(false)}
                    >
                      <View className="flex-1 bg-black/40 justify-end">
                        <TouchableOpacity
                          activeOpacity={1}
                          onPress={() => {
                            setShowCityPicker(false);
                            setCitySearchQuery('');
                          }}
                          className="absolute inset-0"
                        />

                        <Animated.View
                          entering={FadeInUp.duration(300)}
                          className="w-full bg-[#01040a] border-t border-white/10 rounded-t-[42px] overflow-hidden h-[85%]"
                        >
                          <View className="items-center pt-3 pb-1">
                            <View className="w-12 h-1 bg-white/10 rounded-full" />
                          </View>

                          <View className="p-6">
                            <Text className="text-white font-black text-xl mb-6">Select Your City</Text>

                            <View className="flex-row items-center bg-white/[0.03] border border-white/10 rounded-[24px] px-5 py-2">
                              <Search size={20} color="#64748b" />
                              <TextInput
                                className="flex-1 ml-3 text-white text-[16px] font-medium h-12"
                                placeholder="Search Indian cities..."
                                placeholderTextColor="#475569"
                                value={citySearchQuery}
                                onChangeText={setCitySearchQuery}
                                autoFocus={false}
                                underlineColorAndroid="transparent"
                              />
                              {citySearchQuery.length > 0 && (
                                <TouchableOpacity onPress={() => setCitySearchQuery('')}>
                                  <Text className="text-[#64748b] font-bold px-2">Clear</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          </View>

                          <ScrollView
                            className="flex-1 px-4"
                            showsVerticalScrollIndicator={false}
                            keyboardShouldPersistTaps="handled"
                          >
                            {INDIAN_CITIES
                              .filter(c =>
                                c.city.toLowerCase().includes(citySearchQuery.toLowerCase()) ||
                                c.state.toLowerCase().includes(citySearchQuery.toLowerCase())
                              )
                              .map((c) => (
                                <TouchableOpacity
                                  key={`${c.city}-${c.state}`}
                                  onPress={() => {
                                    setSelectedCity(c.city);
                                    setLatitude(c.lat);
                                    setLongitude(c.lon);
                                    setShowCityPicker(false);
                                    setCitySearchQuery('');
                                  }}
                                  className={`p-5 mb-2 rounded-[24px] flex-row justify-between items-center ${
                                    selectedCity === c.city ? 'bg-[#00f2fe]/10 border border-[#00f2fe]/30' : 'bg-white/[0.02] border border-white/5'
                                  }`}
                                >
                                  <View>
                                    <Text className={`text-[15px] font-bold ${selectedCity === c.city ? 'text-[#00f2fe]' : 'text-neutral-200'}`}>
                                      {c.city}
                                    </Text>
                                    <Text className="text-[10px] text-neutral-500 font-mono mt-0.5 uppercase tracking-widest">{c.state}</Text>
                                  </View>
                                  {selectedCity === c.city && <Check size={18} color="#00f2fe" />}
                                </TouchableOpacity>
                              ))}

                            {INDIAN_CITIES.filter(c =>
                                c.city.toLowerCase().includes(citySearchQuery.toLowerCase()) ||
                                c.state.toLowerCase().includes(citySearchQuery.toLowerCase())
                              ).length === 0 && (
                              <View className="py-20 items-center">
                                <Text className="text-neutral-500 text-sm text-center">No cities found matching your search</Text>
                                <Text className="text-neutral-700 text-xs mt-2 italic">Try searching for the state or a nearby hub</Text>
                              </View>
                            )}
                            <View className="h-10" />
                          </ScrollView>

                          <SafeAreaView edges={['bottom']}>
                            <TouchableOpacity
                              onPress={() => {
                                setShowCityPicker(false);
                                setCitySearchQuery('');
                              }}
                              className="p-6 items-center border-t border-white/5"
                            >
                              <Text className="text-[#64748b] text-[12px] font-black uppercase tracking-widest">Close Picker</Text>
                            </TouchableOpacity>
                          </SafeAreaView>
                        </Animated.View>
                      </View>
                    </Modal>
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
