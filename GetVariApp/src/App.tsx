import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  UserProfile, 
  SensorData, 
  WearableDevice, 
  HydrationLog, 
  HistoricalDataPoint, 
  SmartAlert, 
  AIInsight,
  ConnectionState
} from './types';
import { runHydrationRiskSolver, calculateRecoveryEstimation, calculatePredictedRiskAfterDrink } from './utils/hydrationModel';
import Onboarding from './components/Onboarding';
import DeviceSimulator from './components/DeviceSimulator';
import { BLETelemetryService } from './utils/bleTelemetryService';
import { supabase } from './services/SupabaseClient';
import { AuthService } from './services/AuthService';

const bleService = new BLETelemetryService();
import { 
  Heart, 
  Activity, 
  Thermometer, 
  Droplets, 
  Radio, 
  Sparkles, 
  Bell, 
  Settings as SettingsIcon, 
  TrendingUp, 
  Cpu, 
  Layers, 
  User, 
  Check, 
  Plus, 
  Clock, 
  RefreshCw, 
  Smartphone, 
  ShieldAlert,
  Battery,
  AlertTriangle,
  Info,
  ChevronRight,
  UserCheck,
  MapPin,
  Sun,
  Moon,
  Lightbulb
} from 'lucide-react';

const generateUniqueId = (prefix: string): string => {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000000)}`;
};

const INITIAL_MOCK_PROFILE: UserProfile = {
  age: 26,
  gender: 'Male',
  weightKg: 78,
  activityLevel: 'moderate',
  fitnessGoal: 'optimize_health',
  waterHabit: 'moderate',
  targetDailyMl: 2600,
};

const SPLASH_MESSAGES = [
  "Initializing digital hydration twin...",
  "Calibrating sweat core telemetry...",
  "Loading gastric absorption matrices...",
  "Synchronizing ambient dew-point models...",
  "Securing biothermal feedback loops..."
];

const INITIAL_MOCK_SENSORS: SensorData = {
  heartRate: 72,
  activityLoad: 14,
  temperature: 24.5,
  humidity: 45,
  sweatGSR: 2.3,
  hydrationScore: 74,
  batteryLevel: 84,
  rssi: -58,
  lastUpdated: new Date().toISOString()
};

const INITIAL_HISTORICAL_DATA: HistoricalDataPoint[] = [
  { date: 'Mon', hydrationIndex: 82, waterIntakeMl: 2400, activityCalories: 450, heartRateAverage: 65 },
  { date: 'Tue', hydrationIndex: 78, waterIntakeMl: 2200, activityCalories: 620, heartRateAverage: 68 },
  { date: 'Wed', hydrationIndex: 88, waterIntakeMl: 2800, activityCalories: 300, heartRateAverage: 62 },
  { date: 'Thu', hydrationIndex: 71, waterIntakeMl: 1900, activityCalories: 780, heartRateAverage: 74 },
  { date: 'Fri', hydrationIndex: 65, waterIntakeMl: 1800, activityCalories: 850, heartRateAverage: 79 },
  { date: 'Sat', hydrationIndex: 84, waterIntakeMl: 3100, activityCalories: 400, heartRateAverage: 66 },
  { date: 'Sun', hydrationIndex: 79, waterIntakeMl: 2500, activityCalories: 500, heartRateAverage: 67 },
];

const DAILY_HISTORICAL_DATA: HistoricalDataPoint[] = [
  { date: '08:00', hydrationIndex: 85, waterIntakeMl: 400, activityCalories: 100, heartRateAverage: 64 },
  { date: '10:00', hydrationIndex: 81, waterIntakeMl: 250, activityCalories: 150, heartRateAverage: 69 },
  { date: '12:00', hydrationIndex: 74, waterIntakeMl: 550, activityCalories: 350, heartRateAverage: 81 },
  { date: '14:00', hydrationIndex: 69, waterIntakeMl: 0, activityCalories: 400, heartRateAverage: 86 },
  { date: '16:00', hydrationIndex: 86, waterIntakeMl: 800, activityCalories: 200, heartRateAverage: 67 },
  { date: '18:00', hydrationIndex: 82, waterIntakeMl: 350, activityCalories: 250, heartRateAverage: 70 },
  { date: '20:00', hydrationIndex: 89, waterIntakeMl: 600, activityCalories: 90, heartRateAverage: 63 },
];

const getCustomHistoricalData = (startDateStr: string, endDateStr: string): HistoricalDataPoint[] => {
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
    return INITIAL_HISTORICAL_DATA;
  }
  
  const diffTime = Math.abs(end.getTime() - start.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  const maxItems = Math.min(10, Math.max(3, diffDays));
  const dataPoints: HistoricalDataPoint[] = [];
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  for (let i = 0; i < maxItems; i++) {
    const currentDay = new Date(start);
    if (maxItems > 1) {
      currentDay.setDate(start.getDate() + Math.round((i * (diffDays - 1)) / (maxItems - 1)));
    }
    
    const dateLabel = maxItems <= 7 
      ? `${weekdays[currentDay.getDay()]} ${currentDay.getDate()}` 
      : `${currentDay.getMonth() + 1}/${currentDay.getDate()}`;
    
    const seed = currentDay.getDate() + currentDay.getMonth();
    const hydrationIndex = 65 + (seed % 28); // 65 to 93
    const waterIntakeMl = 1400 + ((seed * 11) % 18) * 100; // 1400 to 3100ml
    const activityCalories = 250 + ((seed * 7) % 13) * 50; // 250 to 850kcal
    const heartRateAverage = 62 + (seed % 17); // 62 to 78 bpm
    
    dataPoints.push({
      date: dateLabel,
      hydrationIndex,
      waterIntakeMl,
      activityCalories,
      heartRateAverage
    });
  }
  return dataPoints;
};

// --- BrandLogo Component - Elegant text-based getVāri logo matching reference specs ---
interface BrandLogoProps {
  fillPercent?: number; 
  size?: 'sm' | 'md' | 'lg' | 'xl';
  animated?: boolean;
  withDot?: boolean;
  theme?: 'light' | 'dark';
}

const BrandLogo: React.FC<BrandLogoProps> = ({ 
  size = 'md', 
  withDot = true,
  theme = 'dark'
}) => {
  let dotSize = "w-2 h-2";
  let getTextSize = "text-xl";
  let ariTextSize = "text-2xl sm:text-2xl";
  let gapClass = "gap-1.5";
  let pbClass = "pb-0";

  if (size === 'sm') {
    dotSize = "w-1.5 h-1.5";
    getTextSize = "text-sm";
    ariTextSize = "text-base";
    gapClass = "gap-1";
    pbClass = "pb-0";
  } else if (size === 'lg') {
    dotSize = "w-2.5 h-2.5";
    getTextSize = "text-2xl";
    ariTextSize = "text-3xl sm:text-4xl";
    gapClass = "gap-2.5";
    pbClass = "pb-0.5";
  } else if (size === 'xl') {
    dotSize = "w-3 h-3";
    getTextSize = "text-4xl sm:text-5xl";
    ariTextSize = "text-5xl sm:text-6xl";
    gapClass = "gap-3";
    pbClass = "pb-1";
  }

  // Choose colors strictly based on the actual theme
  const getTextColor = theme === 'light' ? 'text-[#020813]' : 'text-[#a3b3cc]/90';
  const ariTextColor = theme === 'light' ? 'text-[#020813]' : 'text-white';
  const dotColorClass = theme === 'light' ? 'bg-[#0284c7] shadow-[#0284c7]/50' : 'bg-cyan-400 shadow-cyan-400/50';

  return (
    <div className={`flex items-center ${gapClass} select-none`}>
      {withDot && (
        <span className={`${dotSize} rounded-full ${dotColorClass} shadow-lg animate-pulse shrink-0`} />
      )}
      <div className="flex items-baseline leading-none font-sans select-none">
        {/* "get" word */}
        <span className={`${getTextSize} font-light ${getTextColor} tracking-tight ${pbClass} mr-0.5 select-none`}>
          get
        </span>
        {/* "Vāri" word */}
        <span className={`${ariTextSize} font-extrabold tracking-tight ${ariTextColor} select-none`}>
          Vāri
        </span>
      </div>
    </div>
  );
};

export default function App() {
  // Onboarding control (checks local storage or state)
  const [isOnboarded, setIsOnboarded] = useState<boolean>(() => {
    try {
      // Always start fresh with onboarding screens on page reload per user feedback
      localStorage.removeItem('getvari_onboard_complete');
      return false;
    } catch {
      return false;
    }
  });

  // Stage state controller: 'splash' | 'login' | 'onboarding' | 'dashboard'
  const [appStage, setAppStage] = useState<'splash' | 'login' | 'onboarding' | 'dashboard'>('splash');

  // Splash screen animation state triggers (liquid vessel fill & logo presentation)
  const [splashState, setSplashState] = useState<'only_v' | 'full_brand'>('only_v');
  const [splashWaterLevel, setSplashWaterLevel] = useState<number>(0);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => {
    try {
      // Always start fresh with the login screen on page reload to demonstrate flow
      localStorage.removeItem('getvari_logged_in');
      return false;
    } catch {
      return false;
    }
  });

  // Phone Login State variables
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [selectedCountryCode, setSelectedCountryCode] = useState<string>('+91');
  const [otpCode, setOtpCode] = useState<string>('');
  const [isOtpSent, setIsOtpSent] = useState<boolean>(false);
  const [otpSentCountdown, setOtpSentCountdown] = useState<number>(0);
  const [agreeTerms, setAgreeTerms] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string>('');
  const [isVerifyingLogin, setIsVerifyingLogin] = useState<boolean>(false);

  // Settings / Core state
  const [profile, setProfile] = useState<UserProfile>(INITIAL_MOCK_PROFILE);

  // Navigation tab state
  const [activeTab, setActiveTab] = useState<'dashboard' | 'analytics' | 'sensors' | 'settings'>('dashboard');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // Interactive bio analytics visualization display duration option state
  const [analyticsDuration, setAnalyticsDuration] = useState<'daily' | 'weekly' | 'custom'>('weekly');
  const [customStartDate, setCustomStartDate] = useState<string>('2026-05-15');
  const [customEndDate, setCustomEndDate] = useState<string>('2026-05-21');

  // Sensors & Wearable sync
  const [sensorData, setSensorData] = useState<SensorData>(INITIAL_MOCK_SENSORS);
  const [deviceConnection, setDeviceConnection] = useState<ConnectionState>('connected');
  const [hoursSinceDrink, setHoursSinceDrink] = useState<number>(0.8);
  const [effectiveHoursSinceDrink, setEffectiveHoursSinceDrink] = useState<number>(0.8);
  const [waterLogs, setWaterLogs] = useState<HydrationLog[]>([]);

  useEffect(() => {
    fetchSupabaseData();
  }, [isLoggedIn]);

  const fetchSupabaseData = async () => {
    if (!isLoggedIn) return;
    try {
      // For web, AuthService might need a different token retrieval or we use supabase.auth directly
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id || '00000000-0000-0000-0000-000000000000'; // Demo fallback for web too

      // Fetch Profile
      const { data: profileRow } = await supabase
        .from('getvari_profiles')
        .select('profile')
        .eq('id', userId)
        .single();

      if (profileRow?.profile) {
        setProfile(profileRow.profile);
      }

      // Fetch Logs
      const { data: logsData } = await supabase
        .from('getvari_hydration_logs')
        .select('*')
        .order('timestamp', { ascending: false });

      if (logsData) {
        setWaterLogs(logsData.map(l => ({
          id: l.id,
          timestamp: l.timestamp,
          amountMl: l.amount_ml,
          source: l.source as any
        })));
      }
    } catch (e) {
      console.error('Supabase fetch failed:', e);
    }
  };

  // Connected integration wearables representation
  const [connectedDevices, setConnectedDevices] = useState<WearableDevice[]>([
    { id: 'hk_01', name: 'Apple HealthKit', type: 'health_kit', connected: true },
    { id: 'gv_hw_01', name: 'GetVari Core ESP32', type: 'getvari_hardware', connected: true, batteryLevel: 84, lastSynced: new Date().toISOString() }
  ]);

  // AI Insights State
  const [insights, setInsights] = useState<AIInsight[]>([
    {
      id: 'init_ins_1',
      category: 'hydration',
      title: 'Hydration Risk Insight',
      text: 'Elevated heart strain and activity levels are increasing hydration demand. Current conditions suggest proactive fluid replenishment.',
      timestamp: new Date().toISOString(),
      source: 'rule_engine'
    },
    {
      id: 'init_ins_2',
      category: 'recovery',
      title: 'Recovery Recommendation',
      text: 'Based on current hydration deficit and workload, consuming 500ml water may help reduce hydration risk over the next recovery cycle.',
      timestamp: new Date().toISOString(),
      source: 'rule_engine'
    }
  ]);
  const [loadingInsights, setLoadingInsights] = useState<boolean>(false);
  const [insightsFallbackReason, setInsightsFallbackReason] = useState<'quota_exceeded' | 'no_api_key' | 'general_error' | null>(null);

  // Smart alerts notifications list
  const [alerts, setAlerts] = useState<SmartAlert[]>([
    { id: 'al_1', timestamp: new Date().toISOString(), title: 'High Sweat Output', message: 'Activity level is elevating, drink 300ml water.', type: 'warning', read: false },
    { id: 'al_2', timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(), title: 'Goal achieved', message: 'You parsed 65% of your dynamic hydration mark.', type: 'goal_achievement', read: true }
  ]);
  const [showAlertModal, setShowAlertModal] = useState<boolean>(false);
  const [fluidToLog, setFluidToLog] = useState<number | null>(null);
  const [showCustomAmountInput, setShowCustomAmountInput] = useState<boolean>(false);
  const [customAmount, setCustomAmount] = useState<string>('');
  const [debugMode, setDebugMode] = useState<boolean>(true);
  const [showLogSuccessPopup, setShowLogSuccessPopup] = useState<boolean>(false);
  const [lastLoggedAmount, setLastLoggedAmount] = useState<number>(0);

  // Dynamic physiological hydration telemetry simulation states
  const [stomachVolume, setStomachVolume] = useState<number>(0); // ml water currently digesting in gut
  const [activeAbsorbedHydration, setActiveAbsorbedHydration] = useState<number>(180); // ml active absorbed cellular fluid pool
  const [displayedScore, setDisplayedScore] = useState<number>(20); // Smooth displayed score interpolator

  // Keep refs of dynamic states to avoid stale closures in telemetry setInterval callback
  const sensorDataRef = React.useRef(sensorData);
  React.useEffect(() => {
    sensorDataRef.current = sensorData;
  }, [sensorData]);

  const stomachVolumeRef = React.useRef(stomachVolume);
  React.useEffect(() => {
    stomachVolumeRef.current = stomachVolume;
  }, [stomachVolume]);

  const activeAbsorbedHydrationRef = React.useRef(activeAbsorbedHydration);
  React.useEffect(() => {
    activeAbsorbedHydrationRef.current = activeAbsorbedHydration;
  }, [activeAbsorbedHydration]);

  const effectiveHoursSinceDrinkRef = React.useRef(effectiveHoursSinceDrink);
  React.useEffect(() => {
    effectiveHoursSinceDrinkRef.current = effectiveHoursSinceDrink;
  }, [effectiveHoursSinceDrink]);

  // BLE Pairing interface states
  const [isScanningBLE, setIsScanningBLE] = useState<boolean>(false);
  const [isPairingFinished, setIsPairingFinished] = useState<boolean>(true);
  const [scannedDevices, setScannedDevices] = useState<{ id: string; name: string; rssi: number; batteryLevel: number }[]>([]);
  const [bleMode, setBleMode] = useState<'real' | 'mock'>('mock');
  const [pairedDeviceInfo, setPairedDeviceInfo] = useState<{ name: string; id: string; rssi?: number; batteryLevel?: number } | null>(null);

  const pairedDeviceInfoRef = React.useRef(pairedDeviceInfo);
  React.useEffect(() => {
    pairedDeviceInfoRef.current = pairedDeviceInfo;
  }, [pairedDeviceInfo]);

  // Fluctuating simulation active metrics (Live Hardware Broadcast Simulation Loop)
  useEffect(() => {
    if (deviceConnection !== 'connected' && deviceConnection !== 'syncing') return;

    const interval = setInterval(() => {
      // 1. Intentionally fluctuate sensor values to simulate real skin + ambient telemetry
      // BUT ONLY if there's no active BLE device connected!
      if (!pairedDeviceInfoRef.current) {
        setSensorData((prev) => {
          if (deviceConnection === 'disconnected') return prev;

          const hrDelta = Math.floor(Math.random() * 5) - 2; // -2 to +2 bpm
          const newHr = Math.min(170, Math.max(50, prev.heartRate + hrDelta));

          const sweatDelta = (Math.random() * 0.4) - 0.2; // -0.2 to +0.2 microsiemens
          const newSweat = Math.min(15.0, Math.max(0.1, prev.sweatGSR + sweatDelta));

          const tempDelta = (Math.random() * 0.2) - 0.1;
          const newTemp = Math.min(41.0, Math.max(18.0, prev.temperature + tempDelta));

          return {
            ...prev,
            heartRate: newHr,
            sweatGSR: Number(newSweat.toFixed(2)),
            temperature: Number(newTemp.toFixed(1)),
            lastUpdated: new Date().toISOString()
          };
        });
      }

      // Slowly increment the drink delay ticker for extreme health simulation reality
      setHoursSinceDrink((prev) => Number((prev + 0.02).toFixed(2)));

      // 2. Physiological dynamic simulation step: fluid absorption and metabolic sweat loss
      const currentSensors = sensorDataRef.current;
      const currentStomach = stomachVolumeRef.current;
      const currentAbsorbed = activeAbsorbedHydrationRef.current;
      const currentEffective = effectiveHoursSinceDrinkRef.current;

      const tempDiff = Math.max(0, currentSensors.temperature - 22);
      const humidDiff = Math.max(0, currentSensors.humidity - 44);
      const heatScore = Math.min(100, Math.max(0, (tempDiff * 4.5) + (humidDiff * 0.4)));

      // Calculate gastric absorption rate (slower under heavy exercise workload and ambient heat)
      const activityFactor = Math.min(0.4, (currentSensors.activityLoad / 100) * 0.4);
      const heatFactor = Math.min(0.3, (heatScore / 100) * 0.3);
      // Sympathetic nervous feedback slows absorption. Multiplier ranges from 1.0 (chill/optimal) to 0.3 (extreme strain)
      const absorptionMultiplier = Math.max(0.3, 1 - activityFactor - heatFactor);
      
      const baselineAbsorptionRate = 12; // 12 ml water / minute baseline stomach emptying speed
      const actualAbsorptionRate = (baselineAbsorptionRate * absorptionMultiplier) * 1.2; // ml swallowed water absorbed per 1.2min tick

      const absorbed = Math.min(currentStomach, actualAbsorptionRate);

      // Sweat fluid loss rate scales up beautifully under physical load and environmental temperature lines
      const baselineSweatRate = 1.4; // 1.4 ml water burned / minute metabolic loss
      const currentSweatRate = baselineSweatRate + (currentSensors.activityLoad / 100) * 8.6 + (heatScore / 100) * 5.0;
      const sweatLoss = currentSweatRate * 1.2; // ml water evaporated off body per 1.2 simulated minute tick

      // Transaction step updates: Stomach empties, Active hydration levels fluctuate
      setStomachVolume((prev) => Number(Math.max(0, prev - absorbed).toFixed(1)));
      setActiveAbsorbedHydration((prev) => {
        const nextAbsorbed = prev + absorbed - sweatLoss;
        // Bound active body fluid pool between 0 and 1000ml max
        return Number(Math.min(1000, Math.max(0, nextAbsorbed)).toFixed(1));
      });

      // Update effective hours since drink (rehydration takes time!)
      // Every 250ml absorbed reduces effective delay by 1.5 hours
      setEffectiveHoursSinceDrink((prev) => {
        const reduction = (absorbed / 250.0) * 1.5;
        const nextEffective = prev + 0.02 - reduction;
        return Number(Math.max(0, Math.min(8.0, nextEffective)).toFixed(2));
      });
    }, 1500);

    return () => clearInterval(interval);
  }, [deviceConnection]);

  // Regenerate Hydration and Risk details dynamically including absorbed hydration mitigation pool state
  const solvedRisk = runHydrationRiskSolver(sensorData, effectiveHoursSinceDrink, activeAbsorbedHydration, profile);

  // Smoothly interpolate the displayed score for professional aesthetic transitions on each tick
  useEffect(() => {
    let animationFrameId: number;
    const animate = () => {
      setDisplayedScore((prev) => {
        const target = solvedRisk.score;
        if (Math.abs(prev - target) < 0.15) {
          return target;
        }
        // Adjust the score by 3% of the difference per frame for super smooth liquid transitions
        const step = (target - prev) * 0.03;
        return Number((prev + step).toFixed(1));
      });
      animationFrameId = requestAnimationFrame(animate);
    };
    animationFrameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrameId);
  }, [solvedRisk.score]);

  // Call server-side Express / Gemini router
  const fetchNewAIInsights = async () => {
    setLoadingInsights(true);
    try {
      const response = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sensorData: { ...sensorData, hydrationScore: solvedRisk.score },
          profile,
          recentLogs: waterLogs.slice(0, 5),
          hoursSinceDrink,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setInsightsFallbackReason(data.fallbackReason || null);
        if (data.insights && data.insights.length > 0) {
          setInsights(data.insights);
          
          // Generate a custom smart notification based on newly synthesize insights!
          const generatedAlert: SmartAlert = {
            id: generateUniqueId('sys_al'),
            timestamp: new Date().toISOString(),
            title: data.insights[0].title,
            message: data.insights[0].text,
            type: solvedRisk.score < 55 ? 'warning' : 'info',
            read: false
          };
          setAlerts(prev => [generatedAlert, ...prev]);
        }
      } else {
        setInsightsFallbackReason('general_error');
        console.error('Core insights synthesis failed.');
      }
    } catch (e) {
      console.error('Error connecting with telemetry backend API:', e);
    } finally {
      setLoadingInsights(false);
    }
  };

  // Re-trigger insights fetch each time risk conditions dynamically shift state or on user tap
  useEffect(() => {
    // Debounce or initially load insights once when onboarding completes
    if (isOnboarded) {
      fetchNewAIInsights();
    }
  }, [isOnboarded]);

  // Log new fluid consumption manually
  const logDrink = async (amountMl: number) => {
    const timestamp = new Date().toISOString();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id || '00000000-0000-0000-0000-000000000000';

      const newLog = {
        id: `log_${userId}_${Date.now()}`,
        timestamp,
        amount_ml: amountMl,
        source: 'manual',
      };

      await supabase.from('getvari_hydration_logs').insert(newLog);

      const logItem: HydrationLog = {
        id: newLog.id,
        timestamp,
        amountMl,
        source: 'manual',
      };
      setWaterLogs((prev) => [logItem, ...prev]);
    } catch (e) {
      console.error('Failed to log to Supabase:', e);
      // Fallback local update
      const fallbackLog: HydrationLog = {
        id: generateUniqueId('log'),
        timestamp,
        amountMl,
        source: 'manual',
      };
      setWaterLogs((prev) => [fallbackLog, ...prev]);
    }
    
    // Add logged liquid volume directly to the stomach absorption channel
    setStomachVolume((prev) => Math.min(1200, prev + amountMl));
    
    // Reset temporal drink delay to keep track of timing actions
    setHoursSinceDrink(0.0);

    // Trigger local push warning popup success
    const alertItem: SmartAlert = {
      id: generateUniqueId('alert'),
      timestamp: new Date().toISOString(),
      title: 'Water Intake Synced',
      message: `Integrated +${amountMl}ml into metabolic stream tracker.`,
      type: 'goal_achievement',
      read: false
    };
    setAlerts((prev) => [alertItem, ...prev]);
  };

  // Synchronize manual adjustments from the hardware simulator
  const handleManualHoursSinceDrinkSlider = (val: number | ((prev: number) => number)) => {
    if (typeof val === 'function') {
      setHoursSinceDrink((prev) => {
        const next = val(prev);
        setEffectiveHoursSinceDrink(next);
        return next;
      });
    } else {
      setHoursSinceDrink(val);
      setEffectiveHoursSinceDrink(val);
    }
  };

  // Total logged water today
  const totalWaterConsumed = waterLogs.reduce((acc, curr) => acc + curr.amountMl, 0);
  const targetPercent = Math.min(100, Math.round((totalWaterConsumed / profile.targetDailyMl) * 100));
  const sortedLogs = [...waterLogs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const lastLog = sortedLogs[0];

  // Auto-redirect timer for Splash Stage
  useEffect(() => {
    if (appStage === 'splash') {
      const timer = setTimeout(() => {
        try {
          const loadedLoggedIn = localStorage.getItem('getvari_logged_in') === 'true';
          const loadedOnboarded = localStorage.getItem('getvari_onboard_complete') === 'true';
          setIsLoggedIn(loadedLoggedIn);
          setIsOnboarded(loadedOnboarded);
          if (loadedLoggedIn) {
            if (loadedOnboarded) {
              setAppStage('dashboard');
            } else {
              setAppStage('onboarding');
            }
          } else {
            setAppStage('login');
          }
        } catch {
          setAppStage('login');
        }
      }, 5500); // 5.5-second elegant splash
      return () => clearTimeout(timer);
    }
  }, [appStage]);

  // Premium watermark/vessel fill animation timer for getVari logo
  useEffect(() => {
    if (appStage === 'splash') {
      setSplashState('only_v');
      setSplashWaterLevel(0);
      
      const duration = 2200; // 2.2 seconds filling time
      let startTime: number | null = null;
      let frameId: number;

      const animate = (timestamp: number) => {
        if (!startTime) startTime = timestamp;
        const elapsed = timestamp - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Use a soft ease for pleasant water transition
        const easedProgress = 1 - Math.pow(1 - progress, 1.8);
        setSplashWaterLevel(easedProgress * 100);

        if (progress < 1) {
          frameId = requestAnimationFrame(animate);
        } else {
          setSplashState('full_brand');
        }
      };

      frameId = requestAnimationFrame(animate);
      return () => cancelAnimationFrame(frameId);
    }
  }, [appStage]);

  // OTP Countdown timer
  useEffect(() => {
    if (otpSentCountdown > 0) {
      const timer = setInterval(() => {
        setOtpSentCountdown((prev) => prev - 1);
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [otpSentCountdown]);

  // Simulate auto-reading the OTP
  useEffect(() => {
    if (isOtpSent) {
      setOtpCode('');
      // Delay before starting auto-fill simulation to resemble receipt of SMS
      const autoReadTimer = setTimeout(() => {
        const targetCode = '8842';
        let current = '';
        const typeSpeed = 150; // ms per digit

        const typeDigit = (index: number) => {
          if (index < targetCode.length) {
            current += targetCode[index];
            setOtpCode(current);
            setTimeout(() => typeDigit(index + 1), typeSpeed);
          } else {
            // Trigger verify automatically
            setIsVerifyingLogin(true);
            setTimeout(() => {
              setIsVerifyingLogin(false);
              setIsLoggedIn(true);
              try {
                localStorage.setItem('getvari_logged_in', 'true');
              } catch (err) {
                console.error(err);
              }
              const loadedOnboarded = localStorage.getItem('getvari_onboard_complete') === 'true';
              if (loadedOnboarded) {
                setAppStage('dashboard');
              } else {
                setAppStage('onboarding');
              }
              setAlerts(prev => [{
                id: generateUniqueId('sys_log'),
                timestamp: new Date().toISOString(),
                title: 'Auto-Read Successful',
                message: 'OTP auto-read and verified successfully.',
                type: 'goal_achievement',
                read: false
              }, ...prev]);
            }, 1000);
          }
        };
        typeDigit(0);
      }, 1200);

      return () => clearTimeout(autoReadTimer);
    }
  }, [isOtpSent]);

  const handleRequestOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber) {
      setLoginError('Please enter a valid mobile number.');
      return;
    }
    if (!agreeTerms) {
      setLoginError('You must agree to the Terms & Conditions to proceed.');
      return;
    }
    setLoginError('');
    setIsOtpSent(true);
    setOtpSentCountdown(30);

    // Alert toast with the suggestion
    const alertItem: SmartAlert = {
      id: generateUniqueId('otp_sys'),
      timestamp: new Date().toISOString(),
      title: 'Demo SMS Dispatched',
      message: 'Your custom secure authorization code is: 8842',
      type: 'info',
      read: false
    };
    setAlerts((prev) => [alertItem, ...prev]);
  };

  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber) {
      setLoginError('Phone number required.');
      return;
    }
    if (!agreeTerms) {
      setLoginError('You must agree to the Terms & Conditions to proceed.');
      return;
    }
    if (otpCode !== '8842') {
      setLoginError('Incorrect verification OTP. Enter code: 8842');
      return;
    }

    setLoginError('');
    setIsVerifyingLogin(true);
    setTimeout(() => {
      setIsVerifyingLogin(false);
      setIsLoggedIn(true);
      try {
        localStorage.setItem('getvari_logged_in', 'true');
      } catch (err) {
        console.error(err);
      }
      const loadedOnboarded = localStorage.getItem('getvari_onboard_complete') === 'true';
      if (loadedOnboarded) {
        setAppStage('dashboard');
      } else {
        setAppStage('onboarding');
      }
      setAlerts(prev => [{
        id: generateUniqueId('sys_log'),
        timestamp: new Date().toISOString(),
        title: 'Authentication Success',
        message: 'Established secure bio-encryption session context.',
        type: 'goal_achievement',
        read: false
      }, ...prev]);
    }, 1200);
  };

  // Finish Onboarding Wizard Callback
  const handleOnboardingComplete = (completedProfile: UserProfile, devices: WearableDevice[]) => {
    setProfile(completedProfile);
    setConnectedDevices(devices);
    setIsOnboarded(true);
    setAppStage('dashboard');
    try {
      localStorage.setItem('getvari_onboard_complete', 'true');
      localStorage.setItem('getvari_profile', JSON.stringify(completedProfile));
    } catch (e) {
      console.error('Local Storage save lock bypassed:', e);
    }
  };

  // Skip onboarding directly for easy preview testing
  const skipOnboarding = () => {
    handleOnboardingComplete(INITIAL_MOCK_PROFILE, [
      { id: 'hk_01', name: 'Apple HealthKit', type: 'health_kit', connected: true },
      { id: 'gv_hw_01', name: 'GetVari Core ESP32', type: 'getvari_hardware', connected: true, batteryLevel: 84, lastSynced: new Date().toISOString() }
    ]);
  };

  // Clear unread notifications
  const clearAlerts = () => {
    setAlerts([]);
  };

  // Hook up Live BLE Telemetry Service
  useEffect(() => {
    const handleBLEData = (data: Partial<SensorData>) => {
      setSensorData((prev) => ({
        ...prev,
        ...data,
        lastUpdated: new Date().toISOString()
      }));
    };

    const handleBLEStatus = (status: ConnectionState) => {
      setDeviceConnection(status);
    };

    const handleBLEDeviceInfo = (info: { name: string; id: string; rssi?: number; batteryLevel?: number }) => {
      setPairedDeviceInfo(info);
      if (info.batteryLevel !== undefined) {
        setSensorData(prev => ({ ...prev, batteryLevel: info.batteryLevel! }));
      }
      if (info.rssi !== undefined) {
        setSensorData(prev => ({ ...prev, rssi: info.rssi! }));
      }
      
      const newDev: WearableDevice = {
        id: info.id,
        name: info.name,
        type: 'getvari_hardware',
        connected: true,
        batteryLevel: info.batteryLevel,
        lastSynced: new Date().toISOString()
      };

      setConnectedDevices((prev) => {
        const filtered = prev.filter(d => d.type !== 'getvari_hardware');
        return [...filtered, newDev];
      });
    };

    bleService.addEventListener('data', handleBLEData);
    bleService.addEventListener('status', handleBLEStatus);
    bleService.addEventListener('deviceInfo', handleBLEDeviceInfo);

    return () => {
      bleService.removeEventListener('data', handleBLEData);
      bleService.removeEventListener('status', handleBLEStatus);
      bleService.removeEventListener('deviceInfo', handleBLEDeviceInfo);
    };
  }, []);

  // Soft/Real Pairing BLE managers
  const startBLEScanning = async () => {
    if (bleMode === 'real') {
      setIsScanningBLE(true);
      try {
        await bleService.scanAndConnect(false);
        setAlerts(prev => [{
          id: generateUniqueId('sys_pair'),
          timestamp: new Date().toISOString(),
          title: 'Physical ESP32 Connected',
          message: 'Established real Web Bluetooth telemetry feed.',
          type: 'goal_achievement',
          read: false
        }, ...prev]);
      } catch (err: any) {
        console.error(err);
        setAlerts(prev => [{
          id: generateUniqueId('sys_pair_err'),
          timestamp: new Date().toISOString(),
          title: 'BLE Sync Aborted',
          message: err.message || 'Bluetooth connection was closed or rejected.',
          type: 'critical',
          read: false
        }, ...prev]);
      } finally {
        setIsScanningBLE(false);
      }
    } else {
      setIsScanningBLE(true);
      setScannedDevices([]);
      setTimeout(() => {
        setScannedDevices([
          { id: 'GETVARI_ESP32_A7', name: 'GetVari Core ESP32_v1', rssi: -45, batteryLevel: 95 },
          { id: 'OURA_RING_F4', name: 'Oura Ring Gen3', rssi: -72, batteryLevel: 68 },
          { id: 'WHOOP_BAND_4', name: 'WHOOP Strainer', rssi: -84, batteryLevel: 31 },
        ]);
        setIsScanningBLE(false);
      }, 1500);
    }
  };

  const connectScannedDevice = async (dev: any) => {
    setIsPairingFinished(false);
    try {
      await bleService.scanAndConnect(true, dev.id);
      setAlerts(prev => [{
        id: generateUniqueId('sys_pair'),
        timestamp: new Date().toISOString(),
        title: 'ESP32 Simulator Coupled',
        message: `Linked virtual peripheral ${dev.name} over mock GATT notifications.`,
        type: 'goal_achievement',
        read: false
      }, ...prev]);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsPairingFinished(true);
    }
  };

  const disconnectHardware = () => {
    bleService.disconnect();
    setPairedDeviceInfo(null);
    setConnectedDevices(prev => prev.map(d => d.type === 'getvari_hardware' ? { ...d, connected: false } : d));
    // Fall back to default mock sensors
    setSensorData(prev => ({ 
      ...prev, 
      heartRate: 75, 
      activityLoad: 15, 
      sweatGSR: 1.5,
      batteryLevel: 90,
      rssi: -40
    }));
  };

  // Render Stages
  if (appStage === 'splash') {
    return (
      <div className="min-h-screen bg-[#02050e] bg-gradient-to-tr from-[#0b1b3a] via-[#030a18] to-[#02050c] flex flex-col justify-center items-center p-6 text-neutral-100 selection:bg-cyan-500 selection:text-neutral-950 overflow-hidden relative">
        {/* Glow circles */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-cyan-500/10 rounded-full blur-[160px] pointer-events-none"></div>
        <div className="absolute -top-20 -left-20 w-[400px] h-[400px] bg-blue-500/10 rounded-full blur-[140px] pointer-events-none"></div>

        {/* Brand Core Visual */}
        <div className="flex flex-col items-center justify-center min-h-[300px] z-10 w-full max-w-md">
          <AnimatePresence mode="wait">
            {splashState === 'only_v' ? (
              <motion.div
                key="only_v"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9, filter: "blur(6px)" }}
                transition={{ duration: 0.5, ease: "easeInOut" }}
                className="flex flex-col items-center justify-center p-4 scale-[1.8]"
              >
                {/* Giant filling V Vessel container - Water fills inside the walls, keeping white edges dry */}
                <svg className="w-20 h-20 drop-shadow-[0_0_25px_rgba(6,182,212,0.4)]" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id="splash-vessel-fluid-grad" x1="0" y1="1" x2="0" y2="0">
                      <stop offset="0%" stopColor="#0284c7" />
                      <stop offset="50%" stopColor="#06b6d4" />
                      <stop offset="100%" stopColor="#10b981" />
                    </linearGradient>
                    <clipPath id="splash-vessel-cavity-clip">
                      <path d="M 28.5,15 L 50,56 L 71.5,15 Z" />
                    </clipPath>
                  </defs>

                  {/* Cavity dry backdrop shadow */}
                  <path 
                    d="M 28.5,15 L 50,56 L 71.5,15 Z" 
                    fill="rgba(6, 182, 212, 0.08)" 
                  />

                  {/* Water volume filling between the edges */}
                  <g clipPath="url(#splash-vessel-cavity-clip)">
                    <rect
                      x="0"
                      y={56 - (splashWaterLevel / 100) * 41}
                      width="100"
                      height="100"
                      fill="url(#splash-vessel-fluid-grad)"
                    />
                    {splashWaterLevel > 0 && splashWaterLevel < 100 && (
                      <path 
                        d={`M 0,${56 - (splashWaterLevel / 100) * 41} Q 25,${56 - (splashWaterLevel / 100) * 41 - 2.5} 50,${56 - (splashWaterLevel / 100) * 41} T 100,${56 - (splashWaterLevel / 100) * 41} L 100,100 L 0,100 Z`}
                        fill="rgba(34, 211, 238, 0.45)"
                      />
                    )}
                  </g>

                  {/* Pristine solid white walls drawing on top, keeping water between the edges */}
                  <path 
                    d="M 15,15 L 50,85 L 85,15 L 71.5,15 L 50,56 L 28.5,15 Z" 
                    fill="#ffffff"
                    stroke="#ffffff"
                    strokeWidth="0.5"
                    strokeLinejoin="round" 
                  />
                </svg>
              </motion.div>
            ) : (
              <motion.div
                key="full_brand"
                initial={{ opacity: 0, scale: 0.92, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                className="flex flex-col items-center justify-center text-center space-y-6"
              >
                {/* The beautifully synchronized Brand Logo with active pulsing dot */}
                <BrandLogo size="xl" withDot={true} fillPercent={100} />

                {/* Subtitle Tagline and biometric telemetry info */}
                <div className="space-y-4 pt-1">
                  <p className="text-xs uppercase tracking-[0.35em] text-cyan-400 font-mono font-extrabold">
                    Hydration Intelligence
                  </p>
                  
                  {/* Glowing micro loader */}
                  <div className="pt-2 flex flex-col items-center gap-1.5">
                    <span className="text-[10px] font-mono text-neutral-400 tracking-wider">
                      Powering bio-cellular loop...
                    </span>
                    <div className="flex gap-1 justify-center items-center mt-1">
                      <span className="w-1 h-1 rounded-full bg-cyan-400 animate-ping"></span>
                      <span className="w-1 h-1 rounded-full bg-cyan-400/80 animate-ping delay-150"></span>
                      <span className="w-1 h-1 rounded-full bg-cyan-400/50 animate-ping delay-300"></span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer Disclaimer */}
        <div className="absolute bottom-8 text-[9px] text-neutral-600 font-mono tracking-widest uppercase select-none">
          Confidential Session — Demonstration Only
        </div>
      </div>
    );
  }

  if (appStage === 'login') {
    return (
      <div className="min-h-screen bg-[#02050e] bg-gradient-to-tr from-[#051124] via-[#02050c] to-[#010205] flex flex-col justify-center items-center py-10 px-4 text-neutral-100 selection:bg-cyan-500 selection:text-neutral-950 relative overflow-hidden">
        {/* Ambient glows */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[550px] h-[550px] bg-cyan-500/5 rounded-full blur-[140px] pointer-events-none"></div>
        <div className="absolute bottom-10 right-10 w-[350px] h-[350px] bg-blue-500/5 rounded-full blur-[100px] pointer-events-none"></div>

        <div className="w-full max-w-md z-10 glass rounded-[36px] overflow-hidden shadow-2xl transition border-white/5 relative p-6 md:p-8 space-y-6">
          <div className="text-center space-y-3 flex flex-col items-center">
            {/* Perfectly uniform brand logo at the top of the login gate */}
            <div className="mb-1">
              <BrandLogo size="lg" withDot={true} fillPercent={100} />
            </div>
            <p className="text-xs text-neutral-400 max-w-xs mx-auto leading-relaxed">
              Verify your mobile number to validate session telemetry.
            </p>
          </div>

          {loginError && (
            <div className="p-3.5 bg-red-500/10 border border-red-500/30 text-red-200 text-xs rounded-xl flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5 leading-normal">
                <span className="font-bold block">Validation Denied</span>
                <span>{loginError}</span>
              </div>
            </div>
          )}

          {/* Step 1: Input Phone details */}
          {!isOtpSent ? (
            <form onSubmit={handleRequestOtp} className="space-y-4">
              <div className="space-y-1.5 text-left">
                <div className="flex gap-2.5">
                  <div className="bg-[#050c18] border border-white/10 rounded-xl px-4 py-2.5 text-xs text-neutral-200 font-mono flex items-center gap-1.5 select-none shrink-0">
                    <span>🇮🇳</span>
                    <span className="font-bold font-mono text-neutral-200">+91</span>
                  </div>
                  <input
                    type="tel"
                    required
                    placeholder="Enter mobile number"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value.replace(/[^0-9]/g, ''))}
                    className="flex-1 bg-[#050c18] border border-white/10 rounded-xl px-4 py-2.5 text-xs text-neutral-200 font-mono tracking-wider focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400/30 transition placeholder:text-neutral-600 font-bold"
                  />
                </div>
              </div>

              {/* T&C checkbox explicitly requested! */}
              <div className="p-3 bg-[#050c18]/60 border border-white/5 rounded-xl text-left">
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={agreeTerms}
                    onChange={(e) => {
                      setAgreeTerms(e.target.checked);
                      if (loginError && e.target.checked) setLoginError('');
                    }}
                    className="peer h-4.5 w-4.5 rounded border border-white/10 bg-[#050c18] text-cyan-500 focus:ring-cyan-400/20 focus:ring-opacity-50 checked:bg-cyan-500 cursor-pointer shrink-0"
                  />
                  <div className="text-xs text-neutral-300 font-semibold leading-none">
                    I agree to the <span className="text-cyan-400 hover:cyan-300 hover:underline transition">Terms & Conditions</span>
                  </div>
                </label>
              </div>

              <button
                type="submit"
                className="w-full bg-cyan-500 hover:bg-cyan-400 text-neutral-950 font-extrabold py-3.5 px-4 rounded-xl text-xs uppercase tracking-widest transition-all duration-300 shadow-[0_4px_20px_rgba(6,182,212,0.25)] font-mono cursor-pointer"
              >
                Send OTP
              </button>
            </form>
          ) : (
            /* Step 2: Input OTP details */
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="p-3 bg-cyan-500/5 border border-cyan-500/10 rounded-xl text-left flex items-center justify-between">
                <div>
                  <span className="text-[9px] uppercase tracking-wider font-mono font-bold text-neutral-400 block p-0">SMS Dispatched</span>
                  <span className="text-[11px] font-mono text-cyan-300 font-bold">{selectedCountryCode} {phoneNumber}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOtpSent(false)}
                  className="text-[10px] text-cyan-400 hover:underline font-mono"
                >
                  Edit Line
                </button>
              </div>

              <div className="space-y-1.5 text-left">
                <div className="relative">
                  <input
                    type="text"
                    required
                    maxLength={6}
                    placeholder="Enter 4-digit code"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, ''))}
                    className="w-full bg-[#050c18] border border-white/10 rounded-xl px-4 py-2.5 text-center text-sm text-white font-mono tracking-[0.4em] focus:border-cyan-400 focus:outline-none transition placeholder:text-neutral-700 font-black pt-3 pb-3"
                  />
                  {otpSentCountdown > 0 ? (
                    <span className="absolute right-3.5 top-3.5 text-[9px] font-mono font-medium text-neutral-500 uppercase">
                      Resend in {otpSentCountdown}s
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setOtpSentCountdown(30);
                        setLoginError('');
                        
                        // Resend SMS toast info
                        setAlerts(prev => [{
                          id: generateUniqueId('otp_sys'),
                          timestamp: new Date().toISOString(),
                          title: 'New Code Dispatched',
                          message: 'Your custom secure authorization code is: 8842',
                          type: 'info',
                          read: false
                        }, ...prev]);
                      }}
                      className="absolute right-3 top-2.5 bg-white/5 hover:bg-white/10 border border-white/10 px-2 py-0.5 rounded text-[9px] font-mono font-semibold text-cyan-300 transition"
                    >
                      Resend
                    </button>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={isVerifyingLogin}
                className="w-full bg-cyan-500 hover:bg-cyan-400 text-neutral-950 font-extrabold py-3.5 px-4 rounded-xl text-xs uppercase tracking-widest transition-all duration-300 shadow-[0_4px_24px_rgba(6,182,212,0.25)] flex items-center justify-center gap-2 font-mono cursor-pointer"
              >
                {isVerifyingLogin ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Verify & Log in"
                )}
              </button>
            </form>
          )}
 
          {/* Test verification help box matching guideline specs */}
          <div className="p-3 bg-neutral-950 border border-white/5 rounded-2xl text-left space-y-1">
            <div className="flex items-center gap-1 text-cyan-400">
              <Cpu className="w-3 h-3 text-cyan-400" />
              <span className="text-[9px] font-mono font-bold uppercase tracking-wider">Demo / Investor Testing Key</span>
            </div>
            <p className="text-[9.5px] text-neutral-400 leading-normal font-sans">
              Enter any Indian mobile number, check the Terms & Conditions checkbox, and submit. The demo verification passcode is <strong className="text-cyan-300 font-bold">8842</strong>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (appStage === 'onboarding') {
    return (
      <div className="min-h-screen bg-[#050505] dot-grid relative flex flex-col justify-center items-center py-10 px-4 text-neutral-100 selection:bg-cyan-500 selection:text-neutral-950">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] bg-cyan-600/10 rounded-full blur-[140px] pointer-events-none z-0"></div>
        <div className="w-full max-w-md z-10 glass rounded-[36px] overflow-hidden shadow-2xl transition border-white/10 relative">
          <div className="p-1">
            <Onboarding onComplete={handleOnboardingComplete} />
          </div>
          <div className="bg-neutral-950 border-t border-white/5 p-4 text-center">
            <button
              id="skip-onboarding-btn"
              onClick={skipOnboarding}
              className="text-xs text-neutral-500 hover:text-cyan-300 font-mono tracking-wider transition cursor-pointer"
            >
              🚀 Bypass Setup Wizard (Investor Fast-Track)
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Active unread alerts badge length
  const unreadAlertsCount = alerts.filter(a => !a.read).length;

  return (
    <div className={`min-h-screen w-full ${theme === 'light' ? 'light-mode bg-white text-neutral-800' : 'bg-[#020813] bg-gradient-to-b from-[#020a1c] via-[#010610] to-[#010307] text-[#F5F5F5]'} font-sans antialiased relative dot-grid select-none overflow-x-hidden pb-12 animate-fadeIn`}>
      
      {/* Dynamic Aesthetic Atmospheric Backdrop elements */}
      {theme === 'dark' && (
        <>
          <div className="absolute -top-40 -left-4 w-[600px] h-[600px] bg-blue-600/15 rounded-full blur-[140px] pointer-events-none z-0"></div>
          <div className="absolute top-1/2 -right-40 w-[500px] h-[500px] bg-cyan-500/15 rounded-full blur-[140px] pointer-events-none z-0"></div>
          <div className="absolute bottom-10 left-10 w-[350px] h-[350px] bg-[#00f2fe]/5 rounded-full blur-[100px] pointer-events-none z-0"></div>
        </>
      )}
 
       {/* Main Container Core */}
       <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 relative z-10">
         
         {/* Header Block congruent with template specs */}
         <header id="main-header" className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-8 gap-4 pb-6 border-b border-white/5">
           <div>
              <BrandLogo size="lg" withDot={true} fillPercent={100} theme={theme} />
                 {/*
               <div className="flex items-baseline gap-0.5">
                 <span className="text-2xl font-light text-[#a3b3cc] tracking-tight pb-0.5 select-none font-sans">get</span>
                 <span className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white hover:text-cyan-400 transition-colors uppercase-none font-sans select-none">Vāri</span>
               </div>
             </div>
                */}
              <p className="text-[10px] uppercase tracking-[0.2em] text-[#00f2fe]/90 font-mono font-medium mt-2">
               AI-powered hydration intelligence
             </p>
           </div>

          <div className="flex flex-wrap items-center gap-4">
            {/* Premium Single Bulb Theme Toggle on Top */}
            <button
              onClick={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
              aria-label="Toggle Theme Mode"
              id="top-theme-bulb-toggle"
              className="p-2.5 rounded-2xl glass transition duration-200 hover:scale-105 active:scale-95 flex items-center justify-center cursor-pointer shadow-md select-none border border-white/10"
            >
              <Lightbulb 
                className={`w-5 h-5 transition-all duration-300 ${
                  theme === 'light' 
                    ? 'text-amber-500 fill-amber-300 drop-shadow-[0_0_8px_rgba(245,158,11,0.5)] rotate-12 scale-110' 
                    : 'text-neutral-400 hover:text-cyan-300'
                }`} 
              />
            </button>
            {/* System Status Display block layout matching WHOOP / Oura premium hardware connectivity */}
            <div 
              id="hdr-sys-status"
              className="glass px-4 py-2 rounded-2xl flex items-center gap-3 border border-white/10 relative group"
            >
              <div className="flex items-center gap-2 cursor-pointer animate-fadeIn" onClick={() => setActiveTab('sensors')}>
                <div className="flex flex-col items-start">
                  <span className="text-[8px] uppercase tracking-widest text-neutral-400 font-mono">Hardware Link Status</span>
                  <span className="text-xs font-semibold text-neutral-200 flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      deviceConnection === 'connected' ? 'bg-green-400 animate-pulse' :
                      deviceConnection === 'syncing' ? 'bg-yellow-400 animate-spin' : 'bg-red-500'
                    }`}></span>
                    {pairedDeviceInfo ? (
                      <span className="truncate max-w-[120px] font-bold text-white">{pairedDeviceInfo.name}</span>
                    ) : (
                      <span>{deviceConnection === 'connected' ? 'ESP32 Simulator' : deviceConnection === 'syncing' ? 'Syncing...' : 'Disconnected'}</span>
                    )}
                  </span>
                </div>
                
                {pairedDeviceInfo && (
                  <div className="flex items-center gap-2 pl-2 border-l border-white/10 animate-fadeIn">
                    {/* RSSI indicator */}
                    <div className="flex items-center gap-0.5" title={`Signal: ${sensorData.rssi} dBm`}>
                      <span className="text-[9px] text-neutral-400 font-mono font-bold mr-0.5">{sensorData.rssi}dBm</span>
                      <div className="flex items-end gap-[1.5px] h-3">
                        <div className={`w-[2px] h-[3px] rounded-full ${sensorData.rssi >= -90 ? 'bg-cyan-400 animate-pulse' : 'bg-neutral-600'}`}></div>
                        <div className={`w-[2px] h-[5px] rounded-full ${sensorData.rssi >= -75 ? 'bg-cyan-400 animate-pulse' : 'bg-neutral-600'}`}></div>
                        <div className={`w-[2px] h-[8px] rounded-full ${sensorData.rssi >= -60 ? 'bg-cyan-400 animate-pulse' : 'bg-neutral-600'}`}></div>
                        <div className={`w-[2px] h-[11px] rounded-full ${sensorData.rssi >= -45 ? 'bg-cyan-400 animate-pulse' : 'bg-neutral-600'}`}></div>
                      </div>
                    </div>
                    
                    {/* Battery indicator */}
                    <div className="flex items-center gap-1" title={`Battery: ${sensorData.batteryLevel}%`}>
                      <Battery className={`w-4 h-4 ${
                        sensorData.batteryLevel > 50 ? 'text-emerald-400' :
                        sensorData.batteryLevel > 20 ? 'text-amber-400' : 'text-red-500 animate-pulse'
                      }`} />
                      <span className="text-[10px] text-neutral-300 font-mono font-bold">{sensorData.batteryLevel}%</span>
                    </div>
                  </div>
                )}
              </div>

              {pairedDeviceInfo && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    disconnectHardware();
                  }}
                  className="hidden group-hover:block ml-2 text-[10px] bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white px-2 py-0.5 rounded-lg border border-red-500/20 hover:border-red-500 transition cursor-pointer select-none font-mono"
                >
                  Unlink
                </button>
              )}
            </div>

            {/* Smart Alerts Toggle Button */}
            <button
              id="alert-center-toggle"
              onClick={() => setShowAlertModal(true)}
              className="relative w-11 h-11 rounded-2xl glass flex items-center justify-center border-white/10 hover:bg-white/5 hover:scale-105 active:scale-95 transition cursor-pointer"
            >
              <Bell className="w-5 h-5 text-neutral-300" />
              {unreadAlertsCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-cyan-400 text-neutral-950 text-[10px] font-extrabold px-1.5 py-0.5 rounded-full animate-bounce">
                  {unreadAlertsCount}
                </span>
              )}
            </button>

            {/* Quick action profile toggle tab indicator */}
            <div
              id="profile-avatar-clickable"
              onClick={() => setActiveTab('settings')}
              className="w-11 h-11 rounded-2xl glass flex items-center justify-center border-white/10 hover:bg-white/5 hover:scale-105 transition cursor-pointer"
            >
              <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-cyan-400 to-teal-500 flex items-center justify-center text-neutral-950 font-bold text-xs uppercase shadow-inner">
                {profile.gender.substring(0, 1) || 'U'}
              </div>
            </div>
          </div>
        </header>

        {/* Global Urgent Hydration Notification Banner */}
        {solvedRisk.score >= 76 && (
          <div id="urgent-hydration-alert-banner" className="bg-red-500/10 border border-red-500/30 p-4 rounded-3xl flex items-center justify-between mb-8 animate-pulse text-red-200 text-sm">
            <div className="flex items-center gap-3">
              <ShieldAlert className="w-6 h-6 text-red-500 shrink-0 animate-bounce" />
              <div>
                <span className="font-extrabold uppercase text-[10px] font-mono block tracking-wide text-red-400">CRITICAL DEHYDRATION RISK ({solvedRisk.score} / 100)</span>
                <span className="font-medium text-xs text-neutral-200 block">
                  {solvedRisk.meaning}
                </span>
                <span className="text-xs font-bold font-mono text-cyan-400 block mt-1">
                  Required: {solvedRisk.glassesRequired} glasses of 250ml each ({solvedRisk.glassesRequired ? solvedRisk.glassesRequired * 250 : 1000}ml total metabolic replenishment).
                </span>
              </div>
            </div>
            <button
              id="banner-drink-btn"
              onClick={() => setFluidToLog(500)}
              className="bg-red-500 hover:bg-red-600 active:bg-red-700 text-white font-extrabold text-xs px-4 py-2 rounded-xl transition shadow-lg cursor-pointer cursor-allowed whitespace-nowrap"
            >
              Log +500ml
            </button>
          </div>
        )}

        {/* Outer App Grid: Main Interface and Core Tester (always visible on screen) */}
        <div id="central-appgrid" className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start mb-10">
          
          {/* LEFT 8-COLUMNS COMPARTMENT (Active Navigation Tabs inside Frosted Glass) */}
          <section className="lg:col-span-8 space-y-8">
            
            {/* TAB VIEW 1: MASTER DASHBOARD */}
            {activeTab === 'dashboard' && (
              <div id="tabview-dashboard" className="space-y-6">
                
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
                  
                  {/* Circular Radial Hydration Score Widget congruent with design HTML */}
                  <div className="md:col-span-5 flex flex-col justify-center items-center glass rounded-[36px] p-6 relative overflow-hidden text-center min-h-[380px]">
                    <div className="absolute top-5 left-6 flex flex-col text-left">
                      <span className={`text-[9px] uppercase tracking-widest ${theme === 'light' ? 'text-[#0284c7]' : 'text-[#00f2fe]'} font-mono font-bold`}>Hydration Risk Score</span>
                      <span id="risk-status-label" className={`text-xl font-bold ${theme === 'light' ? 'text-[#020813]' : 'text-neutral-100'} flex items-center gap-1.5 mt-0.5`}>
                        <span className={`w-2.5 h-2.5 rounded-full ${
                          solvedRisk.score <= 25 ? 'bg-emerald-500' :
                          solvedRisk.score <= 50 ? 'bg-yellow-500' :
                          solvedRisk.score <= 75 ? 'bg-orange-500' : 'bg-red-500 animate-ping'
                        }`}></span>
                        {solvedRisk.status}
                      </span>
                    </div>

                    {stomachVolume > 0 && (
                      <div className="absolute top-5 right-6 flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 p-1 px-2.5 rounded-full animate-pulse shadow-md">
                        <Droplets className="w-3.5 h-3.5 text-emerald-400 animate-bounce" />
                        <span className="text-[8px] font-mono font-bold tracking-wider text-emerald-400 uppercase">
                          Hydration Improving
                        </span>
                      </div>
                    )}

                    <div className="relative flex items-center justify-center w-48 h-48 mt-8">
                      {/* Concentric rotating cellular hydration absorption animation */}
                      {stomachVolume > 0 && (
                        <div className="absolute inset-3 rounded-full border border-dashed border-[#00f2fe]/40 animate-spin" style={{ animationDuration: '10s' }} />
                      )}
                      
                      {/* SVG Ring Progress indicator */}
                      <svg className="w-full h-full transform -rotate-90">
                        {/* Background ring track */}
                        <circle 
                          cx="50%" 
                          cy="50%" 
                          r="76" 
                          stroke="rgba(255,255,255,0.03)" 
                          strokeWidth="11" 
                          fill="none" 
                        />
                        {/* Interactive foreground progress stroke dynamically linked to smooth score */}
                        <circle 
                          cx="50%" 
                          cy="50%" 
                          r="76" 
                          stroke={displayedScore <= 25 ? '#10b981' : displayedScore <= 50 ? '#eab308' : displayedScore <= 75 ? '#f97316' : '#dc2626'} 
                          strokeWidth="11" 
                          fill="none" 
                          strokeDasharray="477" 
                          // mapping 0-100 score value into the 477 circumference SVG length
                          strokeDashoffset={477 - (477 * displayedScore / 100)} 
                          strokeLinecap="round" 
                          className="transition-all duration-300 ease-out"
                        />
                      </svg>
                      
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        {stomachVolume > 0 && (
                          <span className={`absolute top-10 text-[8px] uppercase tracking-widest ${theme === 'light' ? 'text-[#0284c7]' : 'text-[#00f2fe]'} font-mono font-bold animate-pulse`}>
                            Absorbing ...
                          </span>
                        )}
                        <span id="hydration-radial-score" className={`text-5xl font-extrabold tracking-tighter ${theme === 'light' ? 'text-[#020813]' : 'text-white'}`}>
                          {Math.round(displayedScore)}
                        </span>
                        <span className={`text-[9px] uppercase tracking-widest ${theme === 'light' ? 'text-[#1c3b70]' : 'text-gray-400'} font-semibold font-mono`}>
                          Dehydration Risk
                        </span>
                      </div>
                    </div>

                    <div className={`mt-4 p-3.5 rounded-2xl border ${theme === 'light' ? 'bg-[#f0f9ff] border-sky-100' : 'bg-neutral-900/60 border-white/5'} text-left w-full space-y-2`}>
                      <p className={`text-[11px] ${theme === 'light' ? 'text-[#0f172a]' : 'text-neutral-300'} leading-snug`}>
                        {solvedRisk.meaning}
                      </p>
                      <div className={`border-t ${theme === 'light' ? 'border-sky-100/60' : 'border-white/5'} pt-1.5 flex flex-col`}>
                        <span className={`text-[8px] uppercase font-mono tracking-wider ${theme === 'light' ? 'text-[#0284c7] font-bold' : 'text-neutral-500'}`}>Suggested Action:</span>
                        <p className={`text-xs font-semibold ${theme === 'light' ? 'text-[#0f172a]' : 'text-neutral-100'} mt-0.5`}>
                          {solvedRisk.suggestedAction}
                        </p>
                      </div>
                      {solvedRisk.glassesRequired && (
                        <div id="dashboard-glasses-requirement" className={`p-2 rounded-xl flex items-center justify-between gap-1.5 mt-1 animate-fadeIn ${theme === 'light' ? 'bg-[#e0f2fe] border border-sky-200' : 'bg-cyan-950/20 border border-cyan-500/10'}`}>
                          <div className="flex items-center gap-2">
                            <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-cyan-400 text-neutral-950 font-extrabold text-xs">
                              {solvedRisk.glassesRequired}
                            </span>
                            <div>
                              <span className={`text-[9px] font-extrabold ${theme === 'light' ? 'text-[#0369a1]' : 'text-cyan-300'} uppercase block leading-none font-mono`}>Water Requirement</span>
                              <span className={`text-[9px] ${theme === 'light' ? 'text-sky-800' : 'text-neutral-400'} block mt-0.5`}>glasses of 250ml each</span>
                            </div>
                          </div>
                          <span className={`text-[10px] font-mono ${theme === 'light' ? 'text-[#0369a1]' : 'text-cyan-400'} font-bold whitespace-nowrap`}>
                            +{solvedRisk.glassesRequired * 250} ml
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 w-full">
                      {/* Consumed Today Card */}
                      <div className="glass rounded-xl p-2.5 border-white/5 text-left flex flex-col justify-between min-h-[68px]">
                        <span className="block text-[8px] uppercase tracking-wider text-gray-400 font-mono leading-none">Consumed</span>
                        <span className={`text-xs font-bold block leading-tight mt-1.5 ${theme === 'light' ? 'text-[#020813]' : 'text-white'} font-mono`}>
                          {totalWaterConsumed} ml
                        </span>
                        <span className="text-[8px] text-gray-500 block leading-none mt-1">({targetPercent}%)</span>
                      </div>
                      
                      {/* Daily Target Card */}
                      <div className="glass rounded-xl p-2.5 border-white/5 text-left flex flex-col justify-between min-h-[68px]">
                        <span className="block text-[8px] uppercase tracking-wider text-gray-400 font-mono leading-none">Daily Target</span>
                        <span className={`text-xs font-bold block leading-tight mt-1.5 ${theme === 'light' ? 'text-[#020813]' : 'text-white'} font-mono`}>
                          {profile.targetDailyMl} ml
                        </span>
                        <span className="text-[8px] text-gray-500 block leading-none mt-1">Goal baseline</span>
                      </div>

                      {/* Remaining Deficit Card */}
                      <div className="glass rounded-xl p-2.5 border-white/5 text-left flex flex-col justify-between min-h-[68px]">
                        <span className="block text-[8px] uppercase tracking-wider text-gray-400 font-mono leading-none">Remaining</span>
                        <span className={`text-xs font-bold block leading-tight mt-1.5 font-mono ${
                          profile.targetDailyMl - totalWaterConsumed <= 0 
                            ? 'text-emerald-500 font-bold' 
                            : theme === 'light' ? 'text-[#020813]' : 'text-white'
                        }`}>
                          {Math.max(0, profile.targetDailyMl - totalWaterConsumed)} ml
                        </span>
                        <span className="text-[8px] text-gray-500 block leading-none mt-1 truncate">
                          {profile.targetDailyMl - totalWaterConsumed <= 0 ? 'Goal Met! 🎉' : 'Deficit Left'}
                        </span>
                      </div>

                      {/* Last Intake Card */}
                      <div className="glass rounded-xl p-2.5 border-white/5 text-left flex flex-col justify-between min-h-[68px]">
                        <span className="block text-[8px] uppercase tracking-wider text-gray-400 font-mono leading-none">Last Intake</span>
                        <span className={`text-xs font-bold block leading-tight mt-1.5 ${theme === 'light' ? 'text-[#020813]' : 'text-white'} truncate`}>
                          {hoursSinceDrink < 0.1 ? 'Just now' : `${Math.floor(hoursSinceDrink * 60)}m ago`}
                        </span>
                        <span className="text-[8px] text-gray-500 block leading-none mt-1 truncate">
                          {lastLog ? `${lastLog.amountMl}ml logged` : 'No sync'}
                        </span>
                      </div>
                    </div>

                    {/* Intermediate Loads Analytics / Debugger Panel */}
                    <div className={`mt-4 p-3.5 rounded-2xl border w-full space-y-2 text-left ${theme === 'light' ? 'bg-slate-50 border-slate-100' : 'bg-neutral-900/40 border-white/5'}`}>
                      <span className={`text-[9px] uppercase tracking-wider ${theme === 'light' ? 'text-slate-500 font-bold' : 'text-neutral-400'} font-mono block`}>
                        Intermediate Risk Load Breakdown
                      </span>
                      <div className="grid grid-cols-5 gap-1.5">
                        {[
                          { label: 'Heart', val: solvedRisk.heartLoad },
                          { label: 'Activity', val: solvedRisk.activityLoad },
                          { label: 'Temp', val: solvedRisk.temperatureLoad },
                          { label: 'Humidity', val: solvedRisk.humidityLoad },
                          { label: 'Time', val: solvedRisk.timeLoad }
                        ].map((load) => {
                          const loadColor = 
                            load.val <= 25 ? 'bg-emerald-500' :
                            load.val <= 50 ? 'bg-yellow-500' :
                            load.val <= 75 ? 'bg-orange-500' : 'bg-red-500';
                          return (
                            <div key={load.label} className={`p-1.5 rounded-xl border flex flex-col justify-between text-center min-h-[62px] ${theme === 'light' ? 'bg-white border-slate-100' : 'bg-neutral-900/60 border-white/5'}`}>
                              <span className="block text-[8px] font-sans font-medium text-neutral-400 truncate">{load.label}</span>
                              <span className={`text-xs font-bold font-mono my-0.5 ${theme === 'light' ? 'text-[#020813]' : 'text-white'}`}>{load.val}</span>
                              <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                                <div className={`h-full ${loadColor}`} style={{ width: `${load.val}%` }}></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Physiological telemetry indicators */}
                  <div className="md:col-span-7 flex flex-col justify-between gap-4">
                    
                    {/* Top 3 Metric Cards inside sub-grid */}
                    <div className="grid grid-cols-3 gap-4">
                      {/* Heart Rate Metric */}
                      <div className="glass rounded-3xl p-5 flex flex-col justify-between min-h-[120px] hover:border-white/15 transition select-none">
                        <div className={`text-[10px] uppercase tracking-wider font-mono flex items-center gap-1 ${theme === 'light' ? 'text-slate-600' : 'text-gray-400'}`}>
                          <Heart className="w-3.5 h-3.5 text-red-500 shrink-0" /> HR BPM
                        </div>
                        <div className="flex items-end gap-1 my-2">
                          <span id="live-metric-hr" className={`text-3xl font-bold tracking-tight ${theme === 'light' ? 'text-[#020813]' : 'text-white'} font-mono`}>
                            {deviceConnection === 'disconnected' ? '--' : sensorData.heartRate}
                          </span>
                          <span className="text-red-500 text-[10px] mb-1 font-mono">BPM</span>
                        </div>
                        <span className={`text-[9px] ${theme === 'light' ? 'text-slate-500' : 'text-gray-500'} font-sans tracking-tight`}>
                          {sensorData.heartRate > 100 ? 'Cardio Load high' : 'Baseline stable'}
                        </span>
                      </div>

                      {/* Wearable Activity Load */}
                      <div className="glass rounded-3xl p-5 flex flex-col justify-between min-h-[120px] hover:border-white/15 transition select-none">
                        <div className={`text-[10px] uppercase tracking-wider font-mono flex items-center gap-1 ${theme === 'light' ? 'text-slate-600' : 'text-gray-400'}`}>
                          <Activity className="w-3.5 h-3.5 text-violet-500 shrink-0" /> Strain
                        </div>
                        <div className="flex items-end gap-1 my-2">
                          <span id="live-metric-activity" className={`text-3xl font-bold tracking-tight ${theme === 'light' ? 'text-[#020813]' : 'text-white'} font-mono`}>
                            {deviceConnection === 'disconnected' ? '--' : sensorData.activityLoad}
                          </span>
                          <span className="text-violet-500 text-[10px] mb-1 font-mono">/100</span>
                        </div>
                        <span className={`text-[9px] ${theme === 'light' ? 'text-slate-500' : 'text-gray-500'} font-sans tracking-tight`}>Active kinetic force</span>
                      </div>

                      {/* Ambient Temp */}
                      <div className="glass rounded-3xl p-5 flex flex-col justify-between min-h-[120px] hover:border-white/15 transition select-none">
                        <div className={`text-[10px] uppercase tracking-wider font-mono flex items-center gap-1 ${theme === 'light' ? 'text-slate-600' : 'text-gray-400'}`}>
                          <Thermometer className="w-3.5 h-3.5 text-orange-500 shrink-0" /> Body Temp
                        </div>
                        <div className="flex items-end gap-1 my-2">
                          <span id="live-metric-temp" className={`text-3xl font-bold tracking-tight ${theme === 'light' ? 'text-[#020813]' : 'text-white'} font-mono`}>
                            {deviceConnection === 'disconnected' ? '--' : sensorData.temperature.toFixed(1)}
                          </span>
                          <span className="text-orange-500 text-[10px] mb-1 font-mono">°C</span>
                        </div>
                        <span className="text-[9px] text-emerald-600 font-sans font-medium">Safe Recovery state</span>
                      </div>
                    </div>

                    {/* City Weather & Ambient Climate Info Area (Replacing GSR with Ambient Humidity and Mumbai city weather above it) */}
                    <div className={`rounded-[28px] p-5 space-y-3.5 border ${theme === 'light' ? 'bg-[#f8fafc] border-slate-100' : 'glass border-white/5'}`}>
                      {/* City temperature and humidity header */}
                      <div className={`flex items-center justify-between border-b ${theme === 'light' ? 'border-slate-100' : 'border-white/5'} pb-2`}>
                        <div className="flex items-center gap-2">
                          <MapPin className={`w-4 h-4 ${theme === 'light' ? 'text-sky-600' : 'text-cyan-400'}`} />
                          <span className={`text-xs font-bold ${theme === 'light' ? 'text-[#020813]' : 'text-neutral-100'} font-sans`}>Mumbai</span>
                        </div>
                        <span className={`text-xs font-mono font-extrabold ${theme === 'light' ? 'text-sky-600' : 'text-cyan-300'}`}>
                          {sensorData.temperature.toFixed(1)}°C, {sensorData.humidity}% H
                        </span>
                      </div>

                      {/* Ambient Humidity Block */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                        <div className="flex items-center gap-3">
                          <div className={`p-2.5 rounded-xl border ${theme === 'light' ? 'bg-sky-50 border-sky-100 text-sky-600' : 'bg-blue-500/10 border border-blue-500/20 text-blue-400'}`}>
                            <Droplets className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className={`text-[10px] uppercase ${theme === 'light' ? 'text-slate-600' : 'text-gray-400'} font-mono font-bold block tracking-wide`}>Ambient Humidity</span>
                              <div className="group relative flex items-center">
                                <Info className={`w-3.5 h-3.5 ${theme === 'light' ? 'text-sky-600 hover:text-sky-700' : 'text-neutral-500 hover:text-cyan-400'} transition-colors cursor-help`} />
                                <span className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-2 rounded-lg shadow-xl text-[9px] leading-relaxed font-sans normal-case font-normal hidden group-hover:block z-50 ${theme === 'light' ? 'bg-white border border-slate-200 text-neutral-800' : 'bg-neutral-900 border border-neutral-800 text-neutral-300'}`}>
                                  Ambient humidity measures surrounding water moisture, determining the sweat evaporation potential.
                                </span>
                              </div>
                            </div>
                            <span className={`text-xl font-bold ${theme === 'light' ? 'text-[#020813]' : 'text-white'} font-mono mt-0.5 block`}>{sensorData.humidity}% rH</span>
                          </div>
                        </div>

                        {/* Simple 1 line explanation directly on screen */}
                        <span className={`text-[10px] ${theme === 'light' ? 'text-slate-600' : 'text-neutral-400'} font-medium leading-normal italic text-right sm:max-w-[200px]`}>
                          Surrounding water vapor directly affects your sweat evaporation potential and hydration loss.
                        </span>
                      </div>
                    </div>

                    {/* Quick Manual Water Log deck */}
                    <div className="glass rounded-2xl p-5 border-white/5 bg-gradient-to-r from-cyan-950/10 to-teal-950/20">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-xs font-mono font-bold tracking-wider uppercase text-neutral-300">Quick Fluid Log Station</h4>
                        <span className="text-[10px] text-cyan-400 font-mono bg-cyan-500/10 px-2 py-0.5 rounded-full">Hydration calibration</span>
                      </div>
                      
                      {!showCustomAmountInput ? (
                        <div className="grid grid-cols-3 gap-2">
                          <button
                            id="quick-add-200ml"
                            onClick={() => setFluidToLog(200)}
                            className="bg-white/5 hover:bg-cyan-500/10 active:bg-cyan-500/20 border border-white/5 text-xs font-bold py-2.5 px-1 rounded-xl text-neutral-200 transition text-center flex flex-col items-center justify-center gap-1 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5 text-cyan-400" />
                            <span>+200ml Glass</span>
                          </button>
                          
                          <button
                            id="quick-add-500ml"
                            onClick={() => setFluidToLog(500)}
                            className="bg-white/5 hover:bg-cyan-500/10 active:bg-cyan-500/20 border border-white/5 text-xs font-bold py-2.5 px-1 rounded-xl text-neutral-200 transition text-center flex flex-col items-center justify-center gap-1 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5 text-cyan-400" />
                            <span>+500ml Bottle</span>
                          </button>

                          <button
                            id="quick-add-custom"
                            onClick={() => setShowCustomAmountInput(true)}
                            className="bg-white/5 hover:bg-cyan-500/10 active:bg-cyan-500/20 border border-white/5 text-xs font-bold py-2.5 px-1 rounded-xl text-cyan-400 transition text-center flex flex-col items-center justify-center gap-1 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5 text-cyan-400" />
                            <span>Custom Amount</span>
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2 items-center bg-white/3 border border-white/5 p-2 rounded-xl animate-fadeIn">
                          <input 
                            type="number"
                            placeholder="Amount in ml"
                            value={customAmount}
                            onChange={(e) => setCustomAmount(e.target.value)}
                            className="bg-neutral-950 border border-white/10 rounded-lg px-3 py-2 text-xs text-white font-mono w-full focus:outline-none focus:border-cyan-400"
                            autoFocus
                          />
                          <button 
                            onClick={() => {
                              const val = parseInt(customAmount);
                              if (val > 0) {
                                setFluidToLog(val);
                                setCustomAmount('');
                                setShowCustomAmountInput(false);
                              }
                            }}
                            className="bg-cyan-500 hover:bg-cyan-400 text-neutral-950 font-bold px-4 py-2 rounded-lg text-xs transition cursor-pointer font-mono"
                          >
                            Log
                          </button>
                          <button 
                            onClick={() => {
                              setCustomAmount('');
                              setShowCustomAmountInput(false);
                            }}
                            className="bg-white/5 hover:bg-white/10 text-neutral-300 font-bold px-3 py-2 rounded-lg text-xs transition cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>

                  </div>

                </div>

                {/* AI Health Insights Block from backend */}
                <div id="ai-wellness-insights-deck" className="glass rounded-[32px] p-6 flex flex-col relative overflow-hidden">
                  <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-cyan-400" />
                      <h3 className="text-xs uppercase tracking-[0.2em] font-bold text-white/80">GetVari Core AI Insights</h3>
                    </div>
                    <div className="flex items-center gap-2">
                      {loadingInsights && <span className="text-[10px] text-yellow-500 animate-pulse font-mono uppercase">Re-synthesizing AI...</span>}
                      <button
                        id="refresh-ai-insights-btn"
                        onClick={fetchNewAIInsights}
                        disabled={loadingInsights}
                        className="p-1 px-3 border border-white/10 hover:bg-neutral-800 rounded-xl text-[10px] font-bold text-neutral-400 flex items-center gap-1 transition cursor-pointer"
                      >
                        <RefreshCw className={`w-3 h-3 text-cyan-400 ${loadingInsights ? 'animate-spin' : ''}`} /> Refresh Core
                      </button>
                    </div>
                  </div>

                  {insightsFallbackReason && (
                    <div className="mb-4 bg-amber-500/10 border border-amber-500/20 p-3.5 rounded-2xl text-left space-y-1 animate-fadeIn">
                      <div className="flex items-center gap-2 text-amber-400">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span className="text-xs font-bold font-mono uppercase tracking-wider">
                          {insightsFallbackReason === 'quota_exceeded' 
                            ? 'Gemini Rate Limited (429)' 
                            : 'Local Biosphere Engine Active'}
                        </span>
                      </div>
                      <p className="text-[10.5px] text-neutral-300 leading-normal font-sans">
                        {insightsFallbackReason === 'quota_exceeded' ? (
                          <>
                            The live Gemini API has reached its developer rate limits (20 requests/day free tier quota exceeded). To keep your real-time physiological protection loop fully synced, <strong>GetVari Core</strong> has gracefully loaded local medical rules.
                          </>
                        ) : (
                          <>
                            Running on offline rule-based telemetry metrics. Connect Gemini API keys in settings to activate predictive synthesis prompts.
                          </>
                        )}
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {insights.map((insight) => (
                      <div 
                        key={insight.id} 
                        className="bg-neutral-900/40 p-4 rounded-2xl border border-white/5 flex gap-3.5 items-start"
                      >
                        <div className={`p-2 rounded-xl mt-0.5 ${
                          insight.category === 'hydration' ? 'bg-blue-500/10 text-blue-400' :
                          insight.category === 'activity' ? 'bg-violet-500/10 text-violet-400' :
                          insight.category === 'temperature' ? 'bg-amber-500/10 text-amber-400 animate-pulse' :
                          'bg-emerald-500/10 text-emerald-400'
                        }`}>
                          {insight.category === 'hydration' && <Droplets className="w-4 h-4" />}
                          {insight.category === 'activity' && <Activity className="w-4 h-4" />}
                          {insight.category === 'temperature' && <Thermometer className="w-4 h-4" />}
                          {insight.category === 'recovery' && <Heart className="w-4 h-4" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs font-bold text-white leading-snug">{insight.title}</h4>
                            <span className="text-[8px] font-mono text-cyan-400 uppercase tracking-widest bg-cyan-950/60 px-1.5 py-0.2 rounded border border-cyan-800/20">
                              {insight.source === 'gemini_brain' ? 'Gemini 3.5' : 'Adaptive rule'}
                            </span>
                          </div>
                          <p className="text-[11px] text-neutral-400 leading-snug mt-1 font-sans italic">
                            "{insight.text}"
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <div className="mt-3 flex items-center justify-end text-[9.5px] font-mono text-neutral-500 gap-1 select-none">
                    <span className="text-cyan-500">*</span> Generated using sensor fusion analysis
                  </div>
                </div>

                {/* Drink Log Feed Widget */}
                <div className="glass rounded-[28px] p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-cyan-400" />
                      <h4 className="text-xs font-mono font-bold tracking-wider uppercase text-neutral-300">Fluid Logging Feed</h4>
                    </div>
                  </div>
                  {waterLogs.length === 0 ? (
                    <div className="text-center py-6 text-neutral-500 text-xs font-mono">
                      No water synced today. Slide simulator values to proceed.
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-[160px] overflow-y-auto pr-1">
                      {waterLogs.map((log) => (
                        <div key={log.id} className="bg-neutral-900/50 p-3 rounded-xl border border-white/5 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="p-1 px-2.5 rounded bg-cyan-500/10 text-cyan-300 text-xs font-semibold font-mono">
                              +{log.amountMl}ml
                            </div>
                            <div>
                              <span className="text-xs block font-bold text-white">Water Intake Synced</span>
                              <span className="text-[9px] text-neutral-400 block -mt-0.5">
                                Source: {log.source === 'manual' ? 'Manual Sync' : log.source === 'smart_cap' ? 'GetVari Proprietary SmartCap®' : 'Health Integrator'}
                              </span>
                            </div>
                          </div>
                          <span className="text-[10px] text-neutral-500 font-mono">
                            {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Collapsible Telemetry & Recovery Engine Debugger Panel */}
                {debugMode && (() => {
                  const tempDiff = Math.max(0, sensorData.temperature - 22);
                  const humidDiff = Math.max(0, sensorData.humidity - 44);
                  const heatScore = Math.min(100, Math.max(0, (tempDiff * 4.5) + (humidDiff * 0.4)));
                  const activityFactor = Math.min(0.4, (sensorData.activityLoad / 100) * 0.4);
                  const heatFactor = Math.min(0.3, (heatScore / 100) * 0.3);
                  const absorptionMultiplier = Math.max(0.3, 1 - activityFactor - heatFactor);
                  const calculatedGastricEmptyingSpeed = 12 * absorptionMultiplier; // ml/min
                  const calculatedSweatLossRate = 1.4 + (sensorData.activityLoad / 100) * 8.6 + (heatScore / 100) * 5.0; // ml/min
                  return (
                    <div className="glass rounded-[32px] p-6 space-y-4 border border-cyan-500/10 mt-6 bg-cyan-950/5">
                      <div className="flex justify-between items-center pb-2 border-b border-white/5">
                        <div className="flex items-center gap-2">
                          <Cpu className="w-5 h-5 text-cyan-400 animate-pulse" />
                          <h3 className="text-xs uppercase tracking-[0.2em] font-bold text-white/80">Recovery Engine Telemetry Debugger</h3>
                        </div>
                        <button 
                          onClick={() => setDebugMode(false)}
                          className="text-[10px] font-mono text-neutral-400 hover:text-cyan-400 transition cursor-pointer"
                        >
                          [Collapse]
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                        {/* Water Awaiting Absorption */}
                        <div className="bg-neutral-900/40 p-4 rounded-2xl border border-white/5 space-y-2 relative group">
                          <span className="block text-[8.5px] uppercase tracking-wider text-neutral-400 font-mono">
                            Water Awaiting Absorption
                            <Info className="inline-block w-3 h-3 text-neutral-500 hover:text-cyan-400 ml-1 cursor-help" />
                          </span>
                          {/* Hover Tooltip */}
                          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 rounded-lg bg-neutral-950 border border-neutral-800 text-[9px] leading-relaxed text-neutral-300 hidden group-hover:block z-50 shadow-xl font-sans font-normal normal-case">
                            Swallowed water currently in your stomach waiting to empty into your bloodstream and body cells. Heavy physical exertion slows this down.
                          </span>
                          <div className="flex items-baseline gap-1 mt-1">
                            <span className="text-xl font-bold text-white font-mono">{stomachVolume}</span>
                            <span className="text-[10px] text-neutral-500 font-mono">ml / 1200ml</span>
                          </div>
                          <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                            <div className="h-full bg-cyan-500 transition-all duration-500" style={{ width: `${(stomachVolume / 1200) * 100}%` }}></div>
                          </div>
                          <span className="text-[9.5px] text-cyan-450 font-sans block leading-tight mt-0.5">Water swallowed but not yet fully absorbed by the body.</span>
                        </div>

                        {/* Estimated Absorbed Hydration */}
                        <div className="bg-neutral-900/40 p-4 rounded-2xl border border-white/5 space-y-2 relative group">
                          <span className="block text-[8.5px] uppercase tracking-wider text-neutral-400 font-mono">
                            Estimated Absorbed Hydration
                            <Info className="inline-block w-3 h-3 text-neutral-500 hover:text-cyan-400 ml-1 cursor-help" />
                          </span>
                          {/* Hover Tooltip */}
                          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 rounded-lg bg-neutral-950 border border-neutral-800 text-[9px] leading-relaxed text-neutral-300 hidden group-hover:block z-50 shadow-xl font-sans font-normal normal-case">
                            Water that has successfully entered your bloodstream and body cells to restore blood volume, optimize stroke rate, and keep organs cooling.
                          </span>
                          <div className="flex items-baseline gap-1 mt-1">
                            <span className="text-xl font-bold text-white font-mono">{activeAbsorbedHydration}</span>
                            <span className="text-[10px] text-neutral-500 font-mono">ml / 1000ml</span>
                          </div>
                          <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${(activeAbsorbedHydration / 1000) * 100}%` }}></div>
                          </div>
                          <span className="text-[9.5px] text-emerald-450 font-sans block leading-tight mt-0.5">Hydration Recovery Progress</span>
                        </div>

                        {/* Rehydration Rate */}
                        <div className="bg-neutral-900/40 p-4 rounded-2xl border border-white/5 space-y-2 relative group">
                          <span className="block text-[8.5px] uppercase tracking-wider text-neutral-400 font-mono">
                            Absorption Speed
                            <Info className="inline-block w-3 h-3 text-neutral-500 hover:text-cyan-400 ml-1 cursor-help" />
                          </span>
                          {/* Hover Tooltip */}
                          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 rounded-lg bg-neutral-950 border border-neutral-800 text-[9px] leading-relaxed text-neutral-300 hidden group-hover:block z-50 shadow-xl font-sans font-normal normal-case">
                            The real-time speed at which swallowed water empties from your stomach into your body pool. Decreases under sympathetic exertion stress.
                          </span>
                          <div className="flex items-baseline gap-1 mt-1">
                            <span className="text-xl font-bold text-cyan-400 font-mono">+{calculatedGastricEmptyingSpeed.toFixed(1)}</span>
                            <span className="text-[10px] text-neutral-500 font-mono">ml / min</span>
                          </div>
                          <div className="w-full h-1 bg-cyan-500/10 rounded-full"></div>
                          <span className="text-[9px] text-neutral-450 block italic leading-none">Affected by exertion stress factor</span>
                        </div>

                        {/* Sweat Evaporation Rate */}
                        <div className="bg-neutral-900/40 p-4 rounded-2xl border border-white/5 space-y-2 relative group">
                          <span className="block text-[8.5px] uppercase tracking-wider text-neutral-400 font-mono">
                            Estimated Sweat Loss
                            <Info className="inline-block w-3 h-3 text-neutral-500 hover:text-cyan-400 ml-1 cursor-help" />
                          </span>
                          {/* Hover Tooltip */}
                          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 rounded-lg bg-neutral-950 border border-neutral-800 text-[9px] leading-relaxed text-neutral-300 hidden group-hover:block z-50 shadow-xl font-sans font-normal normal-case">
                            The rate of water leaving your body via perspiration and breathing, calculated dynamically from active strain and ambient thermal stress.
                          </span>
                          <div className="flex items-baseline gap-1 mt-1">
                            <span className="text-xl font-bold text-rose-500 font-mono">-{calculatedSweatLossRate.toFixed(1)}</span>
                            <span className="text-[10px] text-neutral-500 font-mono">ml / min</span>
                          </div>
                          <div className="w-full h-1 bg-rose-500/10 rounded-full"></div>
                          <span className="text-[9px] text-neutral-450 block italic leading-none">Scales with exertion & heat stress</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/5 text-[10.5px]">
                        <div className="flex items-center gap-2">
                          <span className="text-neutral-400 font-mono">Absorption Status:</span>
                          <span className="text-white font-mono font-bold">
                            {stomachVolume > 0 
                              ? `${Math.round((activeAbsorbedHydration / (activeAbsorbedHydration + stomachVolume)) * 100)}% absorbed` 
                              : 'Gut Empty / Idle'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-neutral-400 font-mono">
                          <span>Water Needed To Reach Daily Target:</span>
                          <span className={`font-bold ${profile.targetDailyMl - totalWaterConsumed <= 0 ? 'text-emerald-400' : 'text-cyan-400'}`}>
                            {Math.max(0, profile.targetDailyMl - totalWaterConsumed)} ml
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Floating expand debugger button when collapsed */}
                {!debugMode && (
                  <button 
                    onClick={() => setDebugMode(true)}
                    className="w-full py-2.5 bg-neutral-900/40 hover:bg-neutral-900/60 border border-white/5 text-[10px] font-mono text-cyan-400 font-bold rounded-2xl transition cursor-pointer mt-4"
                  >
                    [Expand Recovery Engine Telemetry Debugger]
                  </button>
                )}

              </div>
            )}

            {/* TAB VIEW 2: HISTORY & ANALYTICS */}
            {activeTab === 'analytics' && (() => {
              // Get selected dataset based on active bio analytics duration filter
              const activeChartData = analyticsDuration === 'daily' 
                ? DAILY_HISTORICAL_DATA 
                : analyticsDuration === 'weekly' 
                  ? INITIAL_HISTORICAL_DATA 
                  : getCustomHistoricalData(customStartDate, customEndDate);

              return (
                <div id="tabview-analytics" className="space-y-6">
                  
                  {/* Visualizing dehydration, recovery and heat index levels globally */}
                  <div className="glass rounded-[32px] p-6 space-y-6 animate-fadeIn">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-4">
                      <div>
                        <h3 className="text-lg font-bold text-white leading-tight">Hydration Bio-Analytics</h3>
                        <p className="text-xs text-neutral-400 mt-1">
                          {analyticsDuration === 'daily' ? 'Hourly hydration index parameters cross-referenced with logged water intake.' : 
                           analyticsDuration === 'weekly' ? 'Weekly hydration baseline trends cross-referenced with total water logged.' :
                           'Custom dynamic tracking range adjusted per chosen calendar constraints.'}
                        </p>
                      </div>

                      {/* Professional duration picker selector */}
                      <div className="flex bg-neutral-950/80 p-1 rounded-xl border border-white/5 self-start md:self-auto shrink-0">
                        <button
                          id="select-duration-daily"
                          onClick={() => setAnalyticsDuration('daily')}
                          className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                            analyticsDuration === 'daily' 
                              ? 'bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-500/20' 
                              : 'text-neutral-400 hover:text-white'
                          }`}
                        >
                          Daily
                        </button>
                        <button
                          id="select-duration-weekly"
                          onClick={() => setAnalyticsDuration('weekly')}
                          className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                            analyticsDuration === 'weekly' 
                              ? 'bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-500/20' 
                              : 'text-neutral-400 hover:text-white'
                          }`}
                        >
                          Weekly
                        </button>
                        <button
                          id="select-duration-custom"
                          onClick={() => setAnalyticsDuration('custom')}
                          className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                            analyticsDuration === 'custom' 
                              ? 'bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-500/20' 
                              : 'text-neutral-400 hover:text-white'
                          }`}
                        >
                          Custom Date
                        </button>
                      </div>
                    </div>

                    {/* Interactive Calendar panel (Visually polished) */}
                    {analyticsDuration === 'custom' && (
                      <div className="bg-neutral-950/50 p-4 rounded-2xl border border-white/5 flex flex-wrap gap-4 items-center animate-slideUp">
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] text-neutral-400 font-mono uppercase tracking-wider">Start Date</span>
                          <input
                            id="custom-start-date-picker"
                            type="date"
                            value={customStartDate}
                            onChange={(e) => setCustomStartDate(e.target.value)}
                            className="bg-neutral-900 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] text-neutral-400 font-mono uppercase tracking-wider">End Date</span>
                          <input
                            id="custom-end-date-picker"
                            type="date"
                            value={customEndDate}
                            onChange={(e) => setCustomEndDate(e.target.value)}
                            className="bg-neutral-900 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                        <div className="text-[10px] font-mono text-[#10b981] bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20 self-start sm:self-end">
                          Metrics Auto-Computed
                        </div>
                      </div>
                    )}

                    {/* CUSTOM ADVANCED SVG CHART (Highly functional, clickable and guarantees Vite + React 19 safety) */}
                    <div className="bg-neutral-900/60 p-5 rounded-2xl border border-white/5">
                      <div className="flex items-center justify-between text-xs mb-6 px-1">
                        <div className="flex gap-4">
                          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-cyan-400 rounded-full"></span> Hydration Index (0-100)</span>
                          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-emerald-500 rounded-full"></span> Water Logged (ml)</span>
                        </div>
                        <span className="text-[10px] text-[#10b981] font-mono uppercase tracking-wider font-semibold">
                          {analyticsDuration === 'daily' ? 'Hourly View' : analyticsDuration === 'weekly' ? 'Weekly View' : 'Custom Calendar View'}
                        </span>
                      </div>

                      <div className="h-48 w-full relative">
                        {/* Grid support lines */}
                        <div className="absolute inset-0 flex flex-col justify-between py-1 pointer-events-none">
                          <hr className="border-white/5" />
                          <hr className="border-white/5" />
                          <hr className="border-white/5" />
                          <hr className="border-white/5" />
                          <hr className="border-white/5" />
                        </div>

                        {/* Bar and Line chart layout inside raw custom SVG */}
                        <svg className="w-full h-full overflow-visible z-10 relative">
                          {/* Define linear gradient glows */}
                          <defs>
                            <linearGradient id="chart-grad-glow" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.4" />
                              <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
                            </linearGradient>
                          </defs>

                          {/* Draw Water Intake bars (Styled in light-friendly green as requested!) */}
                          {activeChartData.map((pt, idx) => {
                            const widthPercent = 100 / activeChartData.length;
                            const barHeight = (pt.waterIntakeMl / 3500) * 100; // max is 3500ml for scaling
                            const xPos = idx * widthPercent + (widthPercent / 2) - 10;
                            return (
                              <g key={`bar-${pt.date}-${idx}`}>
                                {/* Background column selection bar hover */}
                                <rect
                                  x={`${idx * widthPercent}%`}
                                  y="0"
                                  width={`${widthPercent}%`}
                                  height="100%"
                                  fill="transparent"
                                  className="hover:fill-white/2 cursor-pointer transition-colors duration-200"
                                />
                                
                                {/* Logged Intake bar - Vibrantly green formatted! */}
                                <rect
                                  x={`${xPos}%`}
                                  y={`${100 - barHeight}%`}
                                  width="20"
                                  height={`${barHeight}%`}
                                  rx="6"
                                  fill="#10b981"
                                  fillOpacity="0.75"
                                  className="hover:fill-emerald-400 hover:fill-opacity-95 transition cursor-pointer"
                                />
                              </g>
                            );
                          })}

                          {/* Draw Hydration Index Area curve path on TOP of bars so it is beautifully readable */}
                          {(() => {
                            if (activeChartData.length === 0) return null;
                            let pathD = "M ";
                            activeChartData.forEach((pt, idx) => {
                              const widthPercent = 100 / activeChartData.length;
                              const xVal = (idx * widthPercent) + (widthPercent / 2);
                              const yVal = 100 - pt.hydrationIndex; // maps 0-100 directly to heights
                              pathD += `${xVal}% ${yVal} `;
                              if (idx < activeChartData.length - 1) pathD += "L ";
                            });
                            return (
                              <>
                                <path 
                                  d={pathD} 
                                  fill="transparent" 
                                  stroke="#22d3ee" 
                                  strokeWidth="3" 
                                  strokeLinecap="round"
                                />
                                {/* Filled Area beneath curve */}
                                <path 
                                  d={pathD + ` L ${(activeChartData.length - 0.5) * (100 / activeChartData.length)}% 100% L ${0.5 * (100 / activeChartData.length)}% 100% Z`} 
                                  fill="url(#chart-grad-glow)" 
                                />
                              </>
                            );
                          })()}

                          {/* Plot control circles for specific values (Hydration index values on top of bar) */}
                          {activeChartData.map((pt, idx) => {
                            const widthPercent = 100 / activeChartData.length;
                            const xVal = (idx * widthPercent) + (widthPercent / 2);
                            const yVal = 100 - pt.hydrationIndex;
                            return (
                              <g key={`circle-${idx}`}>
                                <circle 
                                  cx={`${xVal}%`} 
                                  cy={`${yVal}`} 
                                  r="4.5" 
                                  fill="#22d3ee"
                                  stroke="#09090b"
                                  strokeWidth="2"
                                />
                                <text 
                                  x={`${xVal}%`} 
                                  y={`${yVal - 14}`} 
                                  textAnchor="middle" 
                                  fill={theme === 'light' ? '#171717' : '#ffffff'} 
                                  fontSize="11" 
                                  fontWeight="bold" 
                                  className="font-mono shadow-sm"
                                >
                                  {pt.hydrationIndex}
                                </text>
                              </g>
                            );
                          })}
                        </svg>
                      </div>

                      {/* X-Axis labels for corresponding intervals */}
                      <div className="flex justify-between mt-4 text-[10px] text-gray-400 font-mono px-4">
                        {activeChartData.map((pt, idx) => (
                          <span key={`label-${pt.date}-${idx}`}>{pt.date}</span>
                        ))}
                      </div>

                    </div>

                    {/* Biological & Physiological explanations explaining core mechanics */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      
                      {/* CARD 1: CARDIOVASCULAR STRESS MATCH */}
                      <div className="bg-neutral-900/40 p-5 rounded-2xl border border-white/5 space-y-4">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold font-mono tracking-wider uppercase text-neutral-300 flex items-center gap-1.5">
                            <TrendingUp className="w-4 h-4 text-[#10b981]" /> Cardiovascular Stress Match
                          </h4>
                          <span className="text-[9px] font-mono bg-emerald-500/10 text-[#10b981] px-2 py-0.5 rounded border border-emerald-500/20">0.83 Correlation</span>
                        </div>
                        <p className="text-[11px] text-neutral-400 leading-relaxed font-sans">
                          This metric checks how closely your fluid intake balances heart rate strain.
                        </p>
                        
                        {/* Stable and Unhealthy ranges */}
                        <div className="grid grid-cols-2 gap-2.5 pt-1">
                          <div className="bg-neutral-950/50 p-2.5 rounded-xl border border-white/5">
                            <div className="text-[9px] font-mono uppercase tracking-wider text-emerald-400 font-bold">Stable Range</div>
                            <div className="text-xs font-extrabold text-white mt-0.5">85% - 100%</div>
                            <div className="text-[9px] text-neutral-500 mt-0.5">Excellent metabolic match</div>
                          </div>
                          <div className="bg-neutral-950/50 p-2.5 rounded-xl border border-white/5">
                            <div className="text-[9px] font-mono uppercase tracking-wider text-red-400 font-bold">Unhealthy Range</div>
                            <div className="text-xs font-extrabold text-white mt-0.5">&lt; 70%</div>
                            <div className="text-[9px] text-neutral-500 mt-0.5">Elevated cardiac workload</div>
                          </div>
                        </div>

                        <div className="space-y-2 pt-1">
                          <div className="flex justify-between text-[10px] text-neutral-500 font-mono">
                            <span>Heart Strain Offset Cap</span>
                            <span>92% Stable</span>
                          </div>
                          <div className="w-full bg-neutral-800 h-1.5 rounded-full overflow-hidden">
                            <div className="bg-emerald-500 h-full w-[92%]"></div>
                          </div>
                        </div>
                      </div>

                      {/* CARD 2: PROJECTED HYDRATION LOSS MATRIX */}
                      <div className="bg-neutral-900/40 p-5 rounded-2xl border border-white/5 space-y-4">
                        <h4 className="text-xs font-bold font-mono tracking-wider uppercase text-neutral-300 flex items-center gap-1.5">
                          <Layers className="w-4 h-4 text-cyan-400" /> Projected Hydration Loss Matrix
                        </h4>
                        <p className="text-[11px] text-neutral-400 leading-relaxed font-sans">
                          When activity or heat surges, the predicted sweat burn accelerates, showing exactly how long your cellular buffer stays safe.
                        </p>
                        
                        <ul className="text-xs text-neutral-400 space-y-2.5 pt-1">
                          <li className="flex justify-between py-1 border-b border-white/5">
                            <span>Inferred sweat rate</span>
                            <span className="font-mono text-white">450 ml / hr</span>
                          </li>
                          <li className="flex justify-between py-1 border-b border-white/5">
                            <span>Resting absorption efficiency</span>
                            <span className="font-mono text-white">82%</span>
                          </li>
                          <li className="flex justify-between items-center py-1">
                            <span className="flex items-center gap-1.5 relative">
                              <span>Suboptimal recovery days</span>
                              <div className="group relative inline-block">
                                <Info className="w-3.5 h-3.5 text-neutral-400 hover:text-white cursor-help" />
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 p-2.5 bg-neutral-950 border border-white/10 rounded-xl shadow-xl text-[10px] text-neutral-300 hidden group-hover:block z-50 normal-case font-normal leading-normal whitespace-normal">
                                  Days where cellular hydration remained below 75% for over 4 continuous hours due to extreme physical workloads or heat strain, despite your logged fluid inputs.
                                </div>
                              </div>
                            </span>
                            <span className="font-mono text-red-400">2 / 7 days</span>
                          </li>
                        </ul>
                      </div>

                    </div>

                  </div>

                </div>
              );
            })()}

            {/* TAB VIEW 3: BLE CONNECTIVITY & SENSORS */}
            {activeTab === 'sensors' && (
              <div id="tabview-sensors" className="space-y-6">
                
                <div className="glass rounded-[32px] p-6 space-y-6">
                  <div>
                    <h3 className="text-lg font-bold text-white leading-tight">BLE Wearable Link Center</h3>
                    <p className="text-xs text-neutral-400">Scan, connect, and stream telemetry over Bluetooth Low Energy protocols from your proprietary GetVari wearable prototype.</p>
                       {/* Wearable Pairing Interface Card */}
                  <div className="bg-gradient-to-br from-neutral-900 via-neutral-900/80 to-neutral-950 p-6 rounded-2xl border border-white/10 relative overflow-hidden animate-fadeIn">
                    <div className="absolute top-0 right-0 p-4">
                      {pairedDeviceInfo ? (
                        <span className="bg-green-500/10 border border-green-500/20 text-green-500 text-[10px] uppercase font-mono px-2.5 py-1 rounded-full flex items-center gap-1.5 font-bold">
                          <Check className="w-3.5 h-3.5" /> {bleMode === 'real' ? 'Real BLE Connected' : 'Simulated BLE Connected'}
                        </span>
                      ) : (
                        <span className="bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] uppercase font-mono px-2.5 py-1 rounded-full flex items-center gap-1.5 font-bold animate-pulse">
                          Unpaired
                        </span>
                      )}
                    </div>

                    <div className="space-y-4">
                      <div>
                        <span className="text-[10px] text-cyan-400 font-mono tracking-widest uppercase block mb-1">Pairing Engine Protocol</span>
                        <h4 className="text-xl font-bold text-white flex items-center gap-2">
                          <Radio className={`w-5 h-5 text-cyan-300 ${isScanningBLE ? 'animate-spin' : ''}`} />
                          GetVari BLE Wearable Link
                        </h4>
                        <p className="text-xs text-neutral-400 leading-relaxed max-w-md mt-1">
                          Select telemetry driver mode below to pair your proprietary GetVari wearable prototype and start streaming high-frequency biometric data.
                        </p>
                      </div>

                      {/* BLE Driver Mode Toggle Selector */}
                      <div className="flex bg-neutral-950/80 p-1 rounded-xl border border-white/5 max-w-[360px] select-none">
                        <button
                          type="button"
                          onClick={() => {
                            if (bleMode !== 'mock') {
                              disconnectHardware();
                              setBleMode('mock');
                            }
                          }}
                          className={`flex-1 text-[10px] font-bold py-2 px-3 rounded-lg font-mono transition-all duration-200 cursor-pointer text-center ${
                            bleMode === 'mock' 
                              ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/25 shadow-md shadow-cyan-950/20' 
                              : 'text-neutral-400 hover:text-neutral-200 border border-transparent'
                          }`}
                        >
                          Investor Demo Mock
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (bleMode !== 'real') {
                              disconnectHardware();
                              setBleMode('real');
                            }
                          }}
                          className={`flex-1 text-[10px] font-bold py-2 px-3 rounded-lg font-mono transition-all duration-200 cursor-pointer text-center ${
                            bleMode === 'real' 
                              ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/25 shadow-md shadow-cyan-950/20' 
                              : 'text-neutral-400 hover:text-neutral-200 border border-transparent'
                          }`}
                        >
                          Real Web Bluetooth
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-3 pt-2">
                        {bleMode === 'real' ? (
                          <button
                            id="ble-scan-btn"
                            onClick={startBLEScanning}
                            disabled={isScanningBLE}
                            className="bg-cyan-500 hover:bg-cyan-400 text-neutral-950 font-extrabold px-6 py-2.5 rounded-xl text-xs flex items-center gap-2 transition cursor-pointer disabled:opacity-50"
                          >
                            {isScanningBLE ? 'Invoking Browser BLE Dialog...' : 'Connect Physical Device'}
                          </button>
                        ) : (
                          <button
                            id="ble-scan-btn"
                            onClick={startBLEScanning}
                            disabled={isScanningBLE}
                            className="bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500 hover:text-neutral-950 font-bold px-6 py-2.5 rounded-xl text-xs flex items-center gap-2 transition border border-cyan-500/20 cursor-pointer disabled:opacity-50"
                          >
                            {isScanningBLE ? 'Scanning radio bands...' : 'Start Simulated Search'}
                          </button>
                        )}
                        
                        {pairedDeviceInfo && (
                          <button
                            id="ble-disconnect-btn"
                            onClick={disconnectHardware}
                            className="bg-red-950/40 text-red-400 border border-red-900/30 hover:bg-red-900/20 px-4 py-2.5 rounded-xl text-xs transition cursor-pointer"
                          >
                            Unlink {pairedDeviceInfo.name}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Live Scanned Devices results */}
                    {bleMode === 'mock' && (isScanningBLE || scannedDevices.length > 0) && (
                      <div className="mt-6 pt-6 border-t border-white/5 space-y-3 animate-fadeIn">
                        <h5 className="text-[10px] text-gray-400 font-mono uppercase tracking-wide">Devices detected near prototype</h5>
                        {isScanningBLE ? (
                          <div className="flex items-center gap-3 py-4 text-xs font-mono text-cyan-400">
                            <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" /> Synchronizing radio signals...
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {scannedDevices.map((dev) => (
                              <div key={dev.id} className="bg-white/3 hover:bg-white/5 p-3.5 rounded-xl border border-white/5 flex items-center justify-between transition">
                                <div>
                                  <span className="text-xs block font-bold text-white">{dev.name}</span>
                                  <span className="text-[9px] text-neutral-400 font-mono block">{dev.id} | RSSI {dev.rssi} dBm</span>
                                </div>
                                <button
                                  onClick={() => connectScannedDevice(dev)}
                                  className="bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500 text-xs px-3 py-1.5 rounded-lg transition font-mono border border-cyan-500/20 hover:text-neutral-950 cursor-pointer"
                                >
                                  Link Peripheral
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                  </div>               </div>

                  {/* Technical API status block for cellular wearable developers */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-neutral-900/40 p-5 rounded-2xl border border-white/5 space-y-3">
                      <h4 className="text-xs font-mono font-bold tracking-wider uppercase text-neutral-300">Apple HealthKit Integration</h4>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-neutral-400">Service API Synced</span>
                        <span className="text-green-400 font-mono font-bold flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Verified</span>
                      </div>
                      <p className="text-[11px] text-neutral-400 leading-relaxed">
                        HealthKit bridges user baseline calorie maps down automatically from workout metrics recorded in real-time.
                      </p>
                    </div>

                    <div className="bg-neutral-900/40 p-5 rounded-2xl border border-white/5 space-y-3">
                      <h4 className="text-xs font-mono font-bold tracking-wider uppercase text-neutral-300">Google Health Connect Interface</h4>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-neutral-400">Local Daemon Client</span>
                        <span className="text-yellow-400 font-mono font-bold">Placeholder Active</span>
                      </div>
                      <p className="text-[11px] text-neutral-400 leading-relaxed">
                        Configured for local Android devices. Streams live sweat calculation projections into Google Workspace.
                      </p>
                    </div>
                  </div>

                </div>

              </div>
            )}

            {/* TAB VIEW 4: SETTINGS / PROFILE ARCHITECTURE */}
            {activeTab === 'settings' && (
              <div id="tabview-settings" className="space-y-6">
                
                <div className="glass rounded-[32px] p-6 space-y-8">
                  <div>
                    <h3 className="text-lg font-bold text-white leading-tight">GetVari Preferences & Calibration</h3>
                    <p className="text-xs text-neutral-400">Calibrate cellular metabolic formulas, physical goal states, or reset your baseline biometric information.</p>
                  </div>

                  {/* Profile Form Block */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pb-6 border-b border-white/5">
                    <div>
                      <label className="text-xs text-neutral-400 font-mono block mb-2">Age Baseline (years)</label>
                      <input 
                        type="number"
                        min="10"
                        max="100"
                        value={profile.age}
                        onChange={(e) => setProfile(prev => ({ ...prev, age: parseInt(e.target.value) || 20 }))}
                        className="bg-neutral-900 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white font-mono w-full focus:outline-none focus:border-cyan-400"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-neutral-400 font-mono block mb-2">Target Body Weight (kg)</label>
                      <input 
                        type="number"
                        min="30"
                        max="200"
                        value={profile.weightKg}
                        onChange={(e) => setProfile(prev => ({ ...prev, weightKg: parseInt(e.target.value) || 70 }))}
                        className="bg-neutral-900 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white font-mono w-full focus:outline-none focus:border-cyan-400"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-neutral-400 font-mono block mb-2">Hydration Objective Selection</label>
                      <select
                        value={profile.fitnessGoal}
                        onChange={(e) => setProfile(prev => ({ ...prev, fitnessGoal: e.target.value as any }))}
                        className="bg-neutral-900 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-neutral-200 w-full focus:outline-none focus:border-cyan-400 cursor-pointer"
                      >
                        <option value="optimize_health">Optimize Health Span</option>
                        <option value="athletic_performance">Athletic VO2-Max Peak Performance</option>
                        <option value="cognitive_focus">Cognitive Brain Preservation</option>
                        <option value="weight_management">Accelerated Hepatic Detox</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs text-neutral-400 font-mono block mb-2">Primary Custom Water target (ml)</label>
                      <input 
                        type="range"
                        min="1200"
                        max="5000"
                        step="100"
                        value={profile.targetDailyMl}
                        onChange={(e) => setProfile(prev => ({ ...prev, targetDailyMl: parseInt(e.target.value) }))}
                        className="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-cyan-400 my-3"
                      />
                      <div className="flex justify-between text-xs text-cyan-400 font-mono font-bold">
                        <span>Min: 1200ml</span>
                        <span>Selected: {profile.targetDailyMl} ml</span>
                      </div>
                    </div>
                  </div>

                  {/* Developer Sandbox Controls */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-mono font-bold tracking-wider uppercase text-neutral-300">Hardware Prototyping Controls & Sandbox</h4>
                    <p className="text-xs text-neutral-400">
                      Simulate a full reset or toggle physical ESP32 low-latency triggers.
                    </p>
                    <div className="flex flex-wrap gap-3">
                      <button
                        id="reset-onboarding-btn"
                        onClick={() => {
                          localStorage.removeItem('getvari_onboard_complete');
                          localStorage.removeItem('getvari_logged_in');
                          setIsOnboarded(false);
                          setIsLoggedIn(false);
                          setIsOtpSent(false);
                          setPhoneNumber('');
                          setOtpCode('');
                          setAgreeTerms(false);
                          setAppStage('splash');
                          
                          // Trigger clean restart notification
                          setAlerts(prev => [{
                            id: generateUniqueId('sys_reset'),
                            timestamp: new Date().toISOString(),
                            title: 'Telematic Profile Purged',
                            message: 'All local session states, consent handshakes and authorization cache have been successfully cleared.',
                            type: 'info',
                            read: false
                          }, ...prev]);
                        }}
                        className="bg-red-950/20 text-red-500 border border-red-900/40 hover:bg-red-900/30 font-bold px-4 py-2 rounded-xl text-xs transition cursor-pointer"
                      >
                        🚨 Reset App States (Demonstrate Splash/Login Flow)
                      </button>

                      <button
                        id="auto-generate-water-btn"
                        onClick={() => {
                          setFluidToLog(350);
                        }}
                        className="bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 font-semibold px-4 py-2 rounded-xl text-xs transition border border-cyan-500/20 cursor-pointer"
                      >
                        💦 Feed Hydron Balance Node
                      </button>
                    </div>
                  </div>

                </div>

              </div>
            )}

          </section>

          {/* RIGHT 4-COLUMNS COMPARTMENT (Dedicated Hardware Simulator always on deck) */}
          <section className="lg:col-span-4 space-y-6">
            
            {/* Quick Status Device Card based on selected BLE states */}
            <div className="glass rounded-[28px] p-5 border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-orange-500/10 text-orange-400">
                  <Smartphone className="w-5 h-5 animate-float" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">GetVari Companion V1</h4>
                  <span className="text-[10px] text-gray-400 block -mt-0.5 font-mono">
                    Model: ESP32 Wearable prototype
                  </span>
                </div>
              </div>

              <div className="flex flex-col items-end text-right">
                <span className="text-[10px] text-cyan-400 font-mono font-bold flex items-center gap-1">
                  <Battery className="w-3.5 h-3.5 text-green-400" />
                  {deviceConnection === 'disconnected' ? '--%' : `${sensorData.batteryLevel}%`}
                </span>
                <span className="text-[9px] text-neutral-500">Live Battery</span>
              </div>
            </div>

            {/* Hardware simulator controls (Lets evaluators toggle risk models immediately on screen) */}
            <div className="space-y-2">
              <div className="px-1 flex justify-between items-center">
                <h4 className="text-[10px] text-gray-400 font-mono uppercase tracking-widest">Biometric Stressor Inputs</h4>
                <span className="text-[9px] text-orange-400 font-mono bg-orange-500/10 px-2 py-0.5 rounded border border-orange-500/10">ESP32 Simulation Active</span>
              </div>
              <DeviceSimulator 
                sensorData={sensorData} 
                setSensorData={setSensorData} 
                hoursSinceDrink={hoursSinceDrink} 
                setHoursSinceDrink={handleManualHoursSinceDrinkSlider}
                deviceConnection={deviceConnection}
                setDeviceConnection={setDeviceConnection}
                onDrinkLogged={logDrink}
                solvedRisk={solvedRisk}
                theme={theme}
                pairedDeviceInfo={pairedDeviceInfo}
              />
            </div>

            {/* Why This Score - Score Explainability Card */}
            <div className="glass rounded-[28px] p-5 border border-white/10 space-y-4">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan-400 animate-pulse" />
                <h4 className="text-xs font-sans font-extrabold tracking-wider uppercase text-neutral-200">Why This Score?</h4>
              </div>

              <div className="space-y-2.5 text-xs font-mono text-neutral-300">
                {[
                  { label: 'Heart Load', val: solvedRisk.heartLoad, weight: 0.30, pts: Math.round(solvedRisk.heartLoad * 0.30) },
                  { label: 'Activity Load', val: solvedRisk.activityLoad, weight: 0.25, pts: Math.round(solvedRisk.activityLoad * 0.25) },
                  { label: 'Temperature Load', val: solvedRisk.temperatureLoad, weight: 0.20, pts: Math.round(solvedRisk.temperatureLoad * 0.20) },
                  { label: 'Humidity Load', val: solvedRisk.humidityLoad, weight: 0.10, pts: Math.round(solvedRisk.humidityLoad * 0.10) },
                  { label: 'Time Load', val: solvedRisk.timeLoad, weight: 0.15, pts: Math.round(solvedRisk.timeLoad * 0.15) }
                ].map((item) => (
                  <div key={item.label} className="flex justify-between items-center border-b border-white/[0.02] pb-1.5">
                    <span className="text-neutral-450">{item.label} ({Math.round(item.weight * 100)}%)</span>
                    <span className={`font-bold ${theme === 'light' ? 'text-[#020813]' : 'text-white'}`}>{item.pts} pts</span>
                  </div>
                ))}

                <div className="flex justify-between items-center pt-2 text-xs border-t border-white/10 font-sans font-bold">
                  <span className={theme === 'light' ? 'text-slate-800' : 'text-cyan-400'}>Total Risk Score</span>
                  <span className={`text-sm font-mono ${
                    solvedRisk.score <= 25 ? 'text-emerald-400' :
                    solvedRisk.score <= 50 ? 'text-yellow-400' :
                    solvedRisk.score <= 75 ? 'text-orange-400' : 'text-red-400 font-extrabold animate-pulse'
                  }`}>
                    {solvedRisk.score}
                  </span>
                </div>
              </div>
            </div>

          </section>

        </div>

        {/* Persistent bottom glass navigation menu based on design HTML requirements */}
        <footer id="main-nav-bar" className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-neutral-950/80 backdrop-blur-md rounded-2xl border border-white/10 px-4 py-2.5 flex items-center gap-2 max-w-sm sm:max-w-md w-[85%] sm:w-auto shadow-2xl justify-around select-none">
          <button
            id="nav-btn-dashboard"
            onClick={() => setActiveTab('dashboard')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'dashboard' 
                ? 'bg-neutral-800 text-cyan-400 shadow-md border border-white/5' 
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Dashboard</span>
          </button>

          <button
            id="nav-btn-analytics"
            onClick={() => setActiveTab('analytics')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'analytics' 
                ? 'bg-neutral-800 text-cyan-400 shadow-md border border-white/5' 
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Analytics</span>
          </button>

          <button
            id="nav-btn-sensors"
            onClick={() => setActiveTab('sensors')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'sensors' 
                ? 'bg-neutral-800 text-cyan-400 shadow-md border border-white/5' 
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">BLE Link</span>
          </button>

          <button
            id="nav-btn-settings"
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'settings' 
                ? 'bg-neutral-800 text-cyan-400 shadow-md border border-white/5' 
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <SettingsIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Settings</span>
          </button>
        </footer>

      </div>

      {/* SMART ALERTS MODAL CENTER DRAWER */}
      {showAlertModal && (
        <div id="smart-alerts-modal-backdrop" className="fixed inset-0 z-50 bg-neutral-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md glass rounded-3xl p-6 relative border border-white/10 shadow-2xl animate-fadeIn">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm uppercase tracking-widest font-extrabold text-neutral-200">System Notification Stream</h3>
              <button
                id="close-alerts-modal"
                onClick={() => setShowAlertModal(false)}
                className="text-xs bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg text-neutral-400 hover:text-white cursor-pointer"
              >
                Close
              </button>
            </div>
            
            <div className="space-y-3 max-h-[300px] overflow-y-auto mb-6 pr-1">
              {alerts.length === 0 ? (
                <p className="text-center py-8 text-xs text-neutral-500 font-mono">
                  No active warnings detected. Status normal.
                </p>
              ) : (
                alerts.map((al) => (
                  <div 
                    key={al.id} 
                    className={`p-3.5 rounded-2xl border flex gap-3 ${
                      al.type === 'warning' ? 'bg-amber-500/10 border-amber-500/20 text-amber-200' :
                      al.type === 'critical' ? 'bg-red-500/10 border-red-500/20 text-red-200' :
                      'bg-white/5 border-white/5 text-neutral-200'
                    }`}
                  >
                    <div className="mt-0.5">
                      {al.type === 'warning' || al.type === 'critical' ? (
                        <AlertTriangle className="w-4 h-4 text-orange-400" />
                      ) : (
                        <Info className="w-4 h-4 text-cyan-400" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-xs">{al.title}</span>
                        <span className="text-[8px] text-neutral-500">
                          {new Date(al.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-[11px] text-neutral-400 mt-1">{al.message}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex gap-2.5">
              <button
                id="clear-alerts-btn"
                onClick={clearAlerts}
                className="flex-1 py-2 bg-neutral-900 border border-white/10 rounded-xl text-neutral-300 font-bold hover:bg-neutral-850 text-xs transition cursor-pointer"
              >
                Clear Notifications Feed
              </button>
              <button
                id="trigger-mock-alarm-btn"
                onClick={() => {
                  // Simulate trigger immediate alert
                  setAlerts(prev => [{
                    id: generateUniqueId('mock_al'),
                    timestamp: new Date().toISOString(),
                    title: 'Heart Stress Strain Alert',
                    message: 'Elevated cardiac rate of 145bpm detected for over 8 minutes. Perspiration fluid loss index accelerated.',
                    type: 'warning',
                    read: false
                  }, ...prev]);
                }}
                className="py-2 px-4 bg-cyan-500 hover:bg-cyan-400 font-extrabold text-neutral-950 text-xs rounded-xl transition cursor-pointer"
              >
                Mock Test Alert
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NEW FLUID LOG SUBMISSION CONFIRMATION MODAL POPUP */}
      {fluidToLog !== null && (() => {
        const predictedRisk = calculatePredictedRiskAfterDrink(solvedRisk.score, fluidToLog, profile);
        const recoveryWindow = calculateRecoveryEstimation(fluidToLog, profile);
        return (
          <div id="fluid-confirmation-backdrop" className="fixed inset-0 z-50 bg-[#01040a]/90 backdrop-blur-md flex items-center justify-center p-4">
            <div className="w-full max-w-sm glass rounded-[36px] p-6 relative border border-white/10 shadow-2xl text-center space-y-5 animate-fadeIn">
              {/* Elegant glowing drop wrapper */}
              <div className="mx-auto flex items-center justify-center w-16 h-16 rounded-3xl bg-cyan-950/40 border border-[#00f2fe]/30 shadow-inner shadow-cyan-400/20 text-[#00f2fe]">
                <Droplets className="w-8 h-8 animate-pulse" />
              </div>

              <div className="space-y-1">
                <h3 className="text-xl font-extrabold text-white tracking-tight">Fluid Log Simulation</h3>
                <p className="text-neutral-300 text-xs max-w-xs mx-auto leading-relaxed">
                  Confirming <span className="text-[#00f2fe] font-semibold">{fluidToLog}ml</span> of active water intake?
                </p>
              </div>

              {/* Predictive Stress Analytics Panel */}
              <div className="bg-neutral-950/60 p-4 rounded-2xl border border-white/5 space-y-3 text-left text-xs font-mono">
                <div className="flex justify-between items-center">
                  <span className="text-neutral-450">Current Risk:</span>
                  <span className="text-white font-bold">{solvedRisk.score} / 100</span>
                </div>
                <div className="flex justify-between items-center border-t border-white/[0.03] pt-2">
                  <span className="text-cyan-400 font-sans font-bold">Predicted Risk after absorption:</span>
                  <span className="text-emerald-400 font-bold">{predictedRisk} / 100</span>
                </div>
                <div className="flex justify-between items-center border-t border-white/[0.03] pt-2">
                  <span className="text-neutral-450">Est. Recovery Window:</span>
                  <span className="text-cyan-300 font-bold">{recoveryWindow}</span>
                </div>
                <div className="space-y-1 border-t border-white/[0.03] pt-2">
                  <span className="text-[10px] text-neutral-500 uppercase block">Estimated Recovery Progress:</span>
                  <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden flex">
                    <div className="h-full bg-emerald-500 animate-pulse" style={{ width: `${Math.min(100, (fluidToLog / 1000) * 100)}%` }}></div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  id="confirm-log-cancel"
                  onClick={() => setFluidToLog(null)}
                  className="flex-1 bg-white/5 hover:bg-white/10 active:bg-white/15 text-neutral-300 font-semibold py-3 rounded-2xl text-xs transition border border-white/5 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  id="confirm-log-submit"
                  onClick={() => {
                    logDrink(fluidToLog);
                    setLastLoggedAmount(fluidToLog);
                    setFluidToLog(null);
                    setShowLogSuccessPopup(true);
                  }}
                  className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 active:from-cyan-600 active:to-blue-700 text-neutral-950 font-extrabold py-3 rounded-2xl text-xs transition shadow-lg shadow-cyan-500/20 cursor-pointer"
                >
                  Log Intake
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* FLOATING FLUID LOG SUCCESS TOAST NOTIFICATION & OVERLAY POPUP */}
      {showLogSuccessPopup && (
        <div id="fluid-logged-success-backdrop" className="fixed inset-0 z-50 bg-[#01040a]/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-sm glass rounded-[36px] p-6 relative border border-emerald-500/20 shadow-2xl text-center space-y-6 animate-fadeIn">
            {/* Elegant glowing success check indicator */}
            <div className="mx-auto flex items-center justify-center w-16 h-16 rounded-full bg-emerald-950/40 border border-emerald-500/30 shadow-inner shadow-emerald-400/20 text-emerald-400">
              <Check className="w-8 h-8 animate-bounce" />
            </div>

            <div className="space-y-2">
              <span className="text-[9px] uppercase tracking-widest text-emerald-400 font-mono font-bold block">Biometric System Calibrated</span>
              <h3 className="text-xl font-extrabold text-white tracking-tight">Intake Logged Successfully!</h3>
              <p className="text-neutral-300 text-xs max-w-xs mx-auto leading-relaxed">
                Registered <span className="text-emerald-400 font-bold text-sm bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20">+{lastLoggedAmount} ml</span> of active fluid to your real-time physiological model.
              </p>
              
              <div className="grid grid-cols-2 gap-2 pt-2">
                <div className="bg-neutral-950/40 p-2.5 rounded-2xl border border-white/5 text-left">
                  <span className="text-[8px] uppercase font-mono tracking-wider text-neutral-500 block">Equivalence</span>
                  <span className="text-xs font-bold text-neutral-200 block mt-0.5">
                    {(lastLoggedAmount / 250).toFixed(1)} Glasses
                  </span>
                  <span className="text-[8px] text-neutral-400 block font-mono">250ml scale</span>
                </div>
                <div className="bg-neutral-950/40 p-2.5 rounded-2xl border border-white/5 text-left">
                  <span className="text-[8px] uppercase font-mono tracking-wider text-neutral-500 block">Metabolized</span>
                  <span className="text-xs font-bold text-neutral-200 block mt-0.5 flex items-center gap-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"></span>
                    100% Synced
                  </span>
                  <span className="text-[8px] text-neutral-400 block font-mono">Telemetry stream</span>
                </div>
              </div>

              <div className="text-[10px] text-neutral-400 leading-normal pt-2 font-sans italic">
                “Excellent! Keep hydration consistent to buffer environmental heat and dynamic cardiovascular strain.”
              </div>
            </div>

            <div className="pt-2">
              <button
                id="success-popup-dismiss-btn"
                onClick={() => setShowLogSuccessPopup(false)}
                className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 active:from-emerald-600 active:to-teal-600 text-neutral-950 font-extrabold py-3 rounded-2xl text-xs transition shadow-lg shadow-emerald-500/20 cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
