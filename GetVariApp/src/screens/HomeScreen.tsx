import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, AppState } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Activity,
  Droplets,
  Bell,
  Plus,
  Battery,
  TrendingUp,
  Cpu,
} from 'lucide-react-native';
import Svg, { Defs, RadialGradient, Stop, Rect as SvgRect } from 'react-native-svg';

import BrandLogo from '../components/BrandLogo';
import GlassCard from '../components/GlassCard';
import { supabase } from '../services/SupabaseClient';
import { AuthService } from '../services/AuthService';
import { AIInsight, HydrationLog, UserProfile } from '../types';
import AquaSageChat from '../chatbot/AquaSageChat';
import NotificationService from '../services/NotificationService';
import NotificationHistory from '../services/NotificationHistory';
import NotificationCenter from '../components/NotificationCenter';
import QuickLogSheet from '../components/QuickLogSheet';
import ProfileSheet from '../components/ProfileSheet';
import ChatBus from '../services/ChatBus';
import HydrationService from '../services/HydrationService';
import useHydrationTelemetry from '../hooks/useHydrationTelemetry';
import generateInsights from '../utils/hydrationInsights';
import nextHydrationTip from '../utils/hydrationTips';

import RiskScoreCard from '../components/dashboard/RiskScoreCard';
import VitalsRow from '../components/dashboard/VitalsRow';
import AmbientCard from '../components/dashboard/AmbientCard';
import QuickFluidLogStation from '../components/dashboard/QuickFluidLogStation';
import CoreAIInsights from '../components/dashboard/CoreAIInsights';
import FluidLoggingFeed from '../components/dashboard/FluidLoggingFeed';
import WhyThisScoreCard from '../components/dashboard/WhyThisScoreCard';
import RecoveryTelemetryPanel from '../components/dashboard/RecoveryTelemetryPanel';
import FluidLogConfirmModal from '../components/dashboard/FluidLogConfirmModal';
import FluidLogSuccessModal from '../components/dashboard/FluidLogSuccessModal';

