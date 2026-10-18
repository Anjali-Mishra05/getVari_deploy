import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  TextInput,
  ScrollView,
  Keyboard,
  Platform,
  ActivityIndicator,
  Dimensions,
  Modal,
  Image,
  Animated,
  AppState,
  Easing,
  StyleSheet,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { MessageCircle, X, Send, Trash2, Droplets, Pencil } from 'lucide-react-native';
import { BACKEND_API_KEY, backendCandidates, resolveBackendUrl, warmBackend } from '../config/backend';
import ChatBus from '../services/ChatBus';
import HydrationService from '../services/HydrationService';
import HydrationPromptSession from '../services/HydrationPromptSession';
import { matchIntake, parseIntakeMl } from '../utils/parseIntake';
import { detectHydrationLogIntent, looksLikeQuestion } from '../utils/hydrationIntent';
import { buildLogConfirmation, formatMl } from '../utils/hydrationFormat';
import { withHydrationTip } from '../utils/hydrationTips';
import { quickLogAmounts } from '../utils/hydrationAmounts';
import type { HydrationLogResult } from '../types';
import { accent, accentFill, onAccent, themedStyles, tone, useThemeMode } from '../theme/theme';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { chatButtonBottom, footerBottomPadding, sideInset } from '../utils/navLayout';

interface Message {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  timestamp: Date;
}

/**
 * Drives the guided "did you drink water?" conversation.
 *
 * `idle` does not mean logging is off — a free-typed "I drank 750 ml" is
 * recognised and written in any state. The flow states only decide what the
 * quick-reply buttons offer and how a bare amount is interpreted.
 */
type LogFlowState = 'idle' | 'awaiting_choice' | 'awaiting_amount';

interface AquaSageChatProps {
  userProfile?: any;
  /**
   * Optional override for the intake write, used by tests. Production code
   * leaves this unset so every path shares `HydrationService.logWater`.
   */
  onLogWater?: (amountMl: number, requestId: string) => Promise<HydrationLogResult>;
}

/** The assistant's name, used everywhere the user can see it. */
export const ASSISTANT_NAME = 'Vari';

const INITIAL_GREETING = `Hi, I'm **${ASSISTANT_NAME}**! 💧 How can I help?`;

/**
 * How long an answer may take before the wait is explained rather than left as
 * a spinner.
 *
 * The chat backend runs on a plan that stops the instance after 15 minutes of
 * inactivity, so the first question after a quiet spell pays for a cold start.
 * The app cannot make that faster, but it can stop it looking like a hang.
 */
const SLOW_RESPONSE_NOTICE_MS = 4000;
const BOT_AVATAR_IMAGE = 'https://cdn-icons-png.flaticon.com/512/4712/4712109.png';

// Every string below is one short line. The closing tip is added by
// `appendAssistant`, so none of them carry their own.
const HYDRATION_PROMPT = '**Did you drink water? 💧**';
const AMOUNT_PROMPT = '**How much did you drink?**';
const MANUAL_PROMPT = '**Type the amount** and I’ll save it.';
const CHOICE_FALLBACK = 'Tap an option below, or just tell me the amount.';
const AMOUNT_FALLBACK = 'Try **500 ml**, **1 litre** or **2 glasses**.';
const CANCEL_ACK = '**Nothing logged.** Tell me the amount whenever you like.';
const NO_AUTH_MESSAGE = "**Couldn't save** — you're not signed in. Sign in and tap the amount again.";
const ERROR_MESSAGE = "**Couldn't save that.** Tap the amount again to retry.";

const MANUAL_INTENT = /\b(manual(?:ly)?|myself|my own|by hand|i'?ll (?:do|log|add|enter)|i will (?:do|log|add|enter))\b/i;
const AI_INTENT = /\b(you|ai|aquasage|bot|for me|please|auto(?:matic(?:ally)?)?|yes|yeah|yep|sure|ok(?:ay)?)\b/i;
const CANCEL_INTENT = /\b(cancel|never ?mind|nevermind|stop|forget it|not now|later|no thanks|nope|no)\b/i;

type QuickReplyAction =
  | { kind: 'choice'; choice: 'assisted' | 'manual' }
  | { kind: 'amount'; text: string };

interface QuickReply {
  label: string;
  action: QuickReplyAction;
  /** `primary` is the suggested path and is drawn filled. */
  tone?: 'primary' | 'secondary';
}

/**
 * Buttons carry an explicit action instead of a phrase that has to be
 * re-parsed. Guessing the intent back out of the label is what used to make
 * these taps unreliable.
 */
/**
 * A function rather than a constant, because the amounts come from the admin
 * config and that arrives over the network after this module is imported. A
 * captured array would have pinned the chat to whatever the app booted with,
 * while the quick-log sheet moved on.
 */
const quickRepliesFor = (state: Exclude<LogFlowState, 'idle'>): QuickReply[] => {
  // No emoji in the label: the icon is drawn as its own element, and the label
  // also becomes the user's chat message, where it reads better as plain text.
  if (state === 'awaiting_choice') {
    return [
      { label: 'Log it for me', action: { kind: 'choice', choice: 'assisted' }, tone: 'primary' },
      { label: "I'll do it manually", action: { kind: 'choice', choice: 'manual' } },
    ];
  }
  // Derived from the shared list, so the chat and the home screen's quick-log
  // sheet always offer the same amounts.
  return quickLogAmounts().map(({ label, primary }) => ({
    label,
    action: { kind: 'amount', text: label },
    tone: primary ? 'primary' : undefined,
  }));
};

/** Horizontal padding of the sheet's input area, which the buttons sit in. */
const SHEET_SIDE_PADDING = 16;

/** The teaser bubble's outline on a light page: neutral, and firm enough to read. */
const TEASER_BORDER_LIGHT = '#a1a1aa';

const styles = themedStyles(() => StyleSheet.create({
  /** One choice per row, the full width of the sheet. */
  choiceButton: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 2,
    marginBottom: 10,
  },
  choiceIcon: {
    width: 32,
    height: 32,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  choiceLabel: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  /** Amounts share one row, each an equal slice of the same width. */
  amountRow: {
    flexDirection: 'row',
  },
  amountButton: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 2,
  },
  amountLabel: {
    flexShrink: 1,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '900',
  },
}));

