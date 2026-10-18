import React, { useEffect } from 'react';
import { View, SafeAreaView, Text, Platform, Dimensions } from 'react-native';
import { AuthService } from '../services/AuthService';
import NotificationService from '../services/NotificationService';
import ConfigService from '../services/ConfigService';
import { warmBackend } from '../config/backend';
import Animated, {
  FadeIn,
  FadeOut,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  Easing
} from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Stop, Rect as SvgRect } from 'react-native-svg';
import { themed, tone, useThemeMode } from '../theme/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { footerBottomPadding } from '../utils/navLayout';

const { width, height } = Dimensions.get('window');

const LoadingDot = ({ delay }: { delay: number }) => {
  const opacity = useSharedValue(0.15);

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withRepeat(
        withTiming(0.8, { duration: 800, easing: Easing.bezier(0.4, 0, 0.6, 1) }),
        -1,
        true
      )
    );
  }, [delay]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={animatedStyle}
      className={themed('w-1 h-1 rounded-full bg-[#00f2fe] mx-1')}
    />
  );
};

const LoadingScreen = ({ navigation }: any) => {
  // The footer line is pinned to the bottom of the screen, which Android's
  // navigation shares (see `navLayout`).
  const insets = useSafeAreaInsets();
  useThemeMode();
  useEffect(() => {
    // This screen already holds the user for a couple of seconds, so spend
    // that time on the two things that would otherwise make them wait later:
    // pulling the admin config, and waking the chat backend, which sleeps
    // after 15 minutes of no traffic and takes half a minute to come back.
    // Both are fire-and-forget — neither may delay the launch.
    ConfigService.refresh().catch(() => undefined);
    warmBackend();

    checkSession();
  }, [navigation]);

  const checkSession = async () => {
    // Resolved from the locally persisted session, so a launch with no network
    // — or the cold start caused by tapping a reminder — still lands on Home
    // instead of asking the user to sign up all over again.
    let route: 'Home' | 'Onboarding' | 'Login' = 'Login';
    try {
      route = await AuthService.resolveStartupRoute();
    } catch (error) {
      console.log('Session check failed:', error);
    }

    // A reminder tap should reach the chat quickly; only a normal launch gets
    // the full loading animation.
    const openedFromReminder = await NotificationService.hasPendingHydrationPrompt().catch(
      () => false
    );
    await new Promise(resolve => setTimeout(resolve, openedFromReminder ? 300 : 2200));

    navigation.replace(route);
  };

  return (
    <View className={themed('flex-1 bg-[#01040a]')}>
      {/* Deep Immersive Radial Gradient Background */}
      <View className={themed('absolute inset-0')}>
        <Svg height="100%" width="100%">
          <Defs>
            <RadialGradient
                id="grad"
                cx="50%"
                cy="50%"
                rx="45%"
                ry="35%"
                fx="50%"
                fy="50%"
                gradientUnits="userSpaceOnUse"
              >
                <Stop offset="0%" stopColor={tone('#0b2133', '#ffffff')} stopOpacity="0.35" />
                <Stop offset="100%" stopColor={tone('#01040a', '#f5f5f3')} stopOpacity="1" />
              </RadialGradient>
          </Defs>
          <SvgRect x="0" y="0" width="100%" height="100%" fill="url(#grad)" />
        </Svg>
      </View>

      <SafeAreaView className={themed('flex-1 justify-center items-center')}>
        <Animated.View
          entering={FadeIn.duration(1200)}
          exiting={FadeOut.duration(800)}
          className={themed('items-center w-full')}
        >
          {/* Logo Section - Compressed Spacing Match */}
          <View className={themed('flex-row items-baseline justify-center mb-1')}>
            <View
              style={{
                width: 7,
                height: 7,
                borderRadius: 3.5,
                backgroundColor: '#00f2fe',
                marginRight: 10,
                marginBottom: Platform.OS === 'android' ? 3 : 5,
                shadowColor: '#00f2fe',
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.4,
                shadowRadius: 5,
                elevation: 3,
              }}
            />
            <Text
              style={{
                fontSize: 34,
                fontFamily: Platform.OS === 'android' ? 'sans-serif-thin' : 'HelveticaNeue-Thin',
                color: tone('#a3b3cc', '#52525b'),
                letterSpacing: -0.5,
              }}
            >
              get
            </Text>
            <Text
              style={{
                fontSize: 40,
                fontWeight: '900',
                color: tone('#ffffff', '#18181b'),
                letterSpacing: -1,
                marginLeft: 2,
              }}
            >
              Vāri
            </Text>
          </View>

          <View className={themed('items-center')}>
            <Text
              style={{
                fontSize: 10,
                color: tone('#00f2fe', '#0891b2'),
                fontWeight: '800',
                letterSpacing: 4.5,
                textTransform: 'uppercase',
              }}
            >
              HYDRATION INTELLIGENCE
            </Text>

            <View className={themed('mt-14 items-center')}>
              <Text
                style={{
                  fontSize: 10,
                  color: tone('#475569', '#a1a1aa'),
                  letterSpacing: 0.8,
                  marginBottom: 14,
                }}
              >
                Powering bio-cellular loop...
              </Text>

              <View className={themed('flex-row justify-center items-center')}>
                <LoadingDot delay={0} />
                <LoadingDot delay={200} />
                <LoadingDot delay={400} />
              </View>
            </View>
          </View>
        </Animated.View>

        {/* Footer Section - Precise Prototype Match */}
        {/* Its usual 40px (`bottom-10`), or just above a 3-button bar. */}
        <View
          className={themed('absolute bottom-10 items-center w-full')}
          style={{ bottom: footerBottomPadding(40, insets.bottom) }}
        >
          <Text
            style={{
              fontSize: 8.5,
              color: tone('#334155', '#d4d4d8'),
              fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier',
              letterSpacing: 1.5,
            }}
          >
            CONFIDENTIAL SESSION — DEMONSTRATION ONLY
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
};

export default LoadingScreen;
