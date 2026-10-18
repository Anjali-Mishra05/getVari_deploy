import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, StatusBar, TouchableOpacity, AppState } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { dashboardBottomPadding } from '../utils/navLayout';
import { Bell, BellOff, Droplets, Menu, Plus } from 'lucide-react-native';
import Svg, { Defs, RadialGradient, Stop, Rect as SvgRect } from 'react-native-svg';

import HeaderWordmark from '../components/dashboard/HeaderWordmark';
import SensorTestPanel from '../components/SensorTestPanel';
import GlassCard from '../components/GlassCard';
import { AuthService } from '../services/AuthService';
import { HydrationLog, UserProfile } from '../types';
import AquaSageChat from '../chatbot/AquaSageChat';
import NotificationService from '../services/NotificationService';
import ActiveReminder, { ActiveReminderRecord } from '../services/ActiveReminder';
import NotificationHistory from '../services/NotificationHistory';
import NotificationCenter from '../components/NotificationCenter';
import QuickLogSheet from '../components/QuickLogSheet';
import DeviceConnectSheet from '../components/DeviceConnectSheet';
import ReminderFullScreen from '../components/ReminderFullScreen';
import ProfileSheet from '../components/ProfileSheet';
import ProfileEditSheet from '../components/ProfileEditSheet';
import ChatBus from '../services/ChatBus';
import HydrationService from '../services/HydrationService';
import ProfileService from '../services/ProfileService';
import useHydrationTelemetry from '../hooks/useHydrationTelemetry';
import useAppConfig from '../hooks/useAppConfig';
import nextHydrationTip from '../utils/hydrationTips';
import { reconcileNotificationsWithProfile } from '../services/NotificationSync';
import { ADMIN_BROADCAST_POLL_MS, checkAdminBroadcasts } from '../services/AdminBroadcastService';

import DashboardNav, { DashboardTab } from '../components/dashboard/DashboardNav';
import DashboardMenu from '../components/dashboard/DashboardMenu';
import AnalyticsView from '../components/analytics/AnalyticsView';
import DashboardSkeleton from '../components/dashboard/DashboardSkeleton';
import { CARD_GAP, cardStyle } from '../components/dashboard/cardTheme';
import RiskScoreCard from '../components/dashboard/RiskScoreCard';
import VitalsRow from '../components/dashboard/VitalsRow';
import AmbientCard from '../components/dashboard/AmbientCard';
import QuickFluidLogStation from '../components/dashboard/QuickFluidLogStation';
import FluidLoggingFeed from '../components/dashboard/FluidLoggingFeed';
import RecoveryTelemetryPanel from '../components/dashboard/RecoveryTelemetryPanel';
import DeviceBandCard from '../components/dashboard/DeviceBandCard';
import FluidLogConfirmModal from '../components/dashboard/FluidLogConfirmModal';
import FluidLogSuccessModal from '../components/dashboard/FluidLogSuccessModal';
import { PBWRBreakdown } from '../services/PBWRService';
import DailyTargetService from '../services/DailyTargetService';
import TelemetryHistoryService from '../services/TelemetryHistoryService';
import NotificationEngine from '../services/NotificationEngine';
import ConfigService from '../services/ConfigService';
import { warmBackend } from '../config/backend';
import {
  ThemeScope,
  onAccent,
  themed,
  tone,
  useThemeMode,
} from '../theme/theme';
import type { InfoTopic } from '../content/infoContent';

/** How long the app may stay over the lock screen with no reminder showing. */
const LOCK_SCREEN_RELEASE_GRACE_MS = 8 * 1000;

