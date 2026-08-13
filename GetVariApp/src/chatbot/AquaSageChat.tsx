import React, { useState, useRef, useEffect } from 'react';
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
  Modal,
  Image,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { MessageCircle, X, Send, Trash2, Droplets, Pencil } from 'lucide-react-native';
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
} from 'react-native-reanimated';
import { backendCandidates } from '../config/backend';
import ChatBus from '../services/ChatBus';
import HydrationService from '../services/HydrationService';
import HydrationPromptSession from '../services/HydrationPromptSession';
import { parseIntakeMl } from '../utils/parseIntake';
import { detectHydrationLogIntent, looksLikeQuestion } from '../utils/hydrationIntent';
import { buildLogConfirmation } from '../utils/hydrationFormat';
import { withHydrationTip } from '../utils/hydrationTips';
import { QUICK_LOG_AMOUNTS } from '../utils/hydrationAmounts';
import type { HydrationLogResult } from '../types';

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

const INITIAL_GREETING = "Hi, I'm **AquaSage AI**! 💧 How can I help?";
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
const QUICK_REPLIES: Record<Exclude<LogFlowState, 'idle'>, QuickReply[]> = {
  // No emoji in the label: the icon is drawn as its own element, and the label
  // also becomes the user's chat message, where it reads better as plain text.
  awaiting_choice: [
    { label: 'Log it for me', action: { kind: 'choice', choice: 'assisted' }, tone: 'primary' },
    { label: "I'll do it manually", action: { kind: 'choice', choice: 'manual' } },
  ],
  // Derived from the shared list, so the chat and the home screen's quick-log
  // sheet always offer the same amounts.
  awaiting_amount: QUICK_LOG_AMOUNTS.map(({ label, primary }) => ({
    label,
    action: { kind: 'amount', text: label },
    tone: primary ? 'primary' : undefined,
  })),
};

/** Horizontal padding of the sheet's input area, which the buttons sit in. */
const SHEET_SIDE_PADDING = 16;

const styles = StyleSheet.create({
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
});

let messageCounter = 0;
const nextMessageId = () => `msg_${Date.now()}_${messageCounter++}`;

