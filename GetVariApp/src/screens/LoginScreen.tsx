
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ActivityIndicator,
  Dimensions,
  Keyboard,
} from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Stop, Rect as SvgRect } from 'react-native-svg';

import { AuthService } from '../services/AuthService';
import { AlertTriangle, Cpu } from 'lucide-react-native';
import GlassCard from '../components/GlassCard';

const { width } = Dimensions.get('window');

const LoginScreen = ({ navigation }: any) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [phoneFocused, setPhoneFocused] = useState(false);

  const handleSendOtp = async () => {
    if (!phoneNumber || phoneNumber.length < 10) {
      setError('Please enter a valid mobile number.');
      return;
    }
    if (!agreeTerms) {
      setError('You must agree to the Terms & Conditions to proceed.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const fullPhone = `+91${phoneNumber}`;
      const confirmation = await AuthService.sendOtp(fullPhone);
      navigation.navigate('OtpVerification', { confirmation, phoneNumber: fullPhone });
    } catch (err: any) {
      setError(err.message || 'Verification system busy. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-[#01040a]">
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
              <Stop offset="100%" stopColor="#01040a" stopOpacity="1" />
            </RadialGradient>
          </Defs>
          <SvgRect x="0" y="0" width="100%" height="100%" fill="url(#grad)" />
        </Svg>
      </View>

      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
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
                className="items-center p-0 pt-8 pb-8 px-5 rounded-[32px] bg-black/40 border-white/10 shadow-2xl"
                style={{ width: Math.min(width - 30, 360) }}
              >

              <View className="flex-row items-baseline justify-center mb-4">
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

              {error ? (
                <View className="flex-row bg-red-500/10 border border-red-500/20 p-4 rounded-2xl mb-8 items-start w-full">
                  <AlertTriangle color="#f87171" size={16} className="mt-0.5" />
                  <View className="ml-3 flex-1">
                    <Text className="text-[12px] font-bold text-red-200">Access Denied</Text>
                    <Text className="text-[11px] text-red-200 mt-0.5 leading-snug">{error}</Text>
                  </View>
                </View>
              ) : null}

              <View className="w-full">
                <View className="flex-row gap-2.5 items-center mb-4">
                  <View className="bg-[#0a101a] border border-white/10 rounded-[20px] px-3.5 flex-row items-center justify-center min-w-[90px] h-[46px]">
                    <Text className="text-[13px] font-black text-neutral-300 font-mono">IN +91</Text>
                  </View>
                  <TextInput
                    className={`flex-1 h-[46px] bg-[#0a101a] rounded-[20px] px-4 text-white text-[14px] font-semibold font-mono border ${phoneFocused ? 'border-cyan-400/75' : 'border-white/10'}`}
                    placeholder="Enter mobile number"
                    placeholderTextColor="#2b313d"
                    keyboardType="phone-pad"
                    maxLength={10}
                    value={phoneNumber}
                    onChangeText={(value) => {
                      setError('');
                      setPhoneNumber(value);
                    }}
                    onFocus={() => setPhoneFocused(true)}
                    onBlur={() => setPhoneFocused(false)}
                    style={{
                      shadowColor: '#00f2fe',
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: phoneFocused ? 0.7 : 0,
                      shadowRadius: phoneFocused ? 14 : 0,
                      elevation: phoneFocused ? 10 : 0,
                    }}
                  />
                </View>

                <TouchableOpacity
                  className="flex-row items-center bg-black/30 p-3.5 rounded-[20px] border border-white/[0.04] mb-5"
                  activeOpacity={0.7}
                  onPress={() => {
                    setError('');
                    setAgreeTerms(!agreeTerms);
                  }}
                >
                  <View
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 5,
                      borderWidth: 1,
                      borderColor: 'rgba(255,255,255,0.2)',
                      backgroundColor: agreeTerms ? '#ffffff' : 'transparent',
                      justifyContent: 'center',
                      alignItems: 'center',
                      marginRight: 12,
                    }}
                  >
                    {agreeTerms && (
                      <View style={{ width: 10, height: 10, backgroundColor: '#020617', borderRadius: 5 }} />
                    )}
                  </View>
                  <Text className="text-[13px] text-neutral-300 font-semibold">
                    I agree to the <Text className="text-[#00f2fe]">Terms & Conditions</Text>
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  className={`w-full h-[52px] rounded-[24px] items-center justify-center ${loading ? 'bg-cyan-600' : 'bg-[#00f2fe]'} shadow-2xl`}
                  style={{
                    shadowColor: '#00f2fe',
                    shadowOffset: { width: 0, height: 10 },
                    shadowOpacity: 0.6,
                    shadowRadius: 24,
                    elevation: 20,
                  }}
                  activeOpacity={0.8}
                  onPress={handleSendOtp}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#020617" size="small" />
                  ) : (
                    <Text className="text-[#020617] text-[15px] font-black font-mono tracking-[0.4em] uppercase">SEND OTP</Text>
                  )}
                </TouchableOpacity>

                <View className="mt-7 bg-black/60 p-4 rounded-[22px] border border-white/[0.05]">
                  <View className="flex-row items-center gap-2 mb-3">
                    <Cpu color="#00f2fe" size={14} />
                    <Text className="text-[10px] text-[#00f2fe] font-black uppercase font-mono tracking-[0.18em]">DEMO / INVESTOR TESTING KEY</Text>
                  </View>
                  <Text className="text-[11px] text-neutral-500 leading-6 font-medium">
                    Enter any Indian mobile number, check the Terms & Conditions checkbox, and submit. The demo verification passcode is <Text className="text-[#00f2fe] font-black">884200</Text>.
                  </Text>
                </View>
              </View>

              <View className="mt-8 items-center">
                
              </View>
              </GlassCard>
            </Animated.View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </TouchableWithoutFeedback>
    </View>
  );
};

export default LoginScreen;
