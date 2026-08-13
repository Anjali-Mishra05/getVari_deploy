import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Stop, Rect as SvgRect } from 'react-native-svg';

import { AuthService } from '../services/AuthService';
import NotificationService from '../services/NotificationService';
import { Cpu } from 'lucide-react-native';
import GlassCard from '../components/GlassCard';

const { width } = Dimensions.get('window');

const OtpScreen = ({ route, navigation }: any) => {
  const { challenge, phoneNumber } = route.params;
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
    if (otpCode.length < 4) {
      setError('Please enter the verification code.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await AuthService.verifyOtp(challenge, otpCode);
      // Trigger welcome notification
      await NotificationService.showWelcomeNotification();
      // A returning user who already onboarded goes straight to the dashboard.
      navigation.replace(await AuthService.resolveStartupRoute());
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
      const newChallenge = await AuthService.sendOtp(phoneNumber);
      navigation.setParams({ challenge: newChallenge });
      setCountdown(60);
      setError('');
    } catch (err: any) {
      setError('System failure. Could not resend code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-[#02050e]">
      <View className="absolute inset-0">
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
              <Stop offset="0%" stopColor="#0b2133" stopOpacity="0.2" />
              <Stop offset="100%" stopColor="#02050e" stopOpacity="1" />
            </RadialGradient>
          </Defs>
          <SvgRect x="0" y="0" width="100%" height="100%" fill="url(#grad)" />
        </Svg>
      </View>

      <SafeAreaView className="flex-1 items-center justify-center pt-4">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1 w-full items-center justify-center px-4"
        >
          <Animated.View
            entering={FadeInUp.duration(1000).springify()}
            className="w-full items-center"
          >
            <GlassCard
              className="items-center p-0 pt-8 pb-7 px-5 rounded-[32px] bg-black/40 border-white/10 shadow-2xl"
              style={{ width: Math.min(width - 28, 360) }}
            >

              <View className="flex-row items-baseline justify-center mb-5">
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
                    color: '#a3b3cc',
                    letterSpacing: -0.8,
                  }}
                >
                  get
                </Text>
                <Text
                  style={{
                    fontSize: 34,
                    fontWeight: '900',
                    color: '#ffffff',
                    letterSpacing: -1.2,
                    marginLeft: 4,
                  }}
                >
                  Vari
                </Text>
              </View>

              <Text className="w-[280px] text-[13px] text-neutral-400 text-center mt-1 leading-5 font-sans mb-8">
                Verify your mobile number to validate session telemetry.
              </Text>

              <View className="bg-[#09131f] border border-cyan-500/10 rounded-[24px] p-5 flex-row justify-between items-center mb-4 w-full">
                <View className="flex-1">
                  <Text className="text-[9px] text-neutral-500 font-bold font-mono tracking-widest uppercase">SMS DISPATCHED</Text>
                  <Text className="text-[13px] text-cyan-300 font-bold font-mono mt-1.5 tracking-wider">{phoneNumber}</Text>
                </View>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                  <Text className="text-[11px] text-[#00f2fe] font-bold">Edit Line</Text>
                </TouchableOpacity>
              </View>

              {error ? (
                <Text className="text-red-400 text-[11px] mb-2 text-center font-bold font-mono tracking-tight px-2">{error}</Text>
              ) : null}

              <View className="relative mb-4 w-full">
                <TextInput
                  className="w-full h-[54px] bg-[#050c18] border-2 border-cyan-400/30 rounded-full text-white text-[13px] font-black text-center tracking-[1px] font-mono shadow-inner px-4"
                  placeholder="Enter 6-digit code"
                  placeholderTextColor="#1e293b"
                  keyboardType="number-pad"
                  maxLength={6}
                  value={otpCode}
                  onChangeText={setOtpCode}
                  autoFocus
                />
                <View className="absolute right-6 top-4.5">
                  {countdown > 0 ? (
                    <Text className="text-[9px] text-neutral-500 font-mono uppercase font-bold">RESEND IN {countdown}S</Text>
                  ) : (
                    <TouchableOpacity onPress={handleResend}>
                      <Text className="text-[9px] text-cyan-400 font-bold font-mono">RESEND</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <TouchableOpacity
                className={`w-full py-5 rounded-[22px] items-center ${loading ? 'bg-cyan-600' : 'bg-[#00f2fe]'} shadow-2xl`}
                style={{
                  shadowColor: '#00f2fe',
                  shadowOffset: { width: 0, height: 10 },
                  shadowOpacity: 0.5,
                  shadowRadius: 20,
                  elevation: 15,
                }}
                activeOpacity={0.8}
                onPress={handleVerifyOtp}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#020617" size="small" />
                ) : (
                  <Text className="text-[#020617] text-[15px] font-black font-mono tracking-[0.22em] uppercase">VERIFY &amp; LOG IN</Text>
                )}
              </TouchableOpacity>

              <View className="mt-6 bg-black/60 p-4 rounded-[24px] border border-white/[0.05] w-full">
                <View className="flex-row items-center gap-2 mb-3">
                  <Cpu color="#00f2fe" size={14} />
                  <Text className="text-[10px] text-[#00f2fe] font-black uppercase font-mono tracking-[0.18em]">DEMO / INVESTOR TESTING KEY</Text>
                </View>
                <Text className="text-[11px] text-neutral-400 leading-6 font-medium">
                  Enter any Indian mobile number, check the Terms &amp; Conditions checkbox, and submit. The demo verification passcode is <Text className="text-[#00f2fe] font-black">884200</Text>.
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
