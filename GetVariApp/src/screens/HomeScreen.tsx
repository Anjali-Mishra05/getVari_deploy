import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, AppState } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Bell, BellOff, Plus, Battery, Cpu } from 'lucide-react-native';
import Svg, { Defs, RadialGradient, Stop, Rect as SvgRect } from 'react-native-svg';

import BrandLogo from '../components/BrandLogo';
import SensorTestPanel from '../components/SensorTestPanel';
import FullScreenReminderBanner from '../components/FullScreenReminderBanner';
import GlassCard from '../components/GlassCard';
import { AuthService } from '../services/AuthService';
import { AIInsight, HydrationLog, UserProfile } from '../types';
import AquaSageChat from '../chatbot/AquaSageChat';
import NotificationService from '../services/NotificationService';
import ActiveReminder, { ActiveReminderRecord } from '../services/ActiveReminder';
import { profileNeedsPhysicianLimit } from '../utils/hydrationTarget';
import NotificationHistory from '../services/NotificationHistory';
import NotificationCenter from '../components/NotificationCenter';
import QuickLogSheet from '../components/QuickLogSheet';
import ReminderFullScreen from '../components/ReminderFullScreen';
import ProfileSheet from '../components/ProfileSheet';
import ProfileEditSheet from '../components/ProfileEditSheet';
import ChatBus from '../services/ChatBus';
import HydrationService from '../services/HydrationService';
import ProfileService from '../services/ProfileService';
import useHydrationTelemetry from '../hooks/useHydrationTelemetry';
import useAppConfig from '../hooks/useAppConfig';
import generateInsights from '../utils/hydrationInsights';
import nextHydrationTip from '../utils/hydrationTips';
import { normaliseSleepSchedule } from '../utils/sleepWindow';

import DashboardNav, { DashboardTab } from '../components/dashboard/DashboardNav';
import DashboardSkeleton from '../components/dashboard/DashboardSkeleton';
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
import PBWRBreakdownCard from '../components/dashboard/PBWRBreakdownCard';
import PBWRService, { PBWRBreakdown } from '../services/PBWRService';
import TelemetryHistoryService from '../services/TelemetryHistoryService';
import NotificationEngine from '../services/NotificationEngine';
import ConfigService from '../services/ConfigService';
import { warmBackend } from '../config/backend';