let messageCounter = 0;
const nextMessageId = () => `msg_${Date.now()}_${messageCounter++}`;

interface ChatComposerProps {
  placeholder: string;
  /** True while a write or an answer is in flight. */
  busy: boolean;
  onSend: (text: string) => void;
}

/**
 * The message box, with the draft text kept inside it.
 *
 * The draft used to live on the chat itself, so every keystroke re-rendered
 * the whole sheet — the transcript, the quick replies, the lot — while the
 * dashboard behind it re-rendered the chat every two seconds on its own
 * telemetry tick. Under that much churn Android restarts the input method
 * mid-word (`keyboardDidShow` fired nine times while typing a single
 * sentence), which is what made the keyboard feel unstable. Memoised and
 * holding its own state, this re-renders on a keystroke and nothing else does.
 */
const ChatComposer = React.memo(function ChatComposer({
  placeholder,
  busy,
  onSend,
}: ChatComposerProps) {
  useThemeMode();
  const [text, setText] = useState('');

  const send = () => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setText('');
    onSend(trimmed);
  };

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: tone('rgba(255,255,255,0.05)', 'rgba(24,24,27,0.05)'),
        borderRadius: 24,
        paddingHorizontal: 16,
        borderWidth: 1,
        borderColor: tone('rgba(255,255,255,0.15)', 'rgba(24,24,27,0.19)'),
      }}
    >
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={placeholder}
        placeholderTextColor={tone('#475569', '#a1a1aa')}
        style={{ flex: 1, color: tone('#ffffff', '#18181b'), paddingVertical: 12, fontSize: 15 }}
        multiline
        blurOnSubmit={false}
      />
      <Pressable
        onPress={send}
        disabled={!text.trim() || busy}
        hitSlop={12}
        style={({ pressed }) => ({
          marginLeft: 8,
          paddingVertical: 8,
          opacity: pressed ? 0.5 : 1,
        })}
      >
        <Send color={text.trim() ? tone('#00f2fe', '#0891b2') : tone('#475569', '#a1a1aa')} size={24} />
      </Pressable>
    </View>
  );
});

/**
 * The input row's container at the bottom of the chat sheet.
 *
 * Its own component so it can read the insets of the chat's own window — the
 * `SafeAreaProvider` inside the Modal — rather than the main window's, which
 * is what the floating button outside the Modal uses. The two can differ:
 * where Android keeps a dialog window clear of its navigation bar, the main
 * window's inset would add padding here that nothing calls for.
 *
 * Bottom padding: 16 while the keyboard is up, otherwise the row's usual
 * figure, or enough to clear the system navigation when that is taller.
 */
const ChatFooter: React.FC<{
  keyboardOpen: boolean;
  style: StyleProp<ViewStyle>;
  children: React.ReactNode;
}> = ({ keyboardOpen, style, children }) => {
  const insets = useSafeAreaInsets();
  const paddingBottom = keyboardOpen
    ? 16
    : footerBottomPadding(Platform.OS === 'android' ? 44 : 48, insets.bottom);
  return <View style={[style, { paddingBottom }]}>{children}</View>;
};

