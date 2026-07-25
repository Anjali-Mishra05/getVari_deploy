import React, { useEffect } from 'react';
import { View, Text, Platform } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, ClipPath, G, Rect } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing
} from 'react-native-reanimated';

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
    sm: { get: 16, vari: 20, dot: 4, gap: 8 },
    md: { get: 24, vari: 30, dot: 6, gap: 12 },
    lg: { get: 32, vari: 40, dot: 8, gap: 15 },
    xl: { get: 42, vari: 48, dot: 10, gap: 18 },
  };

  const current = fontSizes[textSize];

  return (
    <View className="items-center justify-center">
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
            fill="rgba(6, 182, 212, 0.08)"
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
            fill="#ffffff"
          />
        </Svg>
      </View>

      {withText && (
        <View className="flex-row items-center justify-center mt-4">
          <View
            style={{
              width: current.dot,
              height: current.dot,
              borderRadius: current.dot / 2,
              backgroundColor: '#00f2fe',
              marginRight: current.gap,
              shadowColor: '#00f2fe',
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.8,
              shadowRadius: 6,
              elevation: 6,
            }}
          />
          <Text
            style={{
              fontSize: current.get,
              fontFamily: Platform.OS === 'android' ? 'sans-serif-thin' : 'HelveticaNeue-Thin',
              color: '#a3b3cc',
              letterSpacing: -0.5,
            }}
          >
            get
          </Text>
          <Text
            style={{
              fontSize: current.vari,
              fontWeight: '900',
              color: '#ffffff',
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
