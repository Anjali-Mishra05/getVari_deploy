import React, { useState } from 'react';
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

// Assuming you have Lucide icons for React Native
// npm install lucide-react-native
import { Smartphone, AlertTriangle } from 'lucide-react-native';

const LoginScreen = ({ navigation }: any) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSendOtp = async () => {
    if (!phoneNumber) {
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
      const fullPhone = `+91${phoneNumber}`; // Replace with actual selected country code
      const confirmation = await AuthService.sendOtp(fullPhone);
      navigation.navigate('OtpVerification', { confirmation, phoneNumber: fullPhone });
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Ambient Glows */}
      <View style={[styles.glow, { top: '10%', left: '20%', backgroundColor: 'rgba(6, 182, 212, 0.05)' }]} />
      <View style={[styles.glow, { bottom: '10%', right: '10%', backgroundColor: 'rgba(59, 130, 246, 0.05)' }]} />

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
            <Text style={styles.subtitle}>
              Verify your mobile number to validate session telemetry.
            </Text>
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <AlertTriangle color="#f87171" size={16} />
              <View style={styles.errorTextContainer}>
                <Text style={styles.errorTitle}>Validation Denied</Text>
                <Text style={styles.errorMessage}>{error}</Text>
              </View>
            </View>
          ) : null}

          <View style={styles.inputGroup}>
            <View style={styles.countryPicker}>
              <Text style={styles.countryFlag}>🇮🇳</Text>
              <Text style={styles.countryCode}>+91</Text>
            </View>
            <TextInput
              style={styles.phoneInput}
              placeholder="Enter mobile number"
              placeholderTextColor="#525252"
              keyboardType="phone-pad"
              value={phoneNumber}
              onChangeText={setPhoneNumber}
            />
          </View>

          <TouchableOpacity
            style={styles.checkboxContainer}
            activeOpacity={0.7}
            onPress={() => setAgreeTerms(!agreeTerms)}
          >
            <View style={[styles.checkbox, agreeTerms && styles.checkboxChecked]}>
              {agreeTerms && <View style={styles.checkboxInner} />}
            </View>
            <Text style={styles.checkboxLabel}>
              I agree to the <Text style={styles.linkText}>Terms & Conditions</Text>
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.button}
            activeOpacity={0.8}
            onPress={handleSendOtp}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#020617" />
            ) : (
              <Text style={styles.buttonText}>SEND OTP</Text>
            )}
          </TouchableOpacity>

          <View style={styles.testKeyBox}>
            <View style={styles.testKeyHeader}>
              <Smartphone color="#22d3ee" size={12} />
              <Text style={styles.testKeyTitle}>Production Auth Active</Text>
            </View>
            <Text style={styles.testKeyDesc}>
              Enter your mobile number to receive a real secure authorization code via SMS.
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
    fontSize: 32,
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
  subtitle: {
    fontSize: 12,
    color: '#a3a3a3',
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 18,
  },
  errorBox: {
    flexDirection: 'row',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    padding: 14,
    borderRadius: 12,
    marginBottom: 24,
    alignItems: 'flex-start',
  },
  errorTextContainer: {
    marginLeft: 10,
    flex: 1,
  },
  errorTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#fecaca',
  },
  errorMessage: {
    fontSize: 12,
    color: '#fecaca',
    marginTop: 2,
  },
  inputGroup: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  countryPicker: {
    backgroundColor: '#050c18',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  countryFlag: {
    fontSize: 14,
  },
  countryCode: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#e5e5e5',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  phoneInput: {
    flex: 1,
    backgroundColor: '#050c18',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(5, 12, 24, 0.6)',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    marginBottom: 24,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  checkboxChecked: {
    backgroundColor: '#06b6d4',
    borderColor: '#06b6d4',
  },
  checkboxInner: {
    width: 8,
    height: 8,
    backgroundColor: '#020617',
    borderRadius: 2,
  },
  checkboxLabel: {
    fontSize: 12,
    color: '#d4d4d4',
    fontWeight: '600',
  },
  linkText: {
    color: '#06b6d4',
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
    shadowRadius: 20,
    elevation: 4,
  },
  buttonText: {
    color: '#020617',
    fontSize: 12,
    fontWeight: '900',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    letterSpacing: 2,
  },
  testKeyBox: {
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    padding: 12,
    borderRadius: 16,
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

export default LoginScreen;