const AquaSageChat: React.FC<AquaSageChatProps> = ({ userProfile, onLogWater }) => {
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
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  /** Label of the quick reply currently being written, so it can show a spinner. */
  const [pendingReply, setPendingReply] = useState<string | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const [teaserText, setTeaserText] = useState('I can help you! 💧');
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();

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
  const amountButtonWidth =
    (quickReplyWidth - QUICK_REPLY_GAP * (QUICK_LOG_AMOUNTS.length - 1)) /
    QUICK_LOG_AMOUNTS.length;

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
   * Floor for the sheet, and the reason it exists.
   *
   * Android resizes the window when the keyboard opens, so `windowHeight` has
   * often *already* lost the keyboard by the time `keyboardDidShow` reports
   * its height. Subtracting it again double-counts the keyboard and collapses
   * the sheet — which squeezed the quick replies down to nothing, and left the
   * two measurements fighting each other frame to frame (the visible
   * flicker). Clamping to a usable height makes a bad measurement harmless and
   * gives the layout a single stable resting point.
   */
  const MIN_SHEET_HEIGHT = 420;
  const sheetHeight = Math.max(
    MIN_SHEET_HEIGHT,
    Math.min(windowHeight * 0.82, windowHeight - keyboardHeight - SHEET_TOP_GAP)
  );

  const teasers = [
    "I can help you! 💧",
    "Confused about hydration?",
    "Want to know some facts?",
    "Ask me about getVāri!",
    "Need hydration advice?",
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setTeaserText(prev => {
        const currentIndex = teasers.indexOf(prev);
        const nextIndex = (currentIndex + 1) % teasers.length;
        return teasers[nextIndex];
      });
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Server Discovery Logic
  const discoverServer = async () => {
    const candidates = backendCandidates();

    for (const base of candidates) {
      try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 2500);
        const res = await fetch(`${base}/ping`, { signal: controller.signal });
        clearTimeout(id);
        if (res.ok) {
          console.log('[AquaSage] Backend found at', base);
          setServerUrl(base);
          return base;
        }
      } catch (e: any) {
        console.log(`[AquaSage] No backend at ${base}: ${e?.message ?? e}`);
      }
    }
    console.warn('[AquaSage] No backend found on any candidate address.');
    return null;
  };

  useEffect(() => {
    if (isOpen) discoverServer();
  }, [isOpen]);

  /**
   * Idempotency key for the entry the current reminder conversation will
   * produce. Every tap on every reminder maps to one prompt, and that prompt
   * carries one request id, so the conversation can only ever write one row.
   */
  const flowRequestIdRef = useRef<string | null>(null);
  /** Guards against two writes overlapping (double tap, send + button). */
  const isLoggingRef = useRef(false);

  const toggleChat = () => setIsOpen(!isOpen);

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
        console.error('[AquaSage] Hydration write rejected:', result.error);
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
      console.error('[AquaSage] Failed to log water:', error);
      appendAssistant(ERROR_MESSAGE);
      setLogFlow('awaiting_amount');
    } finally {
      setIsLoading(false);
      isLoggingRef.current = false;
    }
  };

  /** Sends the question to the RAG backend and appends the answer. */
  const askBackend = async (text: string) => {
    setIsLoading(true);

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
        headers: { 'Content-Type': 'application/json' },
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
      console.error('[AquaSage] Chat request failed:', error?.message ?? error);
      appendMessage(
        'assistant',
        `Error: Unable to reach AI server (${error?.message ?? 'unknown error'}). Ensure your backend is running.`
      );
    } finally {
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
      console.error('[AquaSage] Failed to persist prompt state:', error)
    );
  };

  const cancelFlow = () => {
    flowRequestIdRef.current = null;
    setLogFlow('idle');
    appendAssistant(CANCEL_ACK);
    HydrationPromptSession.markResolved().catch(error =>
      console.error('[AquaSage] Failed to persist prompt state:', error)
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
        '[AquaSage] Ignoring amount tap; a write is still in flight:',
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
        console.error('[AquaSage] Quick reply failed:', error);
        appendAssistant(ERROR_MESSAGE);
      })
      .finally(() => setPendingReply(null));
  };

  const handleSend = async (override?: string) => {
    const text = (override ?? input).trim();
    if (!text || isLoading) return;

    const messageId = appendMessage('user', text);
    setInput('');

    if (logFlow === 'awaiting_amount') return handleAmountReply(text, messageId);
    if (logFlow === 'awaiting_choice') return handleChoiceReply(text, messageId);

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

  useEffect(() => {
    if (scrollViewRef.current) {
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 200);
    }
  }, [messages, isLoading, keyboardHeight]);

  return (
    <>
      {/* Floating Action Button & Teaser Bubble */}
      <View style={{ position: 'absolute', bottom: 120, right: 24, zIndex: 1000, alignItems: 'flex-end' }}>
        {!isOpen && (
          <Animated.View
            entering={FadeIn}
            exiting={FadeOut}
            style={{
              marginBottom: 16,
              marginRight: 4,
              backgroundColor: '#002855',
              paddingHorizontal: 18,
              paddingVertical: 12,
              borderRadius: 20,
              borderWidth: 2,
              borderColor: '#ffffff',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.4,
              shadowRadius: 10,
              elevation: 10,
            }}
          >
            <Text style={{
              color: '#ffffff',
              fontSize: 13,
              fontWeight: '900',
              fontFamily: Platform.OS === 'android' ? 'monospace' : 'Menlo',
              textAlign: 'center'
            }}>
              {teaserText}
            </Text>
            {/* Bubble arrow */}
            <View
              style={{
                position: 'absolute',
                bottom: -10,
                right: 24,
                width: 16,
                height: 16,
                backgroundColor: '#002855',
                borderRightWidth: 2,
                borderBottomWidth: 2,
                borderColor: '#ffffff',
                transform: [{ rotate: '45deg' }]
              }}
            />
          </Animated.View>
        )}

        <TouchableOpacity
          onPress={toggleChat}
          activeOpacity={0.9}
          style={{
            width: 72,
            height: 72,
            borderRadius: 36,
            backgroundColor: '#00f2fe',
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#00f2fe',
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.5,
            shadowRadius: 15,
            elevation: 15,
          }}
        >
          {isOpen ? (
            <X color="#020617" size={32} strokeWidth={3} />
          ) : (
            <MessageCircle color="#020617" size={36} fill="#020617" fillOpacity={0.1} strokeWidth={2.5} />
          )}
        </TouchableOpacity>
      </View>

      <Modal
        visible={isOpen}
        transparent
        animationType="fade"
        onRequestClose={toggleChat}
        statusBarTranslucent
      >
        {/* RN's Modal opens its own native window, which sits outside the
            GestureHandlerRootView at the app root. Without its own root here,
            gesture-handler swallows touches inside the sheet on Android. */}
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' }}>
          <View style={{ width: '100%', height: '100%', justifyContent: 'flex-end' }}>
            <TouchableOpacity
              activeOpacity={1}
              onPress={toggleChat}
              style={{ flex: 1 }}
            />

            <Animated.View
              entering={SlideInDown.duration(300)}
              exiting={SlideOutDown.duration(250)}
              style={{
                height: sheetHeight,
                marginBottom: keyboardHeight,
                backgroundColor: '#020617',
                borderTopLeftRadius: 40,
                borderTopRightRadius: 40,
                borderTopWidth: 1,
                borderColor: 'rgba(255,255,255,0.2)',
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
                borderBottomColor: 'rgba(255,255,255,0.05)'
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ width: 40, height: 40, borderRadius: 20, overflow: 'hidden', marginRight: 12 }}>
                    <Image
                      source={{ uri: BOT_AVATAR_IMAGE }}
                      style={{ width: '100%', height: '100%' }}
                    />
                  </View>
                  <View>
                    <Text style={{ color: '#ffffff', fontWeight: 'bold', fontSize: 16 }}>AquaSage AI</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <TouchableOpacity onPress={clearChat} style={{ padding: 10 }}>
                    <Trash2 color="#475569" size={20} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={toggleChat} style={{ padding: 10 }}>
                    <X color="#94a3b8" size={24} />
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
                      backgroundColor: msg.role === 'user' ? '#00f2fe' : 'rgba(255,255,255,0.05)',
                      borderWidth: msg.role === 'user' ? 0 : 1,
                      borderColor: 'rgba(255,255,255,0.1)',
                      borderBottomLeftRadius: msg.role === 'assistant' ? 0 : 20,
                      borderTopRightRadius: msg.role === 'user' ? 0 : 20,
                    }}>
                      <Text style={{ fontSize: 14, lineHeight: 20, color: msg.role === 'user' ? '#020617' : '#e2e8f0' }}>
                        {msg.content.split(/(\*\*.*?\*\*)/g).map((part, i) => {
                          if (part.startsWith('**') && part.endsWith('**')) {
                            return (
                              <Text key={i} style={{ fontWeight: 'bold', color: msg.role === 'user' ? '#000000' : '#ffffff' }}>
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
                    <ActivityIndicator size="small" color="#00f2fe" />
                  </View>
                )}
              </ScrollView>

              {/* Input Area */}
              <View style={{
                paddingHorizontal: SHEET_SIDE_PADDING,
                paddingTop: 16,
                paddingBottom: keyboardHeight > 0 ? 16 : Platform.OS === 'android' ? 44 : 48,
                backgroundColor: '#01040a',
                borderTopWidth: 1,
                borderTopColor: 'rgba(255,255,255,0.1)'
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
                      color: '#475569',
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
                      {QUICK_REPLIES[logFlow].map((reply, index) => {
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
                        const ink = isPrimary ? '#020617' : '#00f2fe';

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
                                borderColor: isPrimary ? '#00f2fe' : 'rgba(0,242,254,0.5)',
                                backgroundColor: isPrimary ? '#00f2fe' : 'rgba(0,242,254,0.1)',
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
                                        ? 'rgba(2,6,23,0.14)'
                                        : 'rgba(0,242,254,0.14)',
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

                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  borderRadius: 24,
                  paddingHorizontal: 16,
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.15)'
                }}>
                  <TextInput
                    value={input}
                    onChangeText={setInput}
                    placeholder={
                      logFlow === 'awaiting_amount'
                        ? 'e.g. 500 ml or 1.5 litres...'
                        : logFlow === 'awaiting_choice'
                        ? 'Tap an option, or type the amount'
                        : 'Ask, or log water (e.g. "I drank 500 ml")'
                    }
                    placeholderTextColor="#475569"
                    style={{ flex: 1, color: '#ffffff', paddingVertical: 12, fontSize: 15 }}
                    multiline
                    blurOnSubmit={false}
                  />
                  <Pressable
                    onPress={() => handleSend()}
                    disabled={!input.trim() || isLoading}
                    hitSlop={12}
                    style={({ pressed }) => ({
                      marginLeft: 8,
                      paddingVertical: 8,
                      opacity: pressed ? 0.5 : 1,
                    })}
                  >
                    <Send color={input.trim() ? '#00f2fe' : '#475569'} size={24} />
                  </Pressable>
                </View>
                <Text style={{ color: '#475569', fontSize: 9, textAlign: 'center', marginTop: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  AquaSage AI answers strictly from research documents
                </Text>
              </View>
            </Animated.View>
          </View>
        </GestureHandlerRootView>
      </Modal>
    </>
  );
};

export default AquaSageChat;
