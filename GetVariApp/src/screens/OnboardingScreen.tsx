import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  Platform,
  Dimensions,
} from 'react-native';
import { Waves, ChevronRight, ChevronLeft } from 'lucide-react-native';
import GlassCard from '../components/GlassCard';
import Animated, { FadeInRight, FadeOutLeft, FadeInUp } from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Stop, Rect as SvgRect } from 'react-native-svg';

const { width } = Dimensions.get('window');

const OnboardingScreen = ({ navigation }: any) => {
  const [step, setStep] = useState(1);
  const totalSteps = 5;

  const handleNext = () => {
    if (step < totalSteps) {
      setStep(step + 1);
    } else {
      navigation.replace('Home');
    }
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  return (
    <View className="flex-1 bg-[#01040a]">
      {/* Background Atmosphere */}
      <View className="absolute inset-0">
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
              <Stop offset="0%" stopColor="#0b2133" stopOpacity="0.2" />
              <Stop offset="100%" stopColor="#01040a" stopOpacity="1" />
            </RadialGradient>
          </Defs>
          <SvgRect x="0" y="0" width="100%" height="100%" fill="url(#grad)" />
        </Svg>
      </View>

      <SafeAreaView className="flex-1 justify-center items-center">
        <View className="w-full px-6 items-center">

          <Animated.View
            entering={FadeInUp.duration(1000).springify()}
            className="w-full"
          >
            <GlassCard className="w-full py-10 px-8 rounded-[42px] bg-white/[0.01] border-white/5 shadow-2xl items-center">

              {/* Progress Indicator */}
              <View className="flex-row justify-center gap-2 mb-12">
                {Array.from({ length: totalSteps }).map((_, idx) => (
                  <View
                    key={idx}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      idx + 1 === step ? 'w-10 bg-[#00f2fe]' : 'w-2 bg-white/10'
                    }`}
                  />
                ))}
              </View>

              {step === 1 && (
                <Animated.View entering={FadeInRight} exiting={FadeOutLeft} className="items-center w-full">
                  {/* Wave Icon Circle */}
                  <View
                    style={{
                      width: 80,
                      height: 80,
                      borderRadius: 40,
                      backgroundColor: 'rgba(0, 242, 254, 0.03)',
                      borderWidth: 1,
                      borderColor: 'rgba(0, 242, 254, 0.1)',
                      justifyContent: 'center',
                      alignItems: 'center',
                      marginBottom: 32,
                    }}
                  >
                    <Waves color="#00f2fe" size={40} strokeWidth={1.5} opacity={0.8} />
                  </View>

                  {/* Logo Section */}
                  <View className="flex-row items-baseline justify-center mb-1">
                    <Text
                      style={{
                        fontSize: 34,
                        fontFamily: Platform.OS === 'android' ? 'sans-serif-thin' : 'HelveticaNeue-Thin',
                        color: '#a3b3cc',
                        letterSpacing: -0.5,
                      }}
                    >
                      get
                    </Text>
                    <Text
                      style={{
                        fontSize: 40,
                        fontWeight: '900',
                        color: '#ffffff',
                        letterSpacing: -1,
                        marginLeft: 2,
                      }}
                    >
                      Vāri
                    </Text>
                  </View>

                  {/* Fixed Center Alignment and Tracking */}
                  <View className="w-full items-center mb-10">
                    <Text
                      numberOfLines={1}
                      className="text-[9px] text-[#00f2fe] font-black uppercase text-center w-full"
                      style={{
                        paddingLeft: Platform.OS === 'android' ? 8 : 0,
                        letterSpacing: Platform.OS === 'android' ? 3.2 : 3.6,
                      }}
                    >
                      AI-POWERED HYDRATION INTELLIGENCE
                    </Text>
                  </View>

                  <Text className="text-[13px] text-neutral-400 text-center leading-relaxed font-medium mb-12 px-2">
                    Monitor hydration risk using real-time body signals like heart rate, activity, temperature, and recovery patterns.
                  </Text>

                  {/* Action Button - Compressed Looking */}
                  <TouchableOpacity
                    onPress={handleNext}
                    activeOpacity={0.8}
                    className="w-[85%] py-3.5 bg-[#00f2fe] rounded-[18px] flex-row items-center justify-center shadow-2xl"
                    style={{
                      shadowColor: '#00f2fe',
                      shadowOffset: { width: 0, height: 6 },
                      shadowOpacity: 0.4,
                      shadowRadius: 12,
                      elevation: 10,
                    }}
                  >
                    <Text className="text-[#020617] text-[13px] font-black uppercase tracking-wider mr-2">Next</Text>
                    <ChevronRight color="#020617" size={16} strokeWidth={3} />
                  </TouchableOpacity>
                </Animated.View>
              )}

              {step > 1 && (
                 <View className="w-full items-center">
                    <Text className="text-white text-lg font-bold">Step {step}</Text>
                    <TouchableOpacity
                      onPress={handleNext}
                      className="mt-10 w-[85%] py-3.5 bg-[#00f2fe] rounded-[18px] items-center"
                    >
                      <Text className="text-[#020617] font-black">{step === totalSteps ? 'Finish' : 'Next'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleBack} className="mt-6">
                      <Text className="text-neutral-500 font-bold">Back</Text>
                    </TouchableOpacity>
                 </View>
              )}

            </GlassCard>
          </Animated.View>

          {/* Footer Area */}
          <View className="mt-12 items-center">
            <TouchableOpacity className="flex-row items-center gap-2 opacity-50">
              <Text className="text-base">🚀</Text>
              <Text className="text-[10px] text-neutral-600 font-mono tracking-widest font-bold">
                Bypass Setup Wizard (Investor Fast-Track)
              </Text>
            </TouchableOpacity>
          </View>

        </View>
      </SafeAreaView>
    </View>
  );
};

export default OnboardingScreen;
