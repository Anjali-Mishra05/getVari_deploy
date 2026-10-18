import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
// Not React Native's own SafeAreaView: that is a plain View on Android and
// leaves the content under the system bars. This one applies the real insets.
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Stop, Rect as SvgRect } from 'react-native-svg';

import { AuthService, DEMO_PASSCODE } from '../services/AuthService';
import NotificationService from '../services/NotificationService';
import Button from '../components/ui/Button';
import { Cpu } from 'lucide-react-native';
import { cssInterop } from 'react-native-css-interop';
import GlassCard from '../components/GlassCard';
import { themed, tone, useThemeMode } from '../theme/theme';

// Add CSS Interop for Lucide icons to support className in NativeWind v4
cssInterop(Cpu, {
  className: {
    target: 'style',
    nativeStyleToProp: {
      color: true,
      size: true,
    },
  },
});

const { width } = Dimensions.get('window');

const OtpScreen = ({ route, navigation }: any) => {
  useThemeMode();
  const { confirmation, phoneNumber } = route.params;
  const [otpCode, setOtpCode] = useState('');
  const [countdown, setCountdown] = useState(60);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (countdown > 0) {
      const timer = setInterval(() => setCountdown(prev => prev - 1), 1000);
      return () => clearInterval(timer);
    }
  }, [countdown]);

  const handleVerifyOtp = async () => {
    if (otpCode.length < 6) {
      setError('Please enter the 6-digit verification code.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await AuthService.verifyOtp(confirmation, otpCode);
      // A different account than the one the schedule was built for drops the
      // previous account's schedule and state; the same account keeps them.
      // Before the welcome, so the new account's bell starts with it.
      const userId = await AuthService.getCurrentUserId();
      if (userId) await NotificationService.adoptAccount(userId);
      // The welcome itself shows when the user reaches the dashboard.
      await NotificationService.queueWelcomeNotification();
      // An account with a saved profile goes straight to the dashboard;
      // signing in again after a logout does not make the user new.
      navigation.replace(await AuthService.routeAfterLogin());
    } catch (err: any) {
      setError(err.message || 'Invalid authorization code.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    setLoading(true);
    try {
      const newConfirmation = await AuthService.sendOtp(phoneNumber);
      navigation.setParams({ confirmation: newConfirmation });
      setCountdown(60);
      setError('');
    } catch (error) {
      console.error('[Auth] Resend failed:', error);
      setError('System failure. Could not resend code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className={themed('flex-1 bg-[#02050e]')}>
      <View className={themed('absolute inset-0')}>
        <Svg height="100%" width="100%">
          <Defs>
            <RadialGradient
              id="grad"
              cx="50%"
              cy="50%"
              rx="55%"
              ry="45%"
              fx="50%"
              fy="50%"
              gradientUnits="userSpaceOnUse"
            >
              <Stop offset="0%" stopColor={tone('#0b2133', '#ffffff')} stopOpacity="0.2" />
              <Stop offset="100%" stopColor={tone('#02050e', '#f5f5f3')} stopOpacity="1" />
            </RadialGradient>
          </Defs>
          <SvgRect x="0" y="0" width="100%" height="100%" fill="url(#grad)" />
        </Svg>
      </View>

      <SafeAreaView className={themed('flex-1 items-center justify-center pt-4')}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className={themed('flex-1 w-full items-center justify-center px-4')}
        >
          <Animated.View
            entering={FadeInUp.duration(1000).springify()}
            className={themed('w-full items-center')}
          >
            <GlassCard adaptive
              className={themed('items-center p-0 pt-8 pb-7 px-5 rounded-[32px] bg-black/40 border-white/10 shadow-2xl')}
              style={{ width: Math.min(width - 28, 360) }}
            >

              <View className={themed('flex-row items-baseline justify-center mb-5')}>
                <View
                  style={{
                    width: 11,
                    height: 11,
                    borderRadius: 6,
                    backgroundColor: '#00f2fe',
                    marginRight: 12,
                    marginBottom: Platform.OS === 'android' ? 2 : 4,
                    shadowColor: '#00f2fe',
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.75,
                    shadowRadius: 10,
                    elevation: 6,
                  }}
                />
                <Text
                  style={{
                    fontSize: 28,
                    fontFamily: Platform.OS === 'android' ? 'sans-serif-thin' : 'HelveticaNeue-Thin',
                    color: tone('#a3b3cc', '#52525b'),
                    letterSpacing: -0.8,
                  }}
                >
                  get
                </Text>
                <Text
                  style={{
                    fontSize: 34,
                    fontWeight: '900',
                    color: tone('#ffffff', '#18181b'),
                    letterSpacing: -1.2,
                    marginLeft: 4,
                  }}
                >
                  Vari
                </Text>
              </View>

              <Text className={themed('w-[280px] text-[13px] text-neutral-400 text-center mt-1 leading-5 font-sans mb-8')}>
                Verify your mobile number to validate session telemetry.
              </Text>

              <View className={themed('bg-[#09131f] border border-cyan-500/10 rounded-[24px] p-5 flex-row justify-between items-center mb-4 w-full')}>
                <View className={themed('flex-1')}>
                  <Text className={themed('text-[9px] text-neutral-500 font-bold font-mono tracking-widest uppercase')}>SMS DISPATCHED</Text>
                  <Text className={themed('text-[13px] text-cyan-300 font-bold font-mono mt-1.5 tracking-wider')}>{phoneNumber}</Text>
                </View>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                  <Text className={themed('text-[11px] text-[#00f2fe] font-bold')}>Edit Line</Text>
                </TouchableOpacity>
              </View>

              {error ? (
                <Text className={themed('text-red-400 text-[11px] mb-2 text-center font-bold font-mono tracking-tight px-2')}>{error}</Text>
              ) : null}

              <View className={themed('relative mb-4 w-full')}>
                <TextInput
                  className={themed('w-full h-[54px] bg-[#050c18] border-2 border-cyan-400/30 rounded-full text-white text-[13px] font-black text-center tracking-[1px] font-mono shadow-inner px-4')}
                  placeholder="Enter 6-digit code"
                  placeholderTextColor={tone('#1e293b', '#a1a1aa')}
                  keyboardType="number-pad"
                  maxLength={6}
                  value={otpCode}
                  onChangeText={setOtpCode}
                  autoFocus
                />
                <View className={themed('absolute right-6 top-4.5')}>
                  {countdown > 0 ? (
                    <Text className={themed('text-[9px] text-neutral-500 font-mono uppercase font-bold')}>RESEND IN {countdown}S</Text>
                  ) : (
                    <TouchableOpacity onPress={handleResend}>
                      <Text className={themed('text-[9px] text-cyan-400 font-bold font-mono')}>RESEND</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <Button
                label="VERIFY & LOG IN"
                onPress={handleVerifyOtp}
                size="lg"
                loading={loading}
                fullWidth
                textStyle={{ letterSpacing: 2.2 }}
                style={{
                  shadowColor: '#00f2fe',
                  shadowOffset: { width: 0, height: 10 },
                  shadowOpacity: 0.5,
                  shadowRadius: 20,
                  elevation: 15,
                }}
              />

              <View className={themed('mt-6 bg-black/60 p-4 rounded-[24px] border border-white/[0.05] w-full')}>
                <View className={themed('flex-row items-center gap-2 mb-3')}>
                  <Cpu color={tone('#00f2fe', '#0891b2')} size={14} />
                  <Text className={themed('text-[10px] text-[#00f2fe] font-black uppercase font-mono tracking-[0.18em]')}>DEMO / INVESTOR TESTING KEY</Text>
                </View>
                <Text className={themed('text-[11px] text-neutral-400 leading-6 font-medium')}>
                  Enter any Indian mobile number, check the Terms &amp; Conditions checkbox, and submit. The demo verification passcode is <Text className={themed('text-[#00f2fe] font-black')}>{DEMO_PASSCODE}</Text>.
                </Text>
              </View>

            </GlassCard>
          </Animated.View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
};

export default OtpScreen;