const AquaSageChat: React.FC<AquaSageChatProps> = ({ userProfile, onLogWater }) => {
  // Both this component and its composer are memoised, so a dashboard
  // re-render does not reach them: each subscribes to the mode itself.
  useThemeMode();
  // The system navigation's share of the bottom of the screen.
  const insets = useSafeAreaInsets();
  const [isOpen, setIsOpen] = useState(false);
  const [logFlow, setLogFlow] = useState<LogFlowState>('idle');
  /**
   * Mirrors `logFlow` for the reminder listener, which is registered once and
   * would otherwise read the value captured on the first render.
   */
  const logFlowRef = useRef<LogFlowState>('idle');
  useEffect(() => {
    logFlowRef.current = logFlow;
  }, [logFlow]);

  /**
   * Options are meant to be tapped, not typed at, so the keyboard is put away
   * whenever a new set appears.
   *
   * Two things went wrong with it up. The sheet shrinks to make room, which
   * pushes the buttons under the keyboard; and while a `TextInput` holds
   * focus, the first touch elsewhere is spent dismissing the keyboard rather
   * than pressing what it landed on — so selecting an option took two taps,
   * the first of which looked like nothing happening.
   *
   * This fires only when the options change or the sheet opens, so a user who
   * deliberately taps the input to type an amount keeps their keyboard.
   */
  useEffect(() => {
    if (isOpen && logFlow !== 'idle') {
      Keyboard.dismiss();
    }
  }, [isOpen, logFlow]);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: nextMessageId(),
      role: 'assistant',
      content: withHydrationTip(INITIAL_GREETING),
      timestamp: new Date(),
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  /** Label of the quick reply currently being written, so it can show a spinner. */
  const [pendingReply, setPendingReply] = useState<string | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  /** Latest `handleSend`, so `submitMessage` can stay identity-stable. */
  const handleSendRef = useRef<(text: string) => Promise<void>>(async () => {});
  /**
   * The teaser cycles rather than sitting there permanently: one line fades in,
   * holds long enough to read, fades out, and after a quiet beat the next one
   * arrives. The gap matters as much as the message — it is what keeps the
   * bubble from parking over the dashboard's lower metric cards.
   */
  const [teaserIndex, setTeaserIndex] = useState(0);
  /**
   * Hidden while the sheet is open, and brought back when it closes. It used
   * to hide for good on the first touch, so one accidental tap removed it
   * until the app was restarted.
   */
  const [teaserShown, setTeaserShown] = useState(true);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  /**
   * Set once an answer has been outstanding long enough that the silence needs
   * explaining. Shown beside the spinner, never posted as a message — it is a
   * status, not something the assistant said.
   */
  const [slowResponse, setSlowResponse] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const { width: windowWidth } = useWindowDimensions();
  /**
   * Screen height, not window height.
   *
   * The activity is `adjustResize`, so the *window* shrinks when the keyboard
   * opens — and it does so on its own schedule, a frame or two apart from the
   * `keyboardDidShow` event. Sizing the sheet from a value that is itself
   * moving, while also subtracting the keyboard, meant the height was computed
   * from two disagreeing measurements of the same thing and settled somewhere
   * new on every frame: the jitter you feel as soon as you start typing.
   * Screen metrics are fixed, so the keyboard is subtracted exactly once.
   */
  const screenHeight = Dimensions.get('screen').height;

  /**
   * Quick-reply buttons are sized in pixels rather than by flex.
   *
   * Laid out with `flex`/`alignSelf: 'stretch'` they collapsed to zero width
   * inside the sheet: the fixed-size icon still drew (which is all that was
   * visible), while the flexible label and the button's own background and
   * border measured to nothing. Deriving the width from the window instead of
   * from an ancestor's measurement removes every chance of that — the buttons
   * cannot be narrower than the space they are given.
   */
  const QUICK_REPLY_GAP = 10;
  const quickReplyWidth = windowWidth - SHEET_SIDE_PADDING * 2;
  const amountCount = Math.max(1, quickLogAmounts().length);
  const amountButtonWidth =
    (quickReplyWidth - QUICK_REPLY_GAP * (amountCount - 1)) / amountCount;

  // RN's Modal opens its own Android window, which never inherits the
  // activity's `adjustResize`, so KeyboardAvoidingView can't lift the input.
  // Tracking the keyboard directly is the only reliable option here.
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, e => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Leave room for the status bar so the sheet never runs off the top.
  const SHEET_TOP_GAP = 60;
  /**
   * Floor for the sheet: a small screen with a tall keyboard must still leave
   * room for the quick replies and the input, even if that means the sheet
   * reaches behind the keyboard.
   */
  const MIN_SHEET_HEIGHT = 420;
  const sheetHeight = Math.max(
    MIN_SHEET_HEIGHT,
    Math.min(screenHeight * 0.82, screenHeight - keyboardHeight - SHEET_TOP_GAP)
  );

  /**
   * Kept to roughly one length. The bubble holds its position while the text
   * inside it changes, so lines of wildly different widths would make its
   * edges twitch on every swap.
   */
  const teasers = [
    'How can I help you? 💧',
    'Feeling thirsty?',
    'Ask me anything!',
    'Water check-in?',
    'Hydration tips?',
    'Need a tip? 💧',
  ];

  /** How long a line is readable before it hands over to the next. */
  const TEASER_HOLD_MS = 3800;
  /** The two halves of the cross-fade. */
  const TEASER_FADE_OUT_MS = 420;
  const TEASER_FADE_IN_MS = 520;
  /** How long the bubble stays up before tucking itself away (about 5 lines). */
  const TEASER_VISIBLE_MS = 20000;

  /**
   * React Native's own Animated, not Reanimated. The bubble used Reanimated's
   * `entering`/`layout` animations and a worklet callback to swap the text;
   * on a release build of the new architecture those did not reliably run,
   * which left the bubble invisible (or empty after its first fade-out).
   * Plain Animated driven from JS has no such dependency.
   */
  const teaserOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Nothing to say while the sheet is open — the chat is right there.
    if (isOpen || !teaserShown) return;

    let cancelled = false;
    Animated.timing(teaserOpacity, {
      toValue: 1,
      duration: TEASER_FADE_IN_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

    const interval = setInterval(() => {
      // Fade out, swap the line while invisible, fade back in.
      Animated.timing(teaserOpacity, {
        toValue: 0,
        duration: TEASER_FADE_OUT_MS,
        useNativeDriver: true,
      }).start(() => {
        if (cancelled) return;
        setTeaserIndex(prev => (prev + 1) % teasers.length);
        Animated.timing(teaserOpacity, {
          toValue: 1,
          duration: TEASER_FADE_IN_MS,
          useNativeDriver: true,
        }).start();
      });
    }, TEASER_HOLD_MS);

    // Then tuck it away. Left up permanently it covered whatever sat under
    // it — on a small phone, the Quick Fluid Log buttons and the end of the
    // streak row — and a tap meant for those opened the chat instead.
    const hide = setTimeout(() => {
      Animated.timing(teaserOpacity, {
        toValue: 0,
        duration: TEASER_FADE_OUT_MS,
        useNativeDriver: true,
      }).start(() => {
        if (!cancelled) setTeaserShown(false);
      });
    }, TEASER_VISIBLE_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
      clearTimeout(hide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, teaserShown, teaserOpacity]);

  // Back to the app from elsewhere: offer help again.
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') setTeaserShown(true);
    });
    return () => sub.remove();
  }, []);

  // Server Discovery Logic
  /**
   * The backend address, resolved once per app run and shared with the config
   * service — see `resolveBackendUrl`. The chat used to run its own probe,
   * which meant a second cold start on a sleeping host for no benefit.
   */
  const discoverServer = async (): Promise<string | null> => {
    const base = await resolveBackendUrl();
    setServerUrl(base);
    return base;
  };

  // Opening the sheet is late to start waking a sleeping backend, so the app
  // also warms it on launch and on every foreground (see HomeScreen). This is
  // the backstop for a session that never hit either.
  useEffect(() => {
    if (isOpen) {
      discoverServer();
      warmBackend();
    }
  }, [isOpen]);

  /**
   * Idempotency key for the entry the current reminder conversation will
   * produce. Every tap on every reminder maps to one prompt, and that prompt
   * carries one request id, so the conversation can only ever write one row.
   */
  const flowRequestIdRef = useRef<string | null>(null);
  /** Guards against two writes overlapping (double tap, send + button). */
  const isLoggingRef = useRef(false);

  const toggleChat = () => {
    // Closing the sheet resumes on the next line, at full opacity — the cycle
    // may have been interrupted part-way through a fade.
    if (isOpen) {
      setTeaserIndex(prev => (prev + 1) % teasers.length);
      teaserOpacity.setValue(0);
      setTeaserShown(true);
    }
    setIsOpen(!isOpen);
  };

  const clearChat = () => {
    setLogFlow('idle');
    flowRequestIdRef.current = null;
    HydrationPromptSession.reset();
    setMessages([
      {
        id: nextMessageId(),
        role: 'assistant',
        content: withHydrationTip(INITIAL_GREETING),
        timestamp: new Date(),
      },
    ]);
  };

  const appendMessage = (role: Message['role'], content: string): string => {
    const id = nextMessageId();
    setMessages(prev => [...prev, { id, role, content, timestamp: new Date() }]);
    return id;
  };

  /**
   * The only way the assistant speaks. Every reply — prompt, confirmation,
   * error or AI answer — closes with exactly one fresh hydration tip, so the
   * rule holds in one place instead of at a dozen call sites.
   */
  const appendAssistant = (content: string): string =>
    appendMessage('assistant', withHydrationTip(content));

  // A reminder tap opens the chat. Whether it *also* asks the logging question
  // is decided by the prompt session: the first tap asks, every later tap
  // (second reminder, tenth reminder, a replayed press) just brings the chat
  // back to the conversation that is already running.
  useEffect(() => {
    const subscription = ChatBus.onOpenHydrationPrompt(async ({ eventId, force }) => {
      // The OS can deliver one press through three paths (foreground listener,
      // background replay, cold start). Opening on every delivery makes the
      // chat re-open under the user again and again, so a repeat is dropped
      // before anything happens. A tap in the bell menu is a real, separate
      // action and always counts.
      const isNewPress = await HydrationPromptSession.claimEvent(eventId);
      if (!isNewPress && !force) return;

      setIsOpen(true);

      // A conversation already on screen is left alone — this press only
      // brings it back to the front. Re-asking mid-flow would talk over the
      // question the user is already looking at.
      //
      // Reading the flow through a ref: this listener is registered once, so
      // `logFlow` here would be the value captured on the first render.
      if (logFlowRef.current !== 'idle') return;

      // Nothing in progress, so this reminder starts a fresh cycle and asks
      // the opening question. `beginPrompt`'s own re-ask cooldown is
      // deliberately not consulted: it is keyed to a conversation that lives
      // in component state and dies with the app, so after a restart it would
      // suppress the question while leaving nothing on screen in its place.
      await HydrationPromptSession.beginPrompt();

      flowRequestIdRef.current = `notif:${eventId}`;
      setLogFlow('awaiting_choice');
      appendAssistant(HYDRATION_PROMPT);
    });
    return () => subscription.remove();
  }, []);

  /**
   * The one place the chat writes an entry, whatever triggered it.
   *
   * A failed write deliberately leaves `logFlow` where it was. Closing the flow
   * on failure took the quick-reply buttons off screen and left the user with
   * no way to retry — which is exactly what "the buttons don't work" looked
   * like once a write started failing.
   */
  const commitLog = async (amountMl: number, fallbackRequestId: string) => {
    if (isLoggingRef.current) return;
    isLoggingRef.current = true;

    // A reminder-driven entry reuses the reminder's id so retries collapse.
    const requestId = flowRequestIdRef.current ?? fallbackRequestId;
    setIsLoading(true);

    try {
      const result = onLogWater
        ? await onLogWater(amountMl, requestId)
        : await HydrationService.logWater({ amountMl, source: 'ai_chat', requestId });

      if (result.status === 'unauthenticated') {
        appendAssistant(NO_AUTH_MESSAGE);
        setLogFlow('awaiting_amount');
      } else if (result.status === 'error') {
        console.error('[Vari] Hydration write rejected:', result.error);
        appendAssistant(ERROR_MESSAGE);
        setLogFlow('awaiting_amount');
      } else {
        appendAssistant(buildLogConfirmation(result));
        // The entry landed: release the reminder id and let a future reminder
        // cycle start a fresh conversation.
        flowRequestIdRef.current = null;
        await HydrationPromptSession.reset();
        setLogFlow('idle');
      }
    } catch (error) {
      console.error('[Vari] Failed to log water:', error);
      appendAssistant(ERROR_MESSAGE);
      setLogFlow('awaiting_amount');
    } finally {
      setIsLoading(false);
      isLoggingRef.current = false;
    }
  };

  /**
   * Takes an amount back off today's total and reports what actually changed.
   *
   * The reply names the resulting total rather than just acknowledging: the
   * reported defect was that the dashboard did not reflect the request, so the
   * chat now states the number the user can go and check.
   */
  const commitCorrection = async (amountMl: number) => {
    if (isLoggingRef.current) return;
    isLoggingRef.current = true;
    setIsLoading(true);

    try {
      const result = await HydrationService.adjustIntake({ amountMl });

      if (result.status === 'unauthenticated') {
        appendAssistant(NO_AUTH_MESSAGE);
        return;
      }
      if (result.status === 'error') {
        appendAssistant(
          result.error === 'Nothing logged today to take back.'
            ? "**Nothing to take back** — you haven't logged any water today yet."
            : ERROR_MESSAGE
        );
        return;
      }

      const removed = result.adjustedMl ?? amountMl;
      const askedForMore = removed < amountMl;
      appendAssistant(
        `**Removed ${formatMl(removed)}.**` +
          (askedForMore ? " That's everything logged today." : '') +
          ` Today's total is now **${formatMl(result.totalMl)}**.`
      );
    } catch (error) {
      console.error('[Vari] Failed to adjust intake:', error);
      appendAssistant(ERROR_MESSAGE);
    } finally {
      setIsLoading(false);
      isLoggingRef.current = false;
    }
  };

  /** Sends the question to the RAG backend and appends the answer. */
  const askBackend = async (text: string) => {
    setIsLoading(true);
    setSlowResponse(false);
    // A spinner that has been turning for five seconds reads as a broken app.
    // Saying *why* it is slow costs nothing and is true.
    const slowTimer = setTimeout(() => setSlowResponse(true), SLOW_RESPONSE_NOTICE_MS);

    try {
      const chatHistory = messages.slice(-5).map(m => ({
        role: m.role,
        content: m.content
      }));

      let activeBase = serverUrl;
      if (!activeBase) {
        activeBase = await discoverServer();
      }
      if (!activeBase) {
        throw new Error('Backend not reachable on any known address.');
      }

      const url = `${activeBase}/chat`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Only sent when configured: a local server runs without the check.
          ...(BACKEND_API_KEY ? { 'X-API-Key': BACKEND_API_KEY } : {}),
        },
        body: JSON.stringify({
          question: text,
          chatHistory,
          userProfile: userProfile || {}
        }),
      });

      if (!response.ok) throw new Error('AI Server responded with an error.');

      const data = await response.json();
      appendAssistant(data.answer || 'No response from AI.');
    } catch (error: any) {
      console.error('[Vari] Chat request failed:', error?.message ?? error);

      // What the user needs is "try again", not a list of IP addresses; the
      // addresses go to the log, where a developer will actually look.
      console.warn('[Vari] Tried addresses:', backendCandidates().join(', '));
      if (Platform.OS === 'android') {
        console.warn('[Vari] Local backend? Run: adb reverse tcp:8000 tcp:8000');
      }

      appendMessage(
        'assistant',
        "**I couldn't reach the server just now.** Check your connection and ask again — the assistant sometimes needs a moment to wake up."
      );
    } finally {
      clearTimeout(slowTimer);
      setSlowResponse(false);
      setIsLoading(false);
    }
  };

  /**
   * Both branches of the prompt end up collecting an amount.
   *
   * The screen is updated in this tick and the latch is persisted afterwards.
   * Awaiting the AsyncStorage write first meant a tap sat there doing nothing
   * for a beat — which read as the button having missed the press, so the user
   * pressed again.
   */
  const resolveChoice = (choice: 'assisted' | 'manual') => {
    setLogFlow('awaiting_amount');
    appendAssistant(choice === 'assisted' ? AMOUNT_PROMPT : MANUAL_PROMPT);
    HydrationPromptSession.markResolved().catch(error =>
      console.error('[Vari] Failed to persist prompt state:', error)
    );
  };

  const cancelFlow = () => {
    flowRequestIdRef.current = null;
    setLogFlow('idle');
    appendAssistant(CANCEL_ACK);
    HydrationPromptSession.markResolved().catch(error =>
      console.error('[Vari] Failed to persist prompt state:', error)
    );
  };

  /** Reply to "Did you drink water?" — typed rather than tapped. */
  const handleChoiceReply = async (text: string, messageId: string) => {
    // An amount answers the question outright.
    const amountMl = parseIntakeMl(text);
    if (amountMl !== null) {
      await HydrationPromptSession.markResolved();
      // Move on first, so a failed write leaves the amount buttons on screen
      // rather than the choice buttons the user has already answered.
      setLogFlow('awaiting_amount');
      await commitLog(amountMl, `chat:${messageId}`);
      return;
    }

    if (MANUAL_INTENT.test(text)) return resolveChoice('manual');
    if (AI_INTENT.test(text)) return resolveChoice('assisted');
    if (CANCEL_INTENT.test(text)) return cancelFlow();

    // An unrelated question mid-flow is still a question — answer it and keep
    // the prompt open rather than dead-ending on a fallback message.
    if (looksLikeQuestion(text)) return askBackend(text);

    appendAssistant(CHOICE_FALLBACK);
  };

  const handleAmountReply = async (text: string, messageId: string) => {
    const amountMl = parseIntakeMl(text);
    if (amountMl !== null) {
      await commitLog(amountMl, `chat:${messageId}`);
      return;
    }

    if (CANCEL_INTENT.test(text)) return cancelFlow();
    if (looksLikeQuestion(text)) return askBackend(text);

    appendAssistant(AMOUNT_FALLBACK);
  };

  /**
   * Button taps dispatch on their action — no phrase is parsed back out.
   *
   * Deliberately not `async`: everything that can happen without a network
   * round trip happens synchronously, so the pill reacts on the press itself.
   * Only an actual intake write is awaited, and that button shows a spinner
   * while it runs.
   */
  const handleQuickReply = (reply: QuickReply) => {
    // If the keyboard is up from a half-typed message, put it away here too,
    // so the sheet is back to full size before the next set of options lands.
    Keyboard.dismiss();

    // Choosing a path only moves the conversation on — it writes nothing, so
    // it is deliberately not gated on an in-flight write. A guard that
    // silently swallows the tap is precisely what "the button does nothing"
    // looks like from the outside.
    if (reply.action.kind === 'choice') {
      appendMessage('user', reply.label);
      resolveChoice(reply.action.choice);
      return;
    }

    if (isLoggingRef.current || pendingReply) {
      // A write that never settles (a hung request, say) would otherwise leave
      // these guards raised forever, swallowing every tap in silence.
      console.warn(
        '[Vari] Ignoring amount tap; a write is still in flight:',
        reply.label
      );
      return;
    }
    const messageId = appendMessage('user', reply.label);

    const amountMl = parseIntakeMl(reply.action.text);
    if (amountMl === null) {
      appendAssistant(AMOUNT_FALLBACK);
      return;
    }

    setPendingReply(reply.label);
    commitLog(amountMl, `chat:${messageId}`)
      .catch(error => {
        console.error('[Vari] Quick reply failed:', error);
        appendAssistant(ERROR_MESSAGE);
      })
      .finally(() => setPendingReply(null));
  };

  /**
   * Handed to the memoised composer.
   *
   * Routed through a ref so its identity never changes: a new function on each
   * render would re-render the composer on every telemetry tick and undo the
   * memo that keeps the keyboard steady.
   */
  const submitMessage = useCallback((text: string) => {
    void handleSendRef.current(text);
  }, []);

  const handleSend = async (raw: string) => {
    const text = raw.trim();
    if (!text || isLoading) return;

    const messageId = appendMessage('user', text);

    if (logFlow === 'awaiting_amount') return handleAmountReply(text, messageId);
    if (logFlow === 'awaiting_choice') return handleChoiceReply(text, messageId);

    // A correction — "reduce 4 litres", "remove 500ml", "I logged too much" —
    // is handled before the logging intent, because the same sentence contains
    // an amount and would otherwise be read as an intake of it. That is
    // exactly what used to happen: "reduce 4 litre" added 4,000ml, tripped the
    // unrealistic-amount check, and left the day's total untouched.
    const parsed = matchIntake(text);
    if (parsed?.direction === 'remove') {
      await commitCorrection(parsed.amountMl);
      return;
    }

    // Logging never depends on a reminder: any message that reads as "log this
    // much water" is written straight away.
    const intent = detectHydrationLogIntent(text);
    if (intent.isLogRequest) {
      if (intent.amountMl !== null) {
        await commitLog(intent.amountMl, `chat:${messageId}`);
        return;
      }
      setLogFlow('awaiting_amount');
      appendAssistant(AMOUNT_PROMPT);
      return;
    }

    await askBackend(text);
  };

  handleSendRef.current = handleSend;

  useEffect(() => {
    if (scrollViewRef.current) {
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 200);
    }
  }, [messages, isLoading, keyboardHeight]);

  return (
    <>
      {/* Floating Action Button & Teaser Bubble */}
      {/* Clears the bottom navbar by 12px wherever the system navigation
          puts it (see `navLayout`), so the button sits beside the dashboard
          rather than on top of it. */}
      <View style={{ position: 'absolute', bottom: chatButtonBottom(insets.bottom), right: 20 + sideInset(insets.right), zIndex: 1000, alignItems: 'flex-end' }}>
        {!isOpen && teaserShown && (
          <Animated.View style={{ opacity: teaserOpacity, marginBottom: 10, marginRight: 2 }}>
            {/* Tapping the bubble opens the chat it is advertising. */}
            <Pressable
              onPress={toggleChat}
              accessibilityRole="button"
              accessibilityLabel="Open chat"
              style={{
                backgroundColor: tone('#002855', '#ffffff'),
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderRadius: 14,
                borderWidth: 1.5,
                // Light mode: a neutral grey outline defines the bubble, and
                // there is no shadow at all. The bubble fades in and out, and
                // Android draws an elevation shadow under a fading view as a
                // solid grey patch — a second bubble behind the real one.
                borderColor: tone('#ffffff', TEASER_BORDER_LIGHT),
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: tone(0.35, 0),
                shadowRadius: 6,
                elevation: tone(14, 0),
              }}
            >
              <Text
                numberOfLines={1}
                style={{
                  color: tone('#ffffff', '#18181b'),
                  fontSize: 11,
                  fontWeight: '800',
                  fontFamily: Platform.OS === 'android' ? 'monospace' : 'Menlo',
                  textAlign: 'center',
                }}
              >
                {teasers[teaserIndex]}
              </Text>
              {/* Bubble arrow */}
              <View
                style={{
                  position: 'absolute',
                  bottom: -6,
                  right: 18,
                  width: 10,
                  height: 10,
                  backgroundColor: tone('#002855', '#ffffff'),
                  borderRightWidth: 1.5,
                  borderBottomWidth: 1.5,
                  borderColor: tone('#ffffff', TEASER_BORDER_LIGHT),
                  transform: [{ rotate: '45deg' }],
                }}
              />
            </Pressable>
          </Animated.View>
        )}

        <TouchableOpacity
          onPress={toggleChat}
          activeOpacity={0.9}
          style={{
            width: 54,
            height: 54,
            borderRadius: 27,
            // A white disc with the accent icon in light mode. The cyan
            // disc's large shadow, made for a black page, showed on a light
            // one as a grey smudge around the button.
            backgroundColor: tone('#00f2fe', '#ffffff'),
            borderWidth: tone(0, 1),
            borderColor: tone('transparent', '#e4e4e7'),
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: tone('#00f2fe', '#000000'),
            shadowOffset: { width: 0, height: tone(8, 4) },
            shadowOpacity: tone(0.45, 0.1),
            shadowRadius: tone(12, 10),
            elevation: tone(12, 5),
          }}
        >
          {isOpen ? (
            <X color={tone('#020617', '#0e7490')} size={25} strokeWidth={3} />
          ) : (
            <MessageCircle
              color={tone('#020617', '#0e7490')}
              size={27}
              fill={tone('#020617', '#0e7490')}
              fillOpacity={0.1}
              strokeWidth={2.5}
            />
          )}
        </TouchableOpacity>
      </View>

      <Modal
        visible={isOpen}
        transparent
        animationType="slide"
        onRequestClose={toggleChat}
        statusBarTranslucent
      >
        {/* The Modal is a native window of its own, and whether it runs under
            Android's navigation is that window's business, not the main
            one's. This provider measures the insets of *this* window, which
            is what `ChatFooter` pads the input row from. */}
        <SafeAreaProvider>
        {/* RN's Modal opens its own native window, which sits outside the
            GestureHandlerRootView at the app root. Without its own root here,
            gesture-handler swallows touches inside the sheet on Android. */}
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: tone('rgba(0,0,0,0.75)', 'rgba(24,24,27,0.45)'), justifyContent: 'flex-end' }}>
          <View style={{ width: '100%', height: '100%', justifyContent: 'flex-end' }}>
            <TouchableOpacity
              activeOpacity={1}
              onPress={toggleChat}
              style={{ flex: 1 }}
            />

            {/* A plain View, not an Animated one. A Reanimated layout
                animation inside an RN Modal moves the rendered view on Android
                without moving its touch targets, which left the close X, the
                bin and the quick replies responding somewhere other than where
                they were drawn. The Modal's own `animationType` slides the
                sheet natively, targets and all. */}
            <View
              style={{
                height: sheetHeight,
                marginBottom: keyboardHeight,
                backgroundColor: tone('#020617', '#ffffff'),
                borderTopLeftRadius: 40,
                borderTopRightRadius: 40,
                borderTopWidth: 1,
                borderColor: tone('rgba(255,255,255,0.2)', 'rgba(24,24,27,0.24)'),
                overflow: 'hidden'
              }}
            >
              {/* Header */}
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 24,
                paddingVertical: 18,
                borderBottomWidth: 1,
                borderBottomColor: tone('rgba(255,255,255,0.05)', 'rgba(24,24,27,0.09)')
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ width: 40, height: 40, borderRadius: 20, overflow: 'hidden', marginRight: 12 }}>
                    <Image
                      source={{ uri: BOT_AVATAR_IMAGE }}
                      style={{ width: '100%', height: '100%' }}
                    />
                  </View>
                  <View>
                    <Text style={{ color: tone('#ffffff', '#18181b'), fontWeight: 'bold', fontSize: 16 }}>{ASSISTANT_NAME}</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <TouchableOpacity onPress={clearChat} style={{ padding: 10 }}>
                    <Trash2 color={tone('#475569', '#a1a1aa')} size={20} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={toggleChat} style={{ padding: 10 }}>
                    <X color={tone('#94a3b8', '#52525b')} size={24} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Messages */}
              <ScrollView
                ref={scrollViewRef}
                style={{ flex: 1, paddingHorizontal: 16, paddingTop: 16 }}
                contentContainerStyle={{ paddingBottom: 32 }}
                keyboardShouldPersistTaps="handled"
              >
                {messages.map((msg) => (
                  <View key={msg.id} style={{ flexDirection: 'row', marginBottom: 16, justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    {msg.role === 'assistant' && (
                      <View style={{ width: 32, height: 32, borderRadius: 16, overflow: 'hidden', marginRight: 8, alignSelf: 'flex-end', marginBottom: 2 }}>
                        <Image
                          source={{ uri: BOT_AVATAR_IMAGE }}
                          style={{ width: '100%', height: '100%' }}
                        />
                      </View>
                    )}
                    <View style={{
                      maxWidth: '85%',
                      padding: 16,
                      borderRadius: 20,
                      backgroundColor: msg.role === 'user' ? accentFill() : tone('rgba(255,255,255,0.05)', '#f4f4f5'),
                      borderWidth: msg.role === 'user' ? 0 : 1,
                      borderColor: tone('rgba(255,255,255,0.1)', '#e4e4e7'),
                      borderBottomLeftRadius: msg.role === 'assistant' ? 0 : 20,
                      borderTopRightRadius: msg.role === 'user' ? 0 : 20,
                    }}>
                      <Text style={{ fontSize: 14, lineHeight: 20, color: msg.role === 'user' ? onAccent() : tone('#e2e8f0', '#27272a') }}>
                        {msg.content.split(/(\*\*.*?\*\*)/g).map((part, i) => {
                          if (part.startsWith('**') && part.endsWith('**')) {
                            return (
                              <Text key={i} style={{ fontWeight: 'bold', color: msg.role === 'user' ? tone('#000000', '#ffffff') : tone('#ffffff', '#18181b') }}>
                                {part.slice(2, -2)}
                              </Text>
                            );
                          }
                          return <Text key={i}>{part}</Text>;
                        })}
                      </Text>
                    </View>
                  </View>
                ))}
                {isLoading && (
                  <View style={{ padding: 16, alignItems: 'flex-start', flexDirection: 'row' }}>
                    <View style={{ width: 32, height: 32, borderRadius: 16, overflow: 'hidden', marginRight: 8, alignSelf: 'flex-end' }}>
                      <Image
                        source={{ uri: BOT_AVATAR_IMAGE }}
                        style={{ width: '100%', height: '100%' }}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <ActivityIndicator size="small" color={tone('#00f2fe', '#0891b2')} style={{ alignSelf: 'flex-start' }} />
                      {slowResponse && (
                        <Text style={{ color: '#64748b', fontSize: 11, marginTop: 8, lineHeight: 16 }}>
                          Waking the assistant up — the first answer after a quiet spell takes a little longer.
                        </Text>
                      )}
                    </View>
                  </View>
                )}
              </ScrollView>

              {/* Input Area */}
              <ChatFooter keyboardOpen={keyboardHeight > 0} style={{
                paddingHorizontal: SHEET_SIDE_PADDING,
                paddingTop: 16,
                backgroundColor: tone('#01040a', '#ffffff'),
                borderTopWidth: 1,
                borderTopColor: tone('rgba(255,255,255,0.1)', 'rgba(24,24,27,0.14)')
              }}>
                {/* Quick replies for the guided hydration logging flow.
                    These wrap in a plain View rather than a horizontal
                    ScrollView: a nested scroll container inside the sheet
                    claimed the touch as a scroll gesture and the press never
                    reached the button.

                    The row stays mounted while a write is in flight — only the
                    tapped pill goes busy. Hiding the whole row mid-write left
                    the user staring at an empty gap with nothing to press. */}
                {logFlow !== 'idle' && (
                  <View style={{ paddingBottom: 12 }}>
                    <Text style={{
                      color: tone('#475569', '#a1a1aa'),
                      fontSize: 9,
                      fontWeight: '800',
                      letterSpacing: 1,
                      textTransform: 'uppercase',
                      marginBottom: 8,
                    }}>
                      {logFlow === 'awaiting_amount' ? 'Pick an amount' : 'Choose one'}
                    </Text>
                    {/* Choices stack full width; amounts share one row. Both
                        take an explicit pixel width computed from the window,
                        so a button is never sized by its own text (which used
                        to push it outside its parent, where Android delivers no
                        touches) nor by an ancestor's measurement (which was
                        collapsing them to nothing). */}
                    <View style={logFlow === 'awaiting_amount' ? styles.amountRow : undefined}>
                      {quickRepliesFor(logFlow).map((reply, index) => {
                        const isPending = pendingReply === reply.label;
                        const isBusy = pendingReply !== null;
                        const isPrimary = reply.tone === 'primary';
                        const isChoice = reply.action.kind === 'choice';
                        // Only an amount writes anything, so only an amount can
                        // be blocked by a write already in flight.
                        const disabled = isBusy && !isChoice;
                        const ChoiceIcon =
                          reply.action.kind === 'choice' && reply.action.choice === 'assisted'
                            ? Droplets
                            : Pencil;
                        const ink = isPrimary ? onAccent() : accent();

                        return (
                          // `TouchableOpacity`, not `Pressable` with
                          // `android_ripple`. Passing a ripple `color` without
                          // `foreground` makes RN set `nativeBackgroundAndroid`,
                          // and that native drawable *replaces* the view's
                          // background — so `backgroundColor` and the border
                          // silently vanished while the label kept rendering.
                          // That is why the filled button looked empty: its
                          // near-black text was sitting on the sheet with no
                          // cyan behind it. Every other button in this app uses
                          // TouchableOpacity, and they all draw correctly.
                          <TouchableOpacity
                            key={reply.label}
                            onPress={() => handleQuickReply(reply)}
                            disabled={disabled}
                            activeOpacity={0.75}
                            accessibilityRole="button"
                            accessibilityLabel={reply.label}
                            style={[
                              isChoice ? styles.choiceButton : styles.amountButton,
                              {
                                width: isChoice ? quickReplyWidth : amountButtonWidth,
                                marginLeft: !isChoice && index > 0 ? QUICK_REPLY_GAP : 0,
                                borderColor: isPrimary ? accentFill() : tone('rgba(0,242,254,0.5)', 'rgba(8,145,178,0.4)'),
                                backgroundColor: isPrimary ? accentFill() : tone('rgba(0,242,254,0.1)', 'rgba(8,145,178,0.07)'),
                                opacity: disabled && !isPending ? 0.4 : 1,
                              },
                            ]}
                          >
                            {isPending ? (
                              <ActivityIndicator size="small" color={ink} />
                            ) : (
                              isChoice && (
                                <View
                                  style={[
                                    styles.choiceIcon,
                                    {
                                      backgroundColor: isPrimary
                                        ? tone('rgba(2,6,23,0.14)', 'rgba(255,255,255,0.2)')
                                        : tone('rgba(0,242,254,0.14)', 'rgba(8,145,178,0.12)'),
                                    },
                                  ]}
                                >
                                  <ChoiceIcon color={ink} size={17} strokeWidth={2.75} />
                                </View>
                              )
                            )}
                            <Text
                              numberOfLines={1}
                              // `flexShrink` is what makes a long label shorten
                              // instead of stretching the button past the edge
                              // of its container.
                              style={[
                                isChoice ? styles.choiceLabel : styles.amountLabel,
                                { color: ink },
                              ]}
                            >
                              {isPending ? 'Saving…' : reply.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}

                <ChatComposer
                  placeholder={
                    logFlow === 'awaiting_amount'
                      ? 'e.g. 500 ml or 1.5 litres...'
                      : logFlow === 'awaiting_choice'
                      ? 'Tap an option, or type the amount'
                      : 'Ask, or log water (e.g. "I drank 500 ml")'
                  }
                  busy={isLoading}
                  onSend={submitMessage}
                />
                <Text style={{ color: tone('#475569', '#a1a1aa'), fontSize: 9, textAlign: 'center', marginTop: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {ASSISTANT_NAME} answers on hydration only, from getVāri's research documents
                </Text>
              </ChatFooter>
            </View>
          </View>
        </GestureHandlerRootView>
        </SafeAreaProvider>
      </Modal>
    </>
  );
};

/**
 * Memoised because the dashboard that renders it re-renders every two seconds
 * on its telemetry tick, and the chat has no reason to follow: its props change
 * only when the profile is reloaded. Without this, the sheet — and the text
 * input inside it — was rebuilt under the user's fingers twice a second.
 */
export default React.memo(AquaSageChat);