const HomeScreen = ({ navigation }: any) => {
  const [waterLogs, setWaterLogs] = useState<HydrationLog[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | undefined>(undefined);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [quickLogOpen, setQuickLogOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [unseenNotifications, setUnseenNotifications] = useState(0);
  const [telemetryExpanded, setTelemetryExpanded] = useState(false);

  // The quick-log station's three-step flow: propose an amount, confirm it
  // against the predicted recovery, then show the receipt. Nothing is written
  // until the middle step is accepted.
  const [pendingAmountMl, setPendingAmountMl] = useState<number | null>(null);
  const [savingLog, setSavingLog] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);
  const [loggedAmountMl, setLoggedAmountMl] = useState<number | null>(null);
  const [successMessage, setSuccessMessage] = useState('');

  const [insights, setInsights] = useState<AIInsight[]>([]);

  const targetMl = userProfile?.targetDailyMl || 2500;
  const totalWaterConsumed = waterLogs.reduce((acc, curr) => acc + curr.amountMl, 0);

  const telemetry = useHydrationTelemetry(userProfile, waterLogs);

  // The mount-only effect below subscribes for the life of the screen, so it
  // reaches the recovery model through a ref rather than closing over a
  // `telemetry` object that is rebuilt on every sensor tick.
  const ingestFluidRef = useRef(telemetry.ingestFluid);
  ingestFluidRef.current = telemetry.ingestFluid;

  /** Entry ids already poured into the recovery model, to keep it idempotent. */
  const ingestedLogIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    fetchUserData();
    setupNotifications();

    // Reminder presses are forwarded with the id of the press that produced
    // them. Deduping and the "ask once" rule live in the chat's prompt
    // session, so this screen can forward every delivery unconditionally.
    const unsubscribePress = NotificationService.onForegroundReminderPress(eventId => {
      ChatBus.openHydrationPrompt(eventId);
    });

    // Everything shown while the app is foregrounded goes into the bell menu's
    // delivery log; background deliveries are recorded from index.js.
    const unsubscribeHistory = NotificationService.startHistoryTracking();

    const refreshUnseen = async () => {
      try {
        setUnseenNotifications(await NotificationHistory.unseenCount());
      } catch (error) {
        console.error('[Notifications] Failed to count unseen:', error);
      }
    };
    refreshUnseen();
    const historySub = NotificationHistory.onChange(refreshUnseen);

    // Reminders tapped from a background/quit state were recorded for replay.
    const replayPendingPrompts = async () => {
      try {
        const pending = await NotificationService.consumePendingHydrationPrompts();
        pending.forEach(eventId => ChatBus.openHydrationPrompt(eventId));
      } catch (error) {
        console.error('[Reminders] Failed to replay pending prompts:', error);
      }
    };
    replayPendingPrompts();

    // Every successful write announces itself here — the quick-log station,
    // the sheet and the chat alike — so this is the one place that updates the
    // day's list and pours the water into the recovery model. Doing it at the
    // call site instead would double-count, since the writer emits regardless
    // of who called it.
    const loggedSub = ChatBus.onHydrationLogged(result => {
      const entry = result.entry;
      if (!entry) {
        refreshTodayLogs();
        return;
      }

      // Dedupe on the entry id rather than on the list, so a re-delivery can
      // never pour the same drink into the model twice.
      if (ingestedLogIds.current.has(entry.id)) return;
      ingestedLogIds.current.add(entry.id);

      ingestFluidRef.current(entry.amountMl);
      setWaterLogs(prev => (prev.some(log => log.id === entry.id) ? prev : [entry, ...prev]));
    });

    // Returning to the app restarts the reminder countdown from now.
    const appStateSub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        replayPendingPrompts();
        refreshTodayLogs();
        refreshUnseen();
        NotificationService.scheduleHydrationReminders();
      }
    });

    return () => {
      unsubscribePress();
      unsubscribeHistory();
      historySub.remove();
      loggedSub.remove();
      appStateSub.remove();
    };
  }, []);

  /**
   * Push setup is best-effort: a device without Play Services, a revoked
   * permission or a missing Firebase config should cost the user their
   * reminders, not the whole screen. Failures are logged rather than left to
   * surface as an uncaught rejection.
   */
  const setupNotifications = async () => {
    try {
      await NotificationService.setupFCM();
      await NotificationService.getFCMToken();
      await NotificationService.scheduleHydrationReminders();
    } catch (error) {
      console.error('[Notifications] Setup failed:', error);
    }
  };

  const fetchUserData = async () => {
    try {
      const userId = await AuthService.getCurrentUserId();
      console.log('[Supabase] Fetching data for user:', userId);
      if (!userId) return;

      // Fetch Profile. `maybeSingle` rather than `single`: a user who has not
      // finished onboarding has no row yet, and `single` reports that missing
      // row as an error.
      const { data: profileRow, error: profileError } = await supabase
        .from('getvari_profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (profileError) {
        console.error('[Supabase] Error fetching profile:', profileError.message);
      } else if (profileRow?.profile) {
        console.log('[Supabase] Profile data loaded:', profileRow.profile);
        setUserProfile(profileRow.profile);
      }

      // Today's hydration logs — the widget reports a *daily* total, so
      // yesterday's entries must not be counted in it.
      const logs = await HydrationService.fetchTodayLogs(userId);
      console.log('[Supabase] Logs data loaded:', logs.length, "of today's entries");
      setWaterLogs(logs);
    } catch (error) {
      console.error('[Supabase] Fatal error fetching data:', error);
    }
  };

  /**
   * Re-reads today's entries from Supabase (after a foreground, or a write).
   * Called from event listeners, so a failed read keeps the last known list
   * instead of escaping as an uncaught rejection.
   */
  const refreshTodayLogs = async () => {
    try {
      setWaterLogs(await HydrationService.fetchTodayLogs());
    } catch (error) {
      console.error('[Supabase] Failed to refresh today logs:', error);
    }
  };

  const profileInitial =
    (typeof userProfile?.gender === 'string' && userProfile.gender.charAt(0).toUpperCase()) || 'U';

  const newestLog = useMemo(
    () =>
      waterLogs.reduce<HydrationLog | null>(
        (latest, log) => (latest === null || log.timestamp > latest.timestamp ? log : latest),
        null
      ),
    [waterLogs]
  );

  /** Real hours since the newest entry — what the "Last Intake" tile reports. */
  const hoursSinceLastLog = newestLog
    ? (Date.now() - new Date(newestLog.timestamp).getTime()) / 3_600_000
    : 0;

  /**
   * After a sign-out, `reset` rather than `navigate`: the back gesture must not
   * return to a Home screen whose session no longer exists.
   */
  const handleLoggedOut = () => {
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

  /**
   * The single write path for every entry point on this screen.
   *
   * Goes through the shared hydration service so it obeys the same idempotency
   * and reminder-reset rules as the chat. The local list and the recovery
   * model are both updated by the `onHydrationLogged` subscription above, not
   * from here — that is what keeps one drink from being counted twice.
   */
  const logDrink = useCallback(
    async (amountMl: number, source: HydrationLog['source'] = 'manual'): Promise<boolean> => {
      const result = await HydrationService.logWater({
        amountMl,
        source,
        requestId: HydrationService.generateRequestId('home'),
      });

      if (result.status === 'error' || result.status === 'unauthenticated') {
        console.warn('[Supabase] Could not log drink:', result.status, result.error ?? '');
        return false;
      }
      return true;
    },
    []
  );

  /** Confirmation accepted: write it, then swap the modal for the receipt. */
  const confirmPendingLog = async () => {
    if (pendingAmountMl === null || savingLog) return;

    setSavingLog(true);
    setLogError(null);
    try {
      const ok = await logDrink(pendingAmountMl);
      if (!ok) {
        setLogError("Couldn't save that entry. Check your connection and try again.");
        return;
      }
      setSuccessMessage(nextHydrationTip());
      setLoggedAmountMl(pendingAmountMl);
      setPendingAmountMl(null);
    } catch (error) {
      console.error('[Hydration] Confirmed log failed:', error);
      setLogError("Couldn't save that entry. Check your connection and try again.");
    } finally {
      setSavingLog(false);
    }
  };

  const openConfirmation = useCallback((amountMl: number) => {
    setLogError(null);
    setPendingAmountMl(amountMl);
  }, []);

  // The sensor stream re-renders this screen every couple of seconds, and the
  // quick-log sheet closes itself on a timer keyed to its `onClose` prop — an
  // inline arrow would restart that timer on every tick. These stay stable.
  const closeQuickLog = useCallback(() => setQuickLogOpen(false), []);
  const closeNotifications = useCallback(() => setNotificationsOpen(false), []);
  const closeProfile = useCallback(() => setProfileOpen(false), []);
  const dismissSuccess = useCallback(() => setLoggedAmountMl(null), []);
  const cancelConfirmation = useCallback(() => {
    setPendingAmountMl(null);
    setLogError(null);
  }, []);

  // Insights are derived from the current solve, so they are regenerated when
  // the risk band moves rather than on every sensor tick — a card that rewrote
  // itself twice a second would be unreadable.
  const refreshInsights = useCallback(() => {
    setInsights(
      generateInsights({
        sensorData: telemetry.sensorData,
        risk: telemetry.solvedRisk,
        hoursSinceDrink: telemetry.effectiveHoursSinceDrink,
        totalMl: totalWaterConsumed,
        targetMl,
      })
    );
  }, [telemetry, totalWaterConsumed, targetMl]);

  useEffect(() => {
    refreshInsights();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [telemetry.solvedRisk.status, totalWaterConsumed]);

  return (
    <View className="flex-1 bg-[#02050e]">
      {/* Background Atmosphere */}
      <View className="absolute inset-0">
        <Svg height="100%" width="100%">
          <Defs>
            <RadialGradient id="bgGrad" cx="50%" cy="30%" rx="80%" ry="40%" fx="50%" fy="30%" gradientUnits="userSpaceOnUse">
              <Stop offset="0%" stopColor="#1e293b" stopOpacity="0.15" />
              <Stop offset="100%" stopColor="#02050e" stopOpacity="1" />
            </RadialGradient>
          </Defs>
          <SvgRect x="0" y="0" width="100%" height="100%" fill="url(#bgGrad)" />
        </Svg>
      </View>

      <SafeAreaView className="flex-1" edges={['top', 'left', 'right']}>
        <ScrollView className="flex-1 px-5 pt-4" showsVerticalScrollIndicator={false}>

          {/* Header */}
          <View className="flex-row justify-between items-center mb-6">
            <View>
              <BrandLogo size={32} fillProgress={1} withText={true} textSize="sm" />
              <Text className="text-[9px] uppercase tracking-[0.3em] text-cyan-400 font-mono font-black mt-2">
                AI-Powered Hydration Intelligence
              </Text>
            </View>
            <View className="flex-row gap-3">
              <TouchableOpacity
                className="w-11 h-11 rounded-2xl bg-white/[0.03] border border-white/10 items-center justify-center"
                onPress={() => setNotificationsOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={
                  unseenNotifications > 0
                    ? `Notifications, ${unseenNotifications} new`
                    : 'Notifications'
                }
              >
                <Bell color={unseenNotifications > 0 ? '#00f2fe' : '#94a3b8'} size={20} />
                {unseenNotifications > 0 && (
                  <View className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#00f2fe] items-center justify-center border-2 border-[#02050e]">
                    <Text className="text-[9px] font-black text-[#020617]">
                      {unseenNotifications > 9 ? '9+' : unseenNotifications}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                className="w-11 h-11 rounded-2xl bg-[#00f2fe] items-center justify-center shadow-xl shadow-cyan-500/30"
                onPress={() => setQuickLogOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Log water"
              >
                <Plus color="#020617" size={24} strokeWidth={3} />
              </TouchableOpacity>
            </View>
          </View>

          <RiskScoreCard
            risk={telemetry.solvedRisk}
            totalMl={totalWaterConsumed}
            targetMl={targetMl}
            hoursSinceDrink={hoursSinceLastLog}
            lastIntakeMl={newestLog?.amountMl ?? null}
            absorbing={telemetry.stomachVolume > 0}
          />

          <VitalsRow sensorData={telemetry.sensorData} />

          <AmbientCard
            location={userProfile?.location}
            temperature={telemetry.sensorData.temperature}
            humidity={telemetry.sensorData.humidity}
          />

          <QuickFluidLogStation onSelectAmount={openConfirmation} disabled={savingLog} />

          <CoreAIInsights insights={insights} onRefresh={refreshInsights} />

          <FluidLoggingFeed logs={waterLogs} />

          <WhyThisScoreCard risk={telemetry.solvedRisk} />

          <RecoveryTelemetryPanel
            stomachVolume={telemetry.stomachVolume}
            absorbedHydration={telemetry.absorbedHydration}
            absorptionRate={telemetry.absorptionRate}
            sweatLossRate={telemetry.sweatLossRate}
            totalMl={totalWaterConsumed}
            targetMl={targetMl}
            expanded={telemetryExpanded}
            onToggle={() => setTelemetryExpanded(prev => !prev)}
          />

          {/* Hardware Status */}
          <GlassCard
            className="flex-row items-center justify-between mb-4 border-white/5 bg-black/60 rounded-[28px]"
            style={{ padding: 16 }}
          >
            <View className="flex-row items-center gap-3.5">
              <View className="p-2.5 bg-neutral-900 rounded-2xl border border-white/5">
                <Cpu color="#00f2fe" size={17} />
              </View>
              <View>
                <Text className="text-[10px] font-black text-white uppercase tracking-widest font-mono">
                  ESP32 Core Link
                </Text>
                <View className="flex-row items-center gap-1.5 mt-1">
                  <View className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <Text className="text-[9px] text-neutral-500 font-mono font-bold uppercase tracking-widest">
                    Streaming encrypted
                  </Text>
                </View>
              </View>
            </View>
            <View className="flex-row items-center gap-2.5 bg-white/[0.03] px-3 py-1.5 rounded-xl">
              <Battery color="#10b981" size={16} />
              <Text className="text-[11px] font-black text-emerald-500 font-mono">
                {telemetry.sensorData.batteryLevel}%
              </Text>
            </View>
          </GlassCard>

          <View className="h-28" />
        </ScrollView>

        {/* Persistent Navigation Bar */}
        <View className="absolute bottom-8 left-8 right-8 h-20 bg-neutral-950/90 border border-white/10 rounded-[28px] flex-row items-center justify-around px-4 shadow-2xl">
          <TouchableOpacity className="items-center">
            <View className="w-12 h-12 rounded-2xl bg-neutral-800 border border-white/5 items-center justify-center">
              <TrendingUp color="#00f2fe" size={22} strokeWidth={2.5} />
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            className="items-center"
            onPress={() => setQuickLogOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Log water"
          >
            <View className="w-12 h-12 items-center justify-center">
              <Droplets color="#475569" size={22} />
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            className="items-center"
            onPress={() => setTelemetryExpanded(prev => !prev)}
            accessibilityRole="button"
            accessibilityLabel="Toggle recovery engine telemetry"
          >
            <View className="w-12 h-12 items-center justify-center">
              <Activity color={telemetryExpanded ? '#00f2fe' : '#475569'} size={22} />
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            className="items-center"
            onPress={() => setProfileOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Profile and account settings"
          >
            <View className="w-12 h-12 items-center justify-center">
              <View className="w-7 h-7 rounded-full bg-neutral-800 border border-white/10 items-center justify-center">
                <Text className="text-[10px] font-black text-neutral-500">{profileInitial}</Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>

        <NotificationCenter
          visible={notificationsOpen}
          onClose={closeNotifications}
        />

        <QuickLogSheet
          visible={quickLogOpen}
          onClose={closeQuickLog}
          onLog={logDrink}
          totalMl={totalWaterConsumed}
          targetMl={targetMl}
        />

        <FluidLogConfirmModal
          amountMl={pendingAmountMl}
          currentRisk={telemetry.solvedRisk.score}
          profile={userProfile}
          saving={savingLog}
          error={logError}
          onCancel={cancelConfirmation}
          onConfirm={confirmPendingLog}
        />

        <FluidLogSuccessModal
          amountMl={loggedAmountMl}
          message={successMessage}
          onDismiss={dismissSuccess}
        />

        <ProfileSheet
          visible={profileOpen}
          onClose={closeProfile}
          userProfile={userProfile}
          targetMl={targetMl}
          onLoggedOut={handleLoggedOut}
        />

        {/* The chat writes through HydrationService itself and reports back
            over ChatBus, so no logging callback is threaded through here. */}
        <AquaSageChat userProfile={userProfile} />
      </SafeAreaView>
    </View>
  );
};

export default HomeScreen;