const HomeScreen = ({ navigation }: any) => {
  const [waterLogs, setWaterLogs] = useState<HydrationLog[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | undefined>(undefined);
  const [userId, setUserId] = useState<string | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  /**
   * The shared dark/light mode. Read here so the whole dashboard re-renders
   * when it changes, whichever control changed it.
   */
  const themeMode = useThemeMode();
  const insets = useSafeAreaInsets();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [quickLogOpen, setQuickLogOpen] = useState(false);
  /** The header's "+": onboarding's device connection screen, in a sheet. */
  const [deviceConnectOpen, setDeviceConnectOpen] = useState(false);
  /**
   * The amount the quick-log sheet should open on, when it was opened from a
   * suggestion rather than from the "+" or the Log tab. Null for every other
   * route in, which is what leaves the sheet on its usual default.
   */
  const [quickLogPrefillMl, setQuickLogPrefillMl] = useState<number | null>(null);
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

  /**
   * True when that first read *failed* rather than simply not having finished.
   *
   * The two are different screens. A slow read is a skeleton; a failed one has
   * to say so and offer a way out, because nothing else is coming — this is
   * the state a phone lands in when a reminder opens the app with the network
   * off, and without it the skeleton just runs forever.
   */
  const [loadFailed, setLoadFailed] = useState(false);

  /** A retry is in flight, so the button cannot be pressed a second time. */
  const [retrying, setRetrying] = useState(false);

  /** Seconds until the automatic retry, for the line under the message. */
  const [retryInSeconds, setRetryInSeconds] = useState<number | null>(null);

  /** How many attempts have failed in a row, which sets the backoff. */
  const failedAttempts = useRef(0);

  /** Guards against two reads running at once — a retry racing a foreground. */
  const loadInFlight = useRef(false);

  /**
   * `loadFailed` and "the first read has landed", for the listeners that are
   * registered once on mount and so cannot read the state itself.
   */
  const loadFailedRef = useRef(false);
  const hasLoadedRef = useRef(false);

  /**
   * Bumped by every failed attempt, so the backoff effect below re-arms.
   *
   * `loadFailed` alone cannot do it: it is already true on the second failure,
   * and an effect keyed on a value that did not change does not run again —
   * which would leave the screen offline forever after one retry.
   */
  const [retryNonce, setRetryNonce] = useState(0);

  /**
   * The current `fetchUserData`, for the callers that must not close over the
   * first render's copy — the backoff timer, the retry button and the
   * foreground listener, all of which are set up once.
   */
  const fetchUserDataRef = useRef<() => Promise<void>>(async () => {});

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
   * The physician limit is optional: without one, the pipeline caps the goal
   * at the healthy ceiling instead.
   */
  const targetMl = (() => {
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
  useAppConfig();

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

  const openInfoTopic = useCallback(
    (topic: InfoTopic) => {
      setMenuOpen(false);
      navigation.navigate('Info', { topic });
    },
    [navigation]
  );

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
        // Sleep-aware: nothing is put up in the sleep window; the reminder
        // stays stored and comes back after wake-up.
        const next = await NotificationService.reminderDueNow();
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
    // A quiet start: no burst of alerts the moment the dashboard opens.
    NotificationEngine.markSessionStart();
    // The welcome owed from login, now that the user has reached the landing page.
    void NotificationService.showPendingWelcome();

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

    // Returning to the app rebuilds the notification queues. The reminder
    // countdown stays anchored on the last drink, so this does not reset it.
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

      // Returning to the app is opening it: the same 5-minute quiet period
      // applies, so reopening never releases a burst of notifications.
      NotificationEngine.markSessionStart();
      // The notification permission may have been changed in Settings while
      // the app was away: the banner follows Android's real state.
      void NotificationService.hasNotificationPermission().then(setNotificationsEnabled);
      replayPendingPrompts();
      // A reminder delivered, snoozed or answered while the app was away.
      syncActiveReminder();
      // Coming back to the app is the most likely moment for the network to
      // have returned — a user who saw the offline card typically leaves to
      // turn data on and comes straight back. Only retried when the last read
      // failed; a successful one is topped up by `refreshTodayLogs` below.
      if (loadFailedRef.current) void fetchUserDataRef.current();
      refreshTodayLogs();
      refreshUnseen();
      ConfigService.refresh().catch(() => undefined);
      warmBackend();
      // Re-read the profile and reconcile: a wake/sleep window (or name)
      // changed elsewhere is applied now; an unchanged one rebuilds nothing
      // unless the 7-day queues are due a top-up.
      void (async () => {
        const userId = await AuthService.getCurrentUserId();
        if (!userId) return;
        await reconcileNotificationsWithProfile(userId, {
          fullRebuild: NotificationService.isScheduleStale(),
        });
        // Deliveries that reached the tray while the app was away go into the
        // bell even when nothing was rebuilt.
        await NotificationService.syncDeliveredFromTray();
      })().catch(error => console.error('[Notifications] Resume sync failed:', error));
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

  // Messages the admin panel sends to every user. There is no push server, so
  // the app collects them itself: on arriving here, on returning to the
  // foreground, and on a short interval while it is open.
  useEffect(() => {
    if (!userId) return;
    const check = () => {
      if (AppState.currentState === 'active') void checkAdminBroadcasts(userId);
    };
    check();
    const timer = setInterval(check, ADMIN_BROADCAST_POLL_MS);
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') check();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [userId]);

  // The app may show over the lock screen only while a reminder is
  // outstanding (native turns it on when a reminder launches the app on a
  // locked phone). With none showing, it is turned off so the lock screen
  // returns. The grace period covers a cold start from the reminder, where
  // this screen can mount a moment before the background handler has
  // recorded the reminder it was launched for. In the sleep window there is
  // no grace at all: nothing may show over the lock screen at night.
  useEffect(() => {
    if (activeReminder) return;
    let cancelled = false;
    let release: ReturnType<typeof setTimeout> | undefined;
    void NotificationService.lockScreenReleaseDelayMs(LOCK_SCREEN_RELEASE_GRACE_MS).then(delay => {
      if (cancelled) return;
      release = setTimeout(() => {
        void NotificationService.setShowOverLockScreen(false);
      }, delay);
    });
    return () => {
      cancelled = true;
      if (release) clearTimeout(release);
    };
  }, [activeReminder]);

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
      // A read, not a prompt: the permission screen is what asks.
      const hasPermission = await NotificationService.hasNotificationPermission();
      setNotificationsEnabled(hasPermission);
      // The schedule itself is built in `fetchUserData`, once the profile —
      // and so the real wake/sleep window — has been read.
    } catch (error) {
      console.error('[Notifications] Setup failed:', error);
    }
  };

  /**
   * The dashboard's first read, and every retry of it.
   *
   * Reads through the `*Result` variants rather than the plain fetchers
   * because those degrade an unreachable backend to "no profile, no entries",
   * which on this screen is indistinguishable from a new user who has drunk
   * nothing today — and is the one case that has to be retried rather than
   * rendered.
   */
  const fetchUserData = async () => {
    if (loadInFlight.current) return;
    loadInFlight.current = true;
    // The skeleton stands in for data that is not there yet. Once a read has
    // landed there is a real dashboard on screen, and a retry behind it must
    // not replace it with placeholders.
    if (!hasLoadedRef.current) setLoadingUserData(true);
    let failed = false;
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
      const { profile, failed: profileFailed } = await ProfileService.fetchProfileResult(uId);
      failed = profileFailed;
      if (profile) {
        console.log('[Supabase] Profile data loaded:', profile);
        setUserProfile(profile);

        // Sync local telemetry history to Supabase for Admin parity
        TelemetryHistoryService.syncLocalToCloud(uId);
      }

      // Built once, now that the profile has been read: its wake/sleep
      // window is the source of truth, and if the read failed the stored
      // window (the last profile seen) is used rather than a default. A full
      // rebuild on every load keeps the 7-day queues topped up; it replaces
      // entries in place, so it never duplicates. Also covers a reinstall,
      // where Android has no alarms left and everything is built from here.
      await reconcileNotificationsWithProfile(uId, {
        fullRebuild: true,
        profileResult: { profile, failed: profileFailed },
      });

      // Today's hydration logs — the widget reports a *daily* total, so
      // yesterday's entries must not be counted in it.
      const { logs, failed: logsFailed } = await HydrationService.fetchTodayLogsResult(uId);
      console.log('[Supabase] Logs data loaded:', logs.length, "of today's entries");
      failed = failed || logsFailed;
      // An unreadable day is not an empty day. Overwriting the list with
      // nothing would wipe entries the user can see and has already logged.
      if (!logsFailed) setWaterLogs(logs);
    } catch (error) {
      console.error('[Supabase] Fatal error fetching data:', error);
      failed = true;
    } finally {
      loadInFlight.current = false;
      setRetrying(false);
      setLoadFailed(failed);
      failedAttempts.current = failed ? failedAttempts.current + 1 : 0;
      loadFailedRef.current = failed;
      if (failed) setRetryNonce(nonce => nonce + 1);
      else hasLoadedRef.current = true;
      // Cleared whether the read succeeded or failed: the failure has its own
      // state now, and a screen stuck on a spinner after a failed fetch is
      // worse than one saying what went wrong.
      setLoadingUserData(false);
    }
  };

  /**
   * Retry the read now, from the button on the offline card.
   *
   * Resets the backoff as well as firing the attempt: a user who presses this
   * is telling the app the network is back, and the next automatic try should
   * not be half a minute away because four earlier ones failed.
   */
  const retryLoad = useCallback(() => {
    failedAttempts.current = 0;
    setRetrying(true);
    setRetryInSeconds(null);
    void fetchUserDataRef.current();
  }, []);

  fetchUserDataRef.current = fetchUserData;

  /**
   * While the read is failing, try it again on a backoff — and say when.
   *
   * There is no connectivity listener in this build, and the read is its own
   * probe: if it succeeds the network is back, and if it does not there was
   * nothing to show anyway. The delay doubles so a phone left in a lift is not
   * retrying every three seconds, and is capped at half a minute so one that
   * comes back never waits long. A foreground and the Retry button both
   * short-circuit it, which covers the case the user notices first — they
   * turned the data on themselves and are watching the screen.
   */
  useEffect(() => {
    if (!loadFailed) {
      setRetryInSeconds(null);
      return;
    }

    const seconds = Math.min(30, 3 * 2 ** Math.max(0, failedAttempts.current - 1));
    setRetryInSeconds(seconds);

    const countdown = setInterval(() => {
      setRetryInSeconds(prev => (prev === null ? null : Math.max(0, prev - 1)));
    }, 1000);
    const timer = setTimeout(() => {
      void fetchUserDataRef.current();
    }, seconds * 1000);

    return () => {
      clearInterval(countdown);
      clearTimeout(timer);
    };
  }, [loadFailed, retryNonce]);

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
  const closeDeviceConnect = useCallback(() => setDeviceConnectOpen(false), []);
  const closeQuickLog = useCallback(() => {
    setQuickLogOpen(false);
    // Cleared on close so the next "+" opens on the usual default rather than
    // on whatever the risk card happened to be suggesting an hour ago.
    setQuickLogPrefillMl(null);
  }, []);

  /** The risk card's water-requirement pill: open the sheet on that amount. */
  const openQuickLogFor = useCallback((suggestedMl: number) => {
    setQuickLogPrefillMl(suggestedMl);
    setQuickLogOpen(true);
  }, []);
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

  useEffect(() => {
    if (userProfile && userId) {
      // Through `DailyTargetService`, not `PBWRService` directly: this effect
      // re-runs on every telemetry tick, and the live pipeline returns a
      // different goal each time an observed average crosses a band edge. The
      // goal is locked for the local day so it holds still while the user is
      // drinking against it.
      DailyTargetService.getTodayBreakdown(userProfile, totalWaterConsumed, userId).then(breakdown => {
        setPbwrBreakdown(breakdown);
        // The Daily Water Requirement notification shows this same figure; a
        // no-op unless the target actually changed.
        NotificationService.setDailyWaterTarget(breakdown.finalTarget).catch(error =>
          console.error('[Notifications] Failed to apply the daily water target:', error)
        );
        // The profile in memory carries the same Final Daily Target, so the
        // notification engine (goal / PBWR 50%), the telemetry hook and the
        // profile editor all read the number the dashboard shows.
        setUserProfile(current =>
          current && current.targetDailyMl !== breakdown.finalTarget
            ? { ...current, targetDailyMl: breakdown.finalTarget }
            : current
        );
      }).catch(error => console.error('[DailyTarget] Failed to compute today’s target:', error));
    }
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

  return (
    <ThemeScope.Provider value>
    <View className={themed('flex-1 bg-[#02050e]')}>
      {/* Background Atmosphere */}
      <View className={themed('absolute inset-0')}>
        <Svg height="100%" width="100%">
          <Defs>
            <RadialGradient id="bgGrad" cx="50%" cy="30%" rx="80%" ry="40%" fx="50%" fy="30%" gradientUnits="userSpaceOnUse">
              <Stop offset="0%" stopColor={tone('#1e293b', '#ffffff')} stopOpacity={tone('0.15', '0.7')} />
              <Stop offset="100%" stopColor={tone('#02050e', '#f5f5f3')} stopOpacity="1" />
            </RadialGradient>
          </Defs>
          <SvgRect x="0" y="0" width="100%" height="100%" fill="url(#bgGrad)" />
        </Svg>
      </View>

      {/* Dark icons over the light background; dark mode keeps the default. */}
      {themeMode === 'light' && <StatusBar barStyle="dark-content" />}

      <SafeAreaView className={themed('flex-1')} edges={['top', 'left', 'right']}>
        <ScrollView
          className={themed('flex-1 px-4 pt-4')}
          showsVerticalScrollIndicator={false}
          // The navbar is docked over the system navigation and the chat FAB
          // sits above it again — so content has to clear all three before
          // the last card is fully readable (see
          // `navLayout`). Padding rather than a spacer view, so the scroll
          // indicator and overscroll agree with it.
          contentContainerStyle={{ paddingBottom: dashboardBottomPadding(insets.bottom) }}
        >

          {/* Top navigation: menu, logo, notifications, log, connect device. */}
          <View className={themed('flex-row items-center')} style={{ marginBottom: 10 }}>
            {/* Menu on the left; notifications and log on the right, in that
                order. The logo is centred in the space between them and gives
                way first on a narrow screen. The dark/light switch lives in
                the menu. */}
            <View className={themed('flex-row')}>
              <TouchableOpacity
                className={themed('w-10 h-10 rounded-2xl bg-white/[0.03] border border-white/10 items-center justify-center')}
                onPress={() => setMenuOpen(true)}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel="Menu"
                testID="header-menu"
              >
                <Menu color={tone('#94a3b8', '#52525b')} size={20} />
              </TouchableOpacity>
            </View>

            <View className={themed('flex-1 items-center overflow-hidden px-1')}>
              {/* The logo is the tap target for the sensor test panel — see
                  `handleLogoTap`. It carries no accessibility role or label of
                  its own, because it is not an advertised control and reading
                  one out would defeat the point of hiding it. */}
              <TouchableOpacity onPress={handleLogoTap} activeOpacity={1} accessible={false}>
                <HeaderWordmark />
              </TouchableOpacity>
            </View>

            <View className={themed('flex-row justify-end gap-1.5')}>
              {/* Both header actions share a size, radius and border weight;
                  only the fill separates the primary action from the secondary
                  one. */}
              <TouchableOpacity
                className={themed('w-10 h-10 rounded-2xl bg-white/[0.03] border border-white/10 items-center justify-center')}
                onPress={() => setNotificationsOpen(true)}
                hitSlop={4}
                accessibilityRole="button"
                accessibilityLabel={
                  unseenNotifications > 0
                    ? `Notifications, ${unseenNotifications} new`
                    : 'Notifications'
                }
              >
                <Bell color={unseenNotifications > 0 ? tone('#00f2fe', '#0e7490') : tone('#94a3b8', '#52525b')} size={20} />
                {unseenNotifications > 0 && (
                  <View className={themed('absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#00f2fe] items-center justify-center border-2 border-[#02050e]')}>
                    <Text className={themed('text-[9px] font-black text-[#020617]')}>
                      {unseenNotifications > 9 ? '9+' : unseenNotifications}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
              {/* Opens the log sheet itself, not the Fluid Logs section. */}
              <TouchableOpacity
                className={themed('w-10 h-10 rounded-2xl bg-[#00f2fe] border border-[#00f2fe] items-center justify-center shadow-lg shadow-cyan-500/25')}
                onPress={() => setQuickLogOpen(true)}
                hitSlop={4}
                accessibilityRole="button"
                accessibilityLabel="Log water"
                testID="header-log"
              >
                <Droplets color={onAccent()} size={20} strokeWidth={2.5} />
              </TouchableOpacity>
              {/* Connect a device: onboarding's connection screen, in a sheet.
                  Drawn as a secondary action, like notifications. */}
              <TouchableOpacity
                className={themed('w-10 h-10 rounded-2xl bg-white/[0.03] border border-white/10 items-center justify-center')}
                onPress={() => setDeviceConnectOpen(true)}
                hitSlop={4}
                accessibilityRole="button"
                accessibilityLabel="Connect a device"
                testID="header-connect-device"
              >
                <Plus color={tone('#94a3b8', '#52525b')} size={20} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Tagline */}
          <View className={themed('items-center')} style={{ marginBottom: CARD_GAP }}>
            {telemetry.sensorOverride ? (
              <TouchableOpacity
                className={themed('flex-row items-center gap-1.5 rounded-md bg-amber-500/15 border border-amber-500/40 px-2 py-[3px]')}
                onPress={() => setSensorPanelOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Sensor readings are pinned. Open the test panel."
              >
                <Text className={themed('text-[8px] uppercase tracking-[0.18em] text-amber-400 font-mono font-black')}>
                  Pinned readings
                </Text>
              </TouchableOpacity>
            ) : (
              <Text
                className={themed('text-[8px] uppercase tracking-[0.18em] text-cyan-400 font-mono font-black')}
                numberOfLines={1}
              >
                AI-Powered Hydration Intelligence
              </Text>
            )}
          </View>

          {/*
            Above the fold and outside the loading branch, because it is the
            one thing on this screen the user has to act on rather than read:
            with the grant missing, no reminder this app schedules will ever
            reach them. It used to sit below the vitals — off screen on a
            phone — and to be replaced by the skeleton for as long as the
            dashboard was loading, which is exactly when a launch from a
            reminder lands here.
          */}
          {!notificationsEnabled && (
            <GlassCard adaptive
              className={themed('bg-amber-500/10 border-amber-500/25 flex-row items-center gap-3')}
              style={cardStyle}
            >
              <BellOff color="#f59e0b" size={20} />
              <View className={themed('flex-1')}>
                <Text className={themed('text-amber-500 font-bold text-xs')}>Notifications are disabled</Text>
                <Text className={themed('text-amber-500/70 text-[10px] mt-0.5')}>
                  You won't receive hydration reminders or risk alerts.
                </Text>
              </View>
              <TouchableOpacity
                onPress={async () => {
                  // The dialog when Android will still show it; otherwise the
                  // settings page. The banner follows the real state either way
                  // (re-read here, and again when the user comes back).
                  const granted = await NotificationService.promptForNotificationPermission();
                  if (!granted) await NotificationService.openNotificationSettings();
                  setNotificationsEnabled(await NotificationService.hasNotificationPermission());
                }}
                accessibilityRole="button"
                accessibilityLabel="Enable notifications"
                className={themed('shrink-0 bg-amber-500/20 px-3.5 py-2 rounded-xl border border-amber-500/40')}
              >
                <Text className={themed('text-amber-500 font-black text-[10px] tracking-wider')}>ENABLE</Text>
              </TouchableOpacity>
            </GlassCard>
          )}

          {/*
            Loading is the whole column, not one card in it.

            The skeleton used to stand in for the risk card alone, while every
            card under it rendered against a profile that had not arrived — so
            the first thing on screen was a spinner on a field of empty black
            panels reporting "--" and a goal nobody had. They are placeholders
            now, shaped like what replaces them, and the real cards mount in
            one go when there is something in them.
          */}
          {activeTab === 'analytics' ? (
            <AnalyticsView userId={userId} targetMl={targetMl} todayLogs={waterLogs} />
          ) : loadingUserData || loadFailed ? (
            <DashboardSkeleton
              offline={loadFailed}
              retrying={retrying}
              onRetry={retryLoad}
              retryInSeconds={retryInSeconds}
            />
          ) : (
            <>
              <RiskScoreCard
                risk={telemetry.solvedRisk}
                totalMl={totalWaterConsumed}
                targetMl={targetMl}
                absorbing={telemetry.stomachVolume > 0}
                updatedAt={telemetry.riskUpdatedAt}
                onRequirementPress={openQuickLogFor}
              />

            {/* `connected` is what puts `--` in the tiles until a reading has
                actually arrived, instead of the plausible-looking placeholder
                values the stream used to open with. */}
            <VitalsRow sensorData={telemetry.sensorData} connected={telemetry.streaming} />

            <AmbientCard
              location={userProfile?.location}
              temperature={telemetry.sensorData.temperature}
              humidity={telemetry.sensorData.humidity}
            />

            <QuickFluidLogStation onSelectAmount={openConfirmation} disabled={savingLog} />

            <FluidLoggingFeed logs={waterLogs} />

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

            <DeviceBandCard
              connected={TelemetryHistoryService.isFresh(telemetry.sensorData.lastUpdated)}
              batteryLevel={telemetry.sensorData.batteryLevel}
            />
            </>
          )}

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
        {/* Follows the dark/light mode like every other screen here, so the
            shared controls inside it do too. */}
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
          // The live solve, not the copy written into the notification at
          // delivery. This screen is rendering now, so it can state the
          // current number; the shade's line is fixed the moment it is posted.
          riskScore={telemetry.solvedRisk.score}
          riskStatus={telemetry.solvedRisk.status}
          hoursSinceDrink={telemetry.effectiveHoursSinceDrink}
        />

        <DashboardMenu
          visible={menuOpen}
          onClose={() => setMenuOpen(false)}
          onOpenTopic={openInfoTopic}
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
          prefillMl={quickLogPrefillMl}
        />

        <DeviceConnectSheet visible={deviceConnectOpen} onClose={closeDeviceConnect} />

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

        <ThemeScope.Provider value={false}>
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
        </ThemeScope.Provider>

        {/* The chat writes through HydrationService itself and reports back
            over ChatBus, so no logging callback is threaded through here. */}
        <AquaSageChat userProfile={userProfile} />
      </SafeAreaView>
    </View>
    </ThemeScope.Provider>
  );
};

export default HomeScreen;