const HomeScreen = ({ navigation }: any) => {
  const [waterLogs, setWaterLogs] = useState<HydrationLog[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | undefined>(undefined);
  const [userId, setUserId] = useState<string | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [quickLogOpen, setQuickLogOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const [unseenNotifications, setUnseenNotifications] = useState(0);
  const [telemetryExpanded, setTelemetryExpanded] = useState(false);
  const [sensorPanelOpen, setSensorPanelOpen] = useState(false);

  /**
   * The reminder the user still owes an answer to, if there is one.
   *
   * Held as state rather than read on demand because it is what decides
   * whether the full-screen prompt is up, and it changes from outside React —
   * a notification delivered while the app is open, a "Log" pressed in the
   * shade, a snooze expiring. `ActiveReminder` publishes those changes.
   */
  const [activeReminder, setActiveReminder] = useState<ActiveReminderRecord | null>(null);

  // The quick-log station's three-step flow: propose an amount, confirm it
  // against the predicted recovery, then show the receipt. Nothing is written
  // until the middle step is accepted.
  const [pendingAmountMl, setPendingAmountMl] = useState<number | null>(null);
  const [savingLog, setSavingLog] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);
  const [loggedAmountMl, setLoggedAmountMl] = useState<number | null>(null);
  const [successMessage, setSuccessMessage] = useState('');

  const [insights, setInsights] = useState<AIInsight[]>([]);
  const [pbwrBreakdown, setPbwrBreakdown] = useState<PBWRBreakdown | null>(null);

  /**
   * True until the first read of the profile and today's entries has finished,
   * whether it succeeded or not.
   *
   * The dashboard used to render immediately against a hardcoded 2,500ml goal
   * and an empty log, then swap in the real figures a second or two later —
   * so the first thing a user saw after signing in was a set of numbers that
   * were not theirs, presented exactly like the ones that were. Everything
   * derived from the profile now waits, visibly, for the profile.
   */
  const [loadingUserData, setLoadingUserData] = useState(true);

  // One screen, so one destination. See `DashboardNav` for why this is not the
  // four-item bar it used to be.
  const [activeTab, setActiveTab] = useState<DashboardTab>('dashboard');

  /**
   * The daily goal, or null when there is not one to show. Never a stand-in.
   *
   * This is the personalized water target — the same number the breakdown card
   * itemises. It and the profile's stored goal now come from one pipeline
   * (`utils/pbwr.ts`); this one is the version refined by seven days of
   * observed steps, temperature and humidity, which the stored copy has no
   * way to read. They used to be two different formulas, so the tile and the
   * card below it disagreed by several hundred millilitres.
   *
   * The physician gate still overrides it. A fluid-restricted diagnosis with
   * no doctor's limit on file has no goal at all, and the personalized target
   * always produces *some* number — falling back to it here would quietly
   * reinstate the guess the gate exists to refuse.
   */
  const targetMl = (() => {
    if (profileNeedsPhysicianLimit(userProfile)) return null;
    if (pbwrBreakdown && Number.isFinite(pbwrBreakdown.finalTarget)) {
      return pbwrBreakdown.finalTarget;
    }
    // Until the first solve lands, the profile's stored goal stands in — the
    // same pipeline, run without the telemetry-driven bands.
    return Number.isFinite(userProfile?.targetDailyMl as number)
      ? (userProfile!.targetDailyMl as number)
      : null;
  })();
  const totalWaterConsumed = waterLogs.reduce((acc, curr) => acc + (Number(curr.amountMl) || 0), 0);

  // Subscribed rather than read once: the config arrives over the network, so
  // a screen that only sampled it at mount would keep showing the previous
  // one until something unrelated re-rendered it.
  const appConfig = useAppConfig();

  const telemetry = useHydrationTelemetry(userProfile, waterLogs);

  // The mount-only effect below subscribes for the life of the screen, so it
  // reaches the recovery model through a ref rather than closing over a
  // `telemetry` object that is rebuilt on every sensor tick.
  const ingestFluidRef = useRef(telemetry.ingestFluid);
  ingestFluidRef.current = telemetry.ingestFluid;

  /** Entry ids already poured into the recovery model, to keep it idempotent. */
  const ingestedLogIds = useRef<Set<string>>(new Set());

  /**
   * Five taps on the logo opens the sensor test panel.
   *
   * The panel ships in release builds because the research interns verify
   * scores on the same APK the study participants use, and maintaining a
   * second build for them is how the two drift apart. It is behind a gesture
   * rather than a visible control for the obvious reason: a participant who
   * finds it can pin their own readings and invalidate their data.
   *
   * The run resets after three seconds of no tapping, so an ordinary
   * double-tap on the header never accumulates into an opening.
   */
  const logoTaps = useRef(0);
  const logoTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLogoTap = useCallback(() => {
    logoTaps.current += 1;
    if (logoTapTimer.current) clearTimeout(logoTapTimer.current);

    if (logoTaps.current >= 5) {
      logoTaps.current = 0;
      setSensorPanelOpen(true);
      return;
    }
    logoTapTimer.current = setTimeout(() => {
      logoTaps.current = 0;
    }, 3000);
  }, []);

  useEffect(
    () => () => {
      if (logoTapTimer.current) clearTimeout(logoTapTimer.current);
    },
    []
  );

  /**
   * The write path, reachable from the mount-once effect below.
   *
   * Same reason as `ingestFluidRef`: that effect runs once and must not close
   * over the first render's `logDrink`, but a notification action pressed at
   * any point in the session has to go through the current one.
   */
  const logDrinkRef = useRef<(amountMl: number, source?: HydrationLog['source']) => Promise<boolean>>(
    async () => false
  );

  /**
   * True while the reminder screen is showing its "Logged" tick.
   *
   * A successful write settles the reminder straight away, which publishes a
   * change that would otherwise take the screen down mid-confirmation — the
   * user would press Log and watch the whole thing vanish without ever seeing
   * that it worked. While this is set, the store's emptiness is ignored and
   * the screen closes on its own timer instead.
   */
  const reminderConfirmingRef = useRef(false);

  useEffect(() => {
    fetchUserData();
    setupNotifications();

    // Disease definitions, activity bands and the goal formula all come from
    // the admin API. Refreshed here rather than only at launch so a config
    // published while the app was open is picked up on the next foreground.
    ConfigService.refresh().catch(error =>
      console.error('[Config] Initial refresh failed:', error)
    );

    // Start the chat backend waking now, on a screen the user is reading,
    // rather than when they open the chat and have to watch it.
    warmBackend();

    // Reminder presses are forwarded with the id of the press that produced
    // them. Deduping and the "ask once" rule live in the chat's prompt
    // session, so this screen can forward every delivery unconditionally.
    // A reminder tap opens the logging screen, not the chat. The press has
    // already raised the outstanding reminder, and `syncActiveReminder` below
    // puts `ReminderFullScreen` up in response — so there is nothing to do
    // here but keep the subscription for its side effect of recording the
    // press. Opening the chat as well used to drop the conversation on top of
    // the logging screen, which is why a reminder appeared to open the
    // chatbot; Vari is now a button on the reminder itself.
    const unsubscribePress = NotificationService.onForegroundReminderPress(() => {});

    // Deliveries, dismissals and the shade's own action buttons, for a
    // reminder that arrives while the app is already open. The verdict is the
    // one the background handler acts on, so the behaviour does not change
    // with where the user happens to be.
    const unsubscribeLifecycle = NotificationService.startReminderLifecycle(
      (verdict, { amountMl }) => {
        if (verdict === 'log-primary') {
          // The write clears the reminder from inside `HydrationService`, so
          // the prompt comes down on its own.
          void logDrinkRef.current(amountMl);
        }
        // 'open-prompt' needs nothing here: raising the reminder already
        // published a change, and the subscription below puts the screen up.
      }
    );

    // The outstanding reminder drives the full-screen prompt. Read once for
    // the current state, then kept in step with every change to it.
    const syncActiveReminder = async () => {
      try {
        const next = await ActiveReminder.due();
        setActiveReminder(current =>
          next === null && reminderConfirmingRef.current ? current : next
        );
      } catch (error) {
        console.error('[Reminders] Failed to read the active reminder:', error);
      }
    };
    syncActiveReminder();
    const unsubscribeReminder = ActiveReminder.subscribe(() => {
      void syncActiveReminder();
    });

    // A snooze that expires while the app is open has no OS event to announce
    // it — the queued nudge fires as a notification, but the user is already
    // looking at the app. This is what makes the prompt reappear on time in
    // that case; a minute's granularity matches the snooze options on offer.
    const snoozeTick = setInterval(() => {
      void syncActiveReminder();
    }, 60 * 1000);

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
        // Draining the queue is still required so a press cannot be replayed
        // on a later launch, but the reminder it refers to was already raised
        // by the background handler — `ReminderFullScreen` comes up from that.
        await NotificationService.consumePendingHydrationPrompts();
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

      // A correction takes millilitres off the day's *total*; it cannot take
      // them out of the stomach, because the water was either drunk or never
      // drunk. Feeding a negative amount to the recovery model would drain a
      // gut that may hold nothing.
      if (entry.amountMl > 0) ingestFluidRef.current(entry.amountMl);
      setWaterLogs(prev => (prev.some(log => log.id === entry.id) ? prev : [entry, ...prev]));
    });

    // Returning to the app restarts the reminder countdown from now.
    //
    // Only a real return counts. Android re-reports 'active' repeatedly — on
    // this device roughly once a second — and the handler used to run in full
    // every time, which meant a rebuild of the whole notification queue (a
    // couple of seconds of native work) several times a second. The scheduling
    // queue then grew faster than it drained, and anything waiting on it,
    // including the reschedule a hydration write does, never got its turn.
    let previousAppState = AppState.currentState;
    const appStateSub = AppState.addEventListener('change', state => {
      const returned = state === 'active' && previousAppState !== 'active';
      previousAppState = state;
      if (!returned) return;

      replayPendingPrompts();
      // A reminder delivered, snoozed or answered while the app was away.
      syncActiveReminder();
      refreshTodayLogs();
      refreshUnseen();
      ConfigService.refresh().catch(() => undefined);
      warmBackend();
      NotificationService.scheduleHydrationReminders();
      // Tops the fixed-time queue back up to a full week ahead.
      NotificationService.scheduleDailyNotifications();
    });

    return () => {
      unsubscribePress();
      unsubscribeLifecycle();
      unsubscribeHistory();
      unsubscribeReminder();
      clearInterval(snoozeTick);
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
      const hasPermission = await NotificationService.requestPermission();
      setNotificationsEnabled(hasPermission);
      await NotificationService.scheduleHydrationReminders();
      // 07:00 and 22:00 messages, queued with the OS so they arrive on time
      // whether or not the app is open.
      await NotificationService.scheduleDailyNotifications();
    } catch (error) {
      console.error('[Notifications] Setup failed:', error);
    }
  };

  const fetchUserData = async () => {
    setLoadingUserData(true);
    try {
      const uId = await AuthService.getCurrentUserId();
      console.log('[Supabase] Fetching data for user:', uId);
      if (!uId) return;
      setUserId(uId);

      // `uId`, not the `userId` state: that setter has not been applied yet on
      // this pass, so every call below used to be handed a stale null and had
      // to re-resolve the id for itself.
      //
      // A user who has not finished onboarding simply has no row yet, which
      // the service reports as `null` rather than as an error.
      const profile = await ProfileService.fetchProfile(uId);
      if (profile) {
        console.log('[Supabase] Profile data loaded:', profile);
        setUserProfile(profile);

        // Sync local telemetry history to Supabase for Admin parity
        TelemetryHistoryService.syncLocalToCloud(uId);

        // Reminders are scheduled by the OS from contexts that never see this
        // row, so the sleep window is handed to the notification layer on
        // every load. That also picks up a window edited on another device.
        try {
          await NotificationService.setSleepSchedule(normaliseSleepSchedule(profile));
        } catch (sleepError) {
          console.error('[Notifications] Failed to apply sleep window:', sleepError);
        }
      }

      // Today's hydration logs — the widget reports a *daily* total, so
      // yesterday's entries must not be counted in it.
      const logs = await HydrationService.fetchTodayLogs(uId);
      console.log('[Supabase] Logs data loaded:', logs.length, "of today's entries");
      setWaterLogs(logs);
    } catch (error) {
      console.error('[Supabase] Fatal error fetching data:', error);
    } finally {
      // Cleared whether the read succeeded or failed: a screen stuck on a
      // spinner after a failed fetch is worse than one showing what it has.
      setLoadingUserData(false);
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

  logDrinkRef.current = logDrink;

  /* ------------------------------------------------------------------ *
   * The full-screen reminder
   * ------------------------------------------------------------------ */

  /**
   * Log from the reminder screen.
   *
   * The reminder is cleared by `HydrationService` itself on a successful
   * write — every logging path in the app goes through it, so that is the one
   * place the outstanding question can be settled without each caller having
   * to remember to.
   */
  const logFromReminder = useCallback(
    async (amountMl: number) => {
      const ok = await logDrink(amountMl, 'manual');
      // Hold the screen up for the tick. A failed write leaves the reminder
      // standing, which is right — the user still owes it an answer.
      if (ok) reminderConfirmingRef.current = true;
      return ok;
    },
    [logDrink]
  );

  /** Push the reminder back; the screen comes down with it. */
  const snoozeReminder = useCallback(async (minutes: number) => {
    await NotificationService.snoozeReminder(minutes);
    setActiveReminder(null);
  }, []);

  /**
   * "Not now" — an answer, unlike a swipe, so the reminder is settled and the
   * 2-hourly cadence is left to raise the next one in its own time.
   */
  const skipReminder = useCallback(async () => {
    await NotificationService.resolveActiveReminder();
    setActiveReminder(null);
  }, []);

  /**
   * Take the screen down after a logged amount has been confirmed on screen.
   *
   * The reminder itself is already resolved by then, so this only has to drop
   * the local copy — waiting for the store's change to propagate would leave
   * the tick up for an extra beat.
   */
  const closeReminder = useCallback(() => {
    reminderConfirmingRef.current = false;
    setActiveReminder(null);
  }, []);

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

  /** The account sheet steps aside so the editor gets the screen to itself. */
  const openProfileEditor = useCallback(() => {
    setProfileOpen(false);
    setProfileEditOpen(true);
  }, []);

  /**
   * A save returns the merged blob, so the dashboard can adopt it directly —
   * the goal ring, the risk solve and the sleep-aware pacing all read from
   * this object and would otherwise show stale answers until the next fetch.
   */
  const handleProfileSaved = useCallback((profile: UserProfile) => {
    setUserProfile(profile);
    setProfileEditOpen(false);
  }, []);
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
    if (userProfile && userId) {
      PBWRService.calculatePBWR(userProfile, totalWaterConsumed, userId).then(setPbwrBreakdown);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [telemetry.solvedRisk.status, totalWaterConsumed, userProfile, userId]);

  useEffect(() => {
    if (telemetry.sensorData && userProfile && userId) {
      // 1. Record snapshot for history
      TelemetryHistoryService.recordSnapshot(telemetry.sensorData, userId);

      // 2. Evaluate all notification triggers
      NotificationEngine.evaluate({
        sensorData: telemetry.sensorData,
        profile: userProfile,
        todayLogs: waterLogs,
        solvedRisk: telemetry.solvedRisk
      });
    }
  }, [telemetry.sensorData, userProfile, userId, telemetry.solvedRisk, waterLogs]);

  // Which diagnoses require a doctor's daily limit is a property of the
  // condition in the admin config, not a list of ids repeated on each screen.
  // Read from `appConfig` rather than through ConfigService so the dependency
  // on the config is visible to React (and to the linter): a condition
  // re-flagged in the admin panel changes this gate without a reload.
  const isPhysicianGated = useMemo(
    () =>
      (userProfile?.medicalConditions ?? []).some(id =>
        appConfig.medicalConditions.some(
          condition => condition.id === id && condition.requiresPhysicianLimit
        )
      ),
    [userProfile, appConfig]
  );

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
        <ScrollView
          className="flex-1 px-4 pt-4"
          showsVerticalScrollIndicator={false}
          // The navbar floats 32px off the bottom and stands 80px tall, and the
          // chat FAB sits above that again — so content has to clear ~184px
          // before the last card is fully readable. Padding rather than a
          // spacer view, so the scroll indicator and overscroll agree with it.
          contentContainerStyle={{ paddingBottom: 200 }}
        >

          {/* Header */}
          <View className="flex-row justify-between items-center mb-3 gap-3">
            {/* The strapline is the widest thing in this row. Left unbounded it
                sized the column past the screen and pushed the action buttons
                off the right edge, clipping the "+". It now shrinks with the
                row, and the buttons keep their intrinsic width. */}
            <View className="flex-1">
              {/* The logo is the tap target for the sensor test panel — see
                  `handleLogoTap`. It carries no accessibility role or label of
                  its own, because it is not an advertised control and reading
                  one out would defeat the point of hiding it. */}
              <TouchableOpacity onPress={handleLogoTap} activeOpacity={1} accessible={false}>
                <BrandLogo size={32} fillProgress={1} withText={true} textSize="sm" />
              </TouchableOpacity>
              {telemetry.sensorOverride ? (
                <TouchableOpacity
                  className="flex-row items-center gap-1.5 mt-2 self-start rounded-md bg-amber-500/15 border border-amber-500/40 px-2 py-[3px]"
                  onPress={() => setSensorPanelOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Sensor readings are pinned. Open the test panel."
                >
                  <Text className="text-[8px] uppercase tracking-[0.18em] text-amber-400 font-mono font-black">
                    Pinned readings
                  </Text>
                </TouchableOpacity>
              ) : (
                <Text
                  className="text-[8px] uppercase tracking-[0.18em] text-cyan-400 font-mono font-black mt-2"
                  numberOfLines={1}
                >
                  AI-Powered Hydration Intelligence
                </Text>
              )}
            </View>
            <View className="flex-row gap-3 shrink-0">
              {/* Both header actions share a size, radius and border weight;
                  only the fill separates the primary action from the secondary
                  one. */}
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
                className="w-11 h-11 rounded-2xl bg-[#00f2fe] border border-[#00f2fe] items-center justify-center shadow-lg shadow-cyan-500/25"
                onPress={() => setQuickLogOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Log water"
              >
                <Plus color="#020617" size={20} strokeWidth={3} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Only visible while the grant is actually missing, so it costs
              nothing once reminders work as intended. */}
          <FullScreenReminderBanner />

          {loadingUserData ? (
            <DashboardSkeleton />
          ) : (
            <RiskScoreCard
              risk={telemetry.solvedRisk}
              totalMl={totalWaterConsumed}
              targetMl={targetMl}
              hoursSinceDrink={hoursSinceLastLog}
              lastIntakeMl={newestLog?.amountMl ?? null}
              absorbing={telemetry.stomachVolume > 0}
              updatedAt={telemetry.riskUpdatedAt}
              // The five readings the engine is solved over, and the seam that
              // pins them. Handing these in is what makes the load breakdown
              // editable; the card falls back to read-only without them.
              inputs={{
                heartRate: telemetry.sensorData.heartRate,
                activityLoad: telemetry.sensorData.activityLoad,
                temperature: telemetry.sensorData.temperature,
                humidity: telemetry.sensorData.humidity,
                gapHours: telemetry.effectiveHoursSinceDrink,
              }}
              override={telemetry.sensorOverride}
              onOverrideChange={telemetry.setSensorOverride}
            />
          )}

          {/* `connected` is what puts `--` in the tiles until a reading has
              actually arrived, instead of the plausible-looking placeholder
              values the stream used to open with. */}
          <VitalsRow sensorData={telemetry.sensorData} connected={telemetry.streaming} />

          {!notificationsEnabled && (
            <GlassCard className="mb-4 bg-amber-500/10 border-amber-500/20 rounded-2xl p-4 flex-row items-center gap-3">
              <BellOff color="#f59e0b" size={20} />
              <View className="flex-1">
                <Text className="text-amber-500 font-bold text-xs">Notifications are disabled</Text>
                <Text className="text-amber-500/70 text-[10px] mt-0.5">You won't receive hydration reminders or risk alerts.</Text>
              </View>
              <TouchableOpacity
                onPress={() => NotificationService.requestPermission().then(setNotificationsEnabled)}
                className="bg-amber-500/20 px-3 py-1.5 rounded-lg border border-amber-500/30"
              >
                <Text className="text-amber-500 font-bold text-[10px]">ENABLE</Text>
              </TouchableOpacity>
            </GlassCard>
          )}

          <AmbientCard
            location={userProfile?.location}
            temperature={telemetry.sensorData.temperature}
            humidity={telemetry.sensorData.humidity}
          />

          {pbwrBreakdown && (
            <PBWRBreakdownCard
              breakdown={pbwrBreakdown}
              hasPhysicianLimit={!!userProfile?.physicianLimitMl}
              isPhysicianGated={isPhysicianGated}
            />
          )}

          <QuickFluidLogStation onSelectAmount={openConfirmation} disabled={savingLog} />

          <CoreAIInsights insights={insights} onRefresh={refreshInsights} />

          <FluidLoggingFeed logs={waterLogs} />

          <WhyThisScoreCard risk={telemetry.solvedRisk} />

          <RecoveryTelemetryPanel
            stomachVolume={telemetry.stomachVolume}
            absorbedHydration={telemetry.absorbedHydration}
            absorptionRate={telemetry.absorptionRate}
            sweatLossRate={telemetry.sweatLossRate}
            targetMlPerAwakeHour={telemetry.targetMlPerAwakeHour}
            awakeHoursPerDay={telemetry.awakeHoursPerDay}
            isSleeping={telemetry.isSleeping}
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
                  <View className={`w-1.5 h-1.5 rounded-full ${TelemetryHistoryService.isFresh(telemetry.sensorData.lastUpdated) ? 'bg-emerald-500' : 'bg-red-500'}`} />
                  <Text className="text-[9px] text-neutral-500 font-mono font-bold uppercase tracking-widest">
                    {TelemetryHistoryService.isFresh(telemetry.sensorData.lastUpdated) ? 'Streaming encrypted' : 'Offline / Status Unknown'}
                  </Text>
                </View>
              </View>
            </View>
            <View className="flex-row items-center gap-2.5 bg-white/[0.03] px-3 py-1.5 rounded-xl">
              <Battery color={telemetry.sensorData.batteryLevel && telemetry.sensorData.batteryLevel <= 20 ? '#ef4444' : '#10b981'} size={16} />
              <Text className={`text-[11px] font-black font-mono ${telemetry.sensorData.batteryLevel && telemetry.sensorData.batteryLevel <= 20 ? 'text-red-500' : 'text-emerald-500'}`}>
                {telemetry.sensorData.batteryLevel !== null ? `${telemetry.sensorData.batteryLevel}%` : '--%'}
              </Text>
            </View>
          </GlassCard>

        </ScrollView>

        {/* One destination, two actions — see `DashboardNav`. */}
        <DashboardNav
          active={activeTab}
          onSelect={setActiveTab}
          onLogWater={() => setQuickLogOpen(true)}
          onOpenProfile={() => setProfileOpen(true)}
          profileInitial={profileInitial}
        />

        {/*
          Mounted last of the overlays and rendered above everything, because
          an unanswered reminder outranks whatever else is on screen — that is
          the whole difference between this and the notification it replaces.
        */}
        <ReminderFullScreen
          visible={activeReminder !== null}
          firedAt={activeReminder?.firedAt ?? null}
          onLog={logFromReminder}
          onSnooze={snoozeReminder}
          onSkip={skipReminder}
          onClose={closeReminder}
          onAskVari={() => {
            // The reminder stays outstanding: handing it to the chat is not an
            // answer, and it must still be there if the conversation goes
            // nowhere. `force` because this is a deliberate tap, not the OS
            // redelivering a press the dedupe is there to swallow.
            const eventId = activeReminder?.eventId;
            if (eventId) ChatBus.openHydrationPrompt(eventId, { force: true });
          }}
          totalMl={totalWaterConsumed}
          targetMl={targetMl}
        />

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
          onEditProfile={openProfileEditor}
        />

        {/* Rendered beside the account sheet rather than inside it: two RN
            modals stacked in the same tree fight over the native window, and
            the editor needs the full height the account sheet does not use. */}
        <ProfileEditSheet
          visible={profileEditOpen}
          userProfile={userProfile}
          onClose={() => setProfileEditOpen(false)}
          onSaved={handleProfileSaved}
        />

        <SensorTestPanel
          visible={sensorPanelOpen}
          onClose={() => setSensorPanelOpen(false)}
          profile={userProfile}
          live={{
            heartRate: telemetry.sensorData.heartRate,
            activityLoad: telemetry.sensorData.activityLoad,
            temperature: telemetry.sensorData.temperature,
            humidity: telemetry.sensorData.humidity,
            gapHours: telemetry.effectiveHoursSinceDrink,
          }}
          override={telemetry.sensorOverride}
          onApply={telemetry.setSensorOverride}
        />

        {/* The chat writes through HydrationService itself and reports back
            over ChatBus, so no logging callback is threaded through here. */}
        <AquaSageChat userProfile={userProfile} />
      </SafeAreaView>
    </View>
  );
};

export default HomeScreen;
