import React, { useEffect } from 'react';
import { View, Text, Platform } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, ClipPath, G, Rect } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing
} from 'react-native-reanimated';

import { useScopedTheme } from '../theme/theme';

const AnimatedRect = Animated.createAnimatedComponent(Rect);

interface BrandLogoProps {
  size?: number;
  fillProgress?: number; // 0 to 1
  withText?: boolean;
  textSize?: 'sm' | 'md' | 'lg' | 'xl';
  animated?: boolean;
}

const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 80,
  fillProgress = 1,
  withText = false,
  textSize = 'md',
  animated = false
}) => {
  const progress = useSharedValue(0);
  // The mark and wordmark are white, for a dark background. On a light one
  // (only inside a screen that follows the mode) they are drawn in charcoal;
  // the shape and the cyan fill are the same in both.
  const { pick } = useScopedTheme();

  useEffect(() => {
    if (animated) {
      progress.value = withTiming(fillProgress, {
        duration: 2200,
        easing: Easing.bezier(0.16, 1, 0.3, 1),
      });
    } else {
      progress.value = fillProgress;
    }
  }, [fillProgress, animated]);

  const animatedProps = useAnimatedProps(() => {
    const yVal = 56 - (progress.value * 41);
    return {
      y: yVal,
    };
  });

  const fontSizes = {
    sm: { get: 16, vari: 20, dot: 5, gap: 8 },
    md: { get: 24, vari: 30, dot: 6, gap: 12 },
    lg: { get: 32, vari: 40, dot: 8, gap: 15 },
    xl: { get: 42, vari: 48, dot: 10, gap: 18 },
  };

  const current = fontSizes[textSize];

  return (
    <View className="flex-row items-center">
      <View style={{ width: size, height: size }}>
        <Svg width="100%" height="100%" viewBox="0 0 100 100" fill="none">
          <Defs>
            <LinearGradient id="fluid-grad" x1="0" y1="1" x2="0" y2="0">
              <Stop offset="0%" stopColor="#0284c7" />
              <Stop offset="50%" stopColor="#06b6d4" />
              <Stop offset="100%" stopColor="#10b981" />
            </LinearGradient>
            <ClipPath id="vessel-clip">
              <Path d="M 28.5,15 L 50,56 L 71.5,15 Z" />
            </ClipPath>
          </Defs>

          <Path
            d="M 28.5,15 L 50,56 L 71.5,15 Z"
            fill={pick('rgba(6, 182, 212, 0.08)', 'rgba(8, 145, 178, 0.14)')}
          />

          <G clipPath="url(#vessel-clip)">
            <AnimatedRect
              x="0"
              width="100"
              height="100"
              fill="url(#fluid-grad)"
              animatedProps={animatedProps}
            />
          </G>

          <Path
            d="M 15,15 L 50,85 L 85,15 L 71.5,15 L 50,56 L 28.5,15 Z"
            fill={pick('#ffffff', '#18181b')}
          />
        </Svg>
      </View>

      {withText && (
        <View className="flex-row items-center ml-2">
          {/* Status LED: a lit indicator, so it carries a soft bloom on both
              platforms — iOS via shadow, Android via a wider translucent halo
              behind it, since elevation alone renders no glow there. */}
          <View
            style={{
              width: current.dot * 2.6,
              height: current.dot * 2.6,
              borderRadius: current.dot * 1.3,
              backgroundColor: pick('rgba(0, 242, 254, 0.18)', 'rgba(8, 145, 178, 0.18)'),
              marginRight: current.gap,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View
              style={{
                width: current.dot,
                height: current.dot,
                borderRadius: current.dot / 2,
                backgroundColor: pick('#00f2fe', '#0891b2'),
                shadowColor: pick('#00f2fe', '#0891b2'),
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.9,
                shadowRadius: 6,
                elevation: 6,
              }}
            />
          </View>
          <Text
            style={{
              fontSize: current.get,
              fontFamily: Platform.OS === 'android' ? 'sans-serif-thin' : 'HelveticaNeue-Thin',
              color: pick('#a3b3cc', '#3f3f46'),
              letterSpacing: -0.5,
            }}
          >
            get
          </Text>
          <Text
            style={{
              fontSize: current.vari,
              fontWeight: '900',
              color: pick('#ffffff', '#18181b'),
              letterSpacing: -1,
              marginLeft: 4,
            }}
          >
            Vāri
          </Text>
        </View>
      )}
    </View>
  );
};

export default BrandLogo;
