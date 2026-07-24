import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { AuthService } from './AuthService';
import { Smartphone, RefreshCcw } from 'lucide-react-native';

const OtpScreen = ({ route, navigation }: any) => {
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
      // On success, navigate to the next screen (e.g., Onboarding or Dashboard)
      navigation.navigate('Onboarding');
    } catch (err: any) {
      setError(err.message || 'Invalid OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    setLoading(true);
    try {
      const newConfirmation = await AuthService.sendOtp(phoneNumber);
      // Update the confirmation object for the new session
      navigation.setParams({ confirmation: newConfirmation });
      setCountdown(60);
      setError('');
    } catch (err: any) {
      setError('Failed to resend OTP.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.glow, { top: '10%', left: '20%', backgroundColor: 'rgba(6, 182, 212, 0.05)' }]} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.inner}
      >
        <View style={styles.glassCard}>
          <View style={styles.header}>
            <Text style={styles.logoText}>
              <Text style={styles.getPart}>get</Text>
              <Text style={styles.variPart}>Vāri</Text>
            </Text>
          </View>

          <View style={styles.dispatchedInfo}>
            <View>
              <Text style={styles.dispatchedLabel}>SMS DISPATCHED</Text>
              <Text style={styles.dispatchedPhone}>{phoneNumber}</Text>
            </View>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Text style={styles.editLink}>Edit Line</Text>
            </TouchableOpacity>
          </View>

          {error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : null}

          <View style={styles.otpContainer}>
            <TextInput
              style={styles.otpInput}
              placeholder="Enter 6-digit code"
              placeholderTextColor="#262626"
              keyboardType="number-pad"
              maxLength={6}
              value={otpCode}
              onChangeText={setOtpCode}
              autoFocus
            />
            {countdown > 0 ? (
              <Text style={styles.resendTimer}>Resend in {countdown}s</Text>
            ) : (
              <TouchableOpacity onPress={handleResend} style={styles.resendBtn}>
                <Text style={styles.resendText}>Resend</Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={styles.button}
            activeOpacity={0.8}
            onPress={handleVerifyOtp}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#020617" />
            ) : (
              <View style={styles.buttonContent}>
                {loading && <RefreshCcw color="#020617" size={14} style={styles.spin} />}
                <Text style={styles.buttonText}>VERIFY & LOG IN</Text>
              </View>
            )}
          </TouchableOpacity>

          <View style={styles.testKeyBox}>
            <View style={styles.testKeyHeader}>
              <Smartphone color="#22d3ee" size={12} />
              <Text style={styles.testKeyTitle}>Encrypted Session</Text>
            </View>
            <Text style={styles.testKeyDesc}>
              Establishing secure bio-encryption session context upon successful verification.
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#02050e',
  },
  glow: {
    position: 'absolute',
    width: 500,
    height: 500,
    borderRadius: 250,
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  glassCard: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 36,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoText: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
  },
  getPart: {
    fontWeight: '300',
    color: '#a3b3cc',
  },
  variPart: {
    color: '#fff',
  },
  dispatchedInfo: {
    backgroundColor: 'rgba(6, 182, 212, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.1)',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'between',
    alignItems: 'center',
    marginBottom: 24,
  },
  dispatchedLabel: {
    fontSize: 9,
    color: '#a3a3a3',
    fontWeight: 'bold',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    letterSpacing: 1,
  },
  dispatchedPhone: {
    fontSize: 11,
    color: '#67e8f9',
    fontWeight: 'bold',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 2,
  },
  editLink: {
    fontSize: 10,
    color: '#22d3ee',
    textDecorationLine: 'underline',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  errorText: {
    color: '#f87171',
    fontSize: 12,
    marginBottom: 16,
    textAlign: 'center',
  },
  otpContainer: {
    position: 'relative',
    marginBottom: 24,
  },
  otpInput: {
    backgroundColor: '#050c18',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 8,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  resendTimer: {
    position: 'absolute',
    right: 14,
    top: 18,
    fontSize: 9,
    color: '#737373',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    textTransform: 'uppercase',
  },
  resendBtn: {
    position: 'absolute',
    right: 10,
    top: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  resendText: {
    fontSize: 9,
    color: '#67e8f9',
    fontWeight: 'bold',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  button: {
    backgroundColor: '#06b6d4',
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#06b6d4',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 4,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  buttonText: {
    color: '#020617',
    fontSize: 12,
    fontWeight: '900',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    letterSpacing: 2,
  },
  spin: {
    // Rotation would normally be handled by Animated
  },
  testKeyBox: {
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    padding: 12,
    borderRadius: 20,
  },
  testKeyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  testKeyTitle: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#22d3ee',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  testKeyDesc: {
    fontSize: 10,
    color: '#a3a3a3',
    lineHeight: 14,
  },
});

export default OtpScreen;
