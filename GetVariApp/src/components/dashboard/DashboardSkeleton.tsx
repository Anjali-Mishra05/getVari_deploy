import React, { useEffect } from 'react';
import { Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { CloudOff, RefreshCw } from 'lucide-react-native';

import GlassCard from '../GlassCard';
import { CARD_GAP, TILE_GAP, cardStyle, tileStyle } from './cardTheme';
import { themed, tone } from '../../theme/theme';

/**
 * What the dashboard shows while the profile and today's entries are being
 * read, and when that read did not come back.
 *
 * ## Why it is shaped like the dashboard
 *
 * It used to be a spinner in a card with three empty rounded rectangles under
 * it, sized to nothing in particular. On a phone that meant a screen of black
 * with a caption in it: the user could see the app was busy, but not what it
 * was about to show them, and the moment the data arrived every element on
 * screen moved. The placeholders below stand where the real cards stand and
 * are the height the real cards are, so loading reads as the dashboard
 * arriving rather than as an empty screen, and nothing jumps when it does.
 *
 * ## Why it can also be an error
 *
 * The same component carries the offline state, because it is the same
 * moment: the layout is still a promise of the dashboard, only now the app
 * has to say that the promise is stuck and offer the way out of it. Leaving
 * the shimmer running forever — which is what a screen with no error state
 * does — tells the user to keep waiting for something that is not coming.
 */

/** How long one sweep of the shimmer takes, in each direction. */
const PULSE_MS = 900;

/**
 * One placeholder.
 *
 * All of them breathe on a single shared clock rather than one timer each, so
 * the screen pulses as a whole and the animation costs one worklet however
 * many blocks are on it.
 */
const Block: React.FC<{
  height: number;
  width?: number | string;
  radius?: number;
  style?: ViewStyle;
  progress: SharedValue<number>;
}> = ({ height, width = '100%', radius = 10, style, progress }) => {
  const animated = useAnimatedStyle(() => ({ opacity: progress.value }));
  return (
    <Animated.View
      style={[
        {
          height,
          width: width as any,
          borderRadius: radius,
          backgroundColor: tone('rgba(255,255,255,0.07)', 'rgba(24,24,27,0.08)'),
        },
        style,
        animated,
      ]}
    />
  );
};

interface Props {
  /**
   * The read failed rather than being slow — usually no network. The shimmer
   * stops and the card at the top becomes the retry.
   */
  offline?: boolean;
  /** A retry is in flight; the button says so and cannot be pressed twice. */
  retrying?: boolean;
  /** Try the read again now, without waiting for the automatic attempt. */
  onRetry?: () => void;
  /** Seconds until the next automatic attempt, when one is scheduled. */
  retryInSeconds?: number | null;
}

const DashboardSkeleton: React.FC<Props> = ({
  offline = false,
  retrying = false,
  onRetry,
  retryInSeconds = null,
}) => {
  const progress = useSharedValue(0.45);

  useEffect(() => {
    if (offline) {
      // A stalled screen must not look busy. Held at a flat, dimmer value so
      // the placeholders read as "nothing here yet" rather than "loading".
      progress.value = withTiming(0.25, { duration: 200 });
      return;
    }
    progress.value = withRepeat(
      withTiming(0.95, { duration: PULSE_MS, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
  }, [offline, progress]);

  return (
    <View
      accessibilityLabel={
        offline ? "Can't reach your hydration data" : 'Loading your hydration data'
      }
    >
      {/* ------------------------------------------------ Status / retry */}
      {offline ? (
        <GlassCard adaptive
          className={themed('bg-amber-500/[0.06] border-amber-500/20')}
          style={{ ...cardStyle, flexDirection: 'row', alignItems: 'center', gap: 14 }}
        >
          <View className={themed('p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/20')}>
            <CloudOff color="#f59e0b" size={18} />
          </View>
          <View className={themed('flex-1')}>
            <Text className={themed('text-[12px] font-black text-amber-400')}>
              Can't reach your data
            </Text>
            <Text className={themed('text-[10px] text-amber-500/70 mt-1 leading-[14px]')}>
              {retrying
                ? 'Trying again now…'
                : retryInSeconds !== null
                ? `You're offline. Retrying in ${retryInSeconds}s.`
                : "You're offline. It loads as soon as you're back."}
            </Text>
          </View>
          <TouchableOpacity
            onPress={onRetry}
            disabled={retrying || !onRetry}
            accessibilityRole="button"
            accessibilityLabel="Retry loading your hydration data"
            accessibilityState={{ disabled: retrying || !onRetry }}
            className={themed('flex-row items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/15 border border-amber-500/30')}
            style={{ opacity: retrying ? 0.5 : 1 }}
          >
            <RefreshCw color="#f59e0b" size={13} />
            <Text className={themed('text-[10px] font-black text-amber-400')}>RETRY</Text>
          </TouchableOpacity>
        </GlassCard>
      ) : null}

      {/* ------------------------------------------------- Risk card */}
      <GlassCard adaptive className={themed('bg-white/[0.01]')} style={cardStyle}>
        <View className={themed('flex-row items-center justify-between')}>
          <Block progress={progress} height={10} width={104} radius={5} />
          <Block progress={progress} height={18} width={72} radius={9} />
        </View>

        <View className={themed('flex-row items-center gap-4 mt-5')}>
          <Block progress={progress} height={110} width={110} radius={55} />
          <View className={themed('flex-1 gap-2.5')}>
            <Block progress={progress} height={14} width={'70%'} />
            <Block progress={progress} height={10} width={'90%'} />
            <Block progress={progress} height={10} width={'55%'} />
          </View>
        </View>

        <View className={themed('flex-row mt-5')} style={{ gap: TILE_GAP }}>
          <Block progress={progress} height={148} style={{ flex: 1 }} radius={16} />
        </View>
      </GlassCard>

      {/* --------------------------------------------- Vitals row */}
      <View className={themed('flex-row')} style={{ gap: TILE_GAP, marginBottom: CARD_GAP }}>
        {[0, 1, 2].map(index => (
          <GlassCard adaptive key={index} className={themed('flex-1 bg-white/[0.01]')} style={tileStyle}>
            <Block progress={progress} height={9} width={'80%'} radius={4} />
            <Block progress={progress} height={22} width={'60%'} style={{ marginTop: 10 }} />
            <Block progress={progress} height={8} width={'90%'} style={{ marginTop: 10 }} radius={4} />
          </GlassCard>
        ))}
      </View>

      {/* ------------------------------- Ambient / target / quick log */}
      {[92, 148, 120].map((height, index) => (
        <GlassCard adaptive key={height} className={themed('bg-white/[0.01]')} style={cardStyle}>
          <View className={themed('flex-row items-center justify-between')}>
            <Block progress={progress} height={10} width={index === 1 ? 148 : 112} radius={5} />
            <Block progress={progress} height={10} width={48} radius={5} />
          </View>
          <Block
            progress={progress}
            height={height - 46}
            radius={14}
            style={{ marginTop: 14 }}
          />
        </GlassCard>
      ))}

      {/* The loading state says what it is waiting for, once, at the bottom —
          the placeholders above already say that something is coming. */}
      {!offline && (
        <Text
          style={{
            color: '#475569',
            fontSize: 10,
            fontWeight: '700',
            letterSpacing: 0.6,
            textAlign: 'center',
            marginBottom: CARD_GAP,
          }}
        >
          Loading your hydration data…
        </Text>
      )}
    </View>
  );
};

export default DashboardSkeleton;
