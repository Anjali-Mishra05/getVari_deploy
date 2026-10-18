import React, { useEffect } from 'react';
import { View, SafeAreaView, Text, useWindowDimensions } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Rect as SvgRect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BrandLogo from '../components/BrandLogo';
import NotificationService from '../services/NotificationService';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { themed, tone, useThemeMode } from '../theme/theme';

/** The mark's box. The V itself spans the middle 70% of it. */
const LOGO_SIZE = 148;

/** From the tagline up to the system navigation (or the screen's edge). */
const TAGLINE_BOTTOM = 36;

const SplashScreen = ({ navigation }: any) => {
  useThemeMode();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  // The glow is centred where the mark is: in the space left between the
  // status bar and the system navigation, not in the raw window.
  const glowCenterY = insets.top + (height - insets.top - insets.bottom) / 2;
  const glowRadius = Math.max(width, height) * 0.5;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;

    // Tapping a reminder is a request to log water *now* — 4.5s of branding
    // before the chat even starts loading reads as the app ignoring the tap.
    (async () => {
      const openedFromReminder = await NotificationService.hasPendingHydrationPrompt().catch(
        () => false
      );
      if (cancelled) return;
      timer = setTimeout(() => navigation.replace('Loading'), openedFromReminder ? 400 : 4500);
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [navigation]);

  return (
    <SafeAreaView className={themed('flex-1 bg-[#02050e]')}>
      {/* One flat background with a soft glow behind the mark, fading out
          well before the edges — a light on the page, not a shape on it. */}
      <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} pointerEvents="none">
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient
              id="splashGlow"
              cx={width / 2}
              cy={glowCenterY}
              r={glowRadius}
              fx={width / 2}
              fy={glowCenterY}
              gradientUnits="userSpaceOnUse"
            >
              <Stop offset="0%" stopColor={tone('#0b3f52', '#ffffff')} stopOpacity={tone(0.55, 0.9)} />
              <Stop offset="55%" stopColor={tone('#06283a', '#ffffff')} stopOpacity={tone(0.22, 0.4)} />
              <Stop offset="100%" stopColor={tone('#02050e', '#f5f5f3')} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <SvgRect x="0" y="0" width="100%" height="100%" fill="url(#splashGlow)" />
        </Svg>
      </View>

      {/* Padded by the system bars, so the mark is centred in the space the
          user can actually see on any screen size or navigation mode. */}
      <Animated.View
        entering={FadeIn.duration(1000)}
        exiting={FadeOut.duration(800)}
        className={themed('flex-1 items-center justify-center')}
        style={{
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        }}
      >
        {/* The mark has the centre to itself. */}
        <BrandLogo size={LOGO_SIZE} animated={true} fillProgress={1} />

        {/* The tagline sits at the foot of the screen, clear of the system
            navigation, so it does not pull the eye off the mark. */}
        <View
          style={{
            position: 'absolute',
            left: insets.left + 24,
            right: insets.right + 24,
            bottom: insets.bottom + TAGLINE_BOTTOM,
            alignItems: 'center',
          }}
        >
          <Text
            className={themed('text-[10px] text-neutral-600 font-mono tracking-widest uppercase text-center')}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            Hydration Intelligence — Secure Session
          </Text>
        </View>
      </Animated.View>
    </SafeAreaView>
  );
};

export default SplashScreen;
