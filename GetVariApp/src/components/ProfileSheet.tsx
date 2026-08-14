import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { Activity, LogOut, Phone, Target, User, X } from 'lucide-react-native';

import { AuthService, StoredSession } from '../services/AuthService';
import NotificationService from '../services/NotificationService';
import NotificationHistory from '../services/NotificationHistory';
import HydrationPromptSession from '../services/HydrationPromptSession';

interface ProfileSheetProps {
  visible: boolean;
  onClose: () => void;
  /** The onboarding profile blob, when it has been loaded. */
  userProfile: any;
  /** Daily goal already resolved by the caller (profile value, or default). */
  targetMl: number;
  /** Called once the session is gone, so the app can leave the signed-in area. */
  onLoggedOut: () => void;
}

const ACCENT = '#00f2fe';

/** "+919876543210" reads better as "+91 98765 43210". */
const formatPhone = (raw?: string): string => {
  if (!raw) return 'Unknown number';
  const match = /^(\+\d{1,3})(\d{5})(\d{5})$/.exec(raw.replace(/\s+/g, ''));
  return match ? `${match[1]} ${match[2]} ${match[3]}` : raw;
};

const Row: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({
  icon,
  label,
  value,
}) => (
  <View
    style={{
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 15,
      paddingHorizontal: 18,
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(255,255,255,0.05)',
    }}
  >
    <View
      style={{
        width: 36,
        height: 36,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
      }}
    >
      {icon}
    </View>
    <View style={{ flex: 1 }}>
      <Text
        style={{ color: '#64748b', fontSize: 9, fontWeight: '900', letterSpacing: 1.6 }}
      >
        {label.toUpperCase()}
      </Text>
      <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '700', marginTop: 3 }}>
        {value}
      </Text>
    </View>
  </View>
);

/**
 * The account sheet behind the avatar in the bottom nav: who this device is
 * signed in as, and the way out.
 *
 * Signing out has to clear more than the session. Reminders are scheduled with
 * the OS and outlive the JS context, and the delivery log plus the "already
 * asked" prompt state are stored per device — leaving any of them behind would
 * show the next user the previous one's notifications.
 */
const ProfileSheet: React.FC<ProfileSheetProps> = ({
  visible,
  onClose,
  userProfile,
  targetMl,
  onLoggedOut,
}) => {
  const { height: windowHeight } = useWindowDimensions();
  const [session, setSession] = useState<StoredSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (!visible) return;

    let cancelled = false;
    setLoading(true);

    AuthService.getStoredSession()
      .then(stored => {
        if (!cancelled) setSession(stored);
      })
      .catch(error => console.error('[Auth] Failed to read session:', error))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [visible]);

  const signOut = async () => {
    setSigningOut(true);
    try {
      // Scheduled reminders are held by the OS, so they would keep firing for
      // an account that is no longer signed in.
      await NotificationService.cancelHydrationReminders();
      await NotificationService.cancelAllNotifications();
      await NotificationHistory.clear();
      await HydrationPromptSession.reset();
    } catch (error) {
      console.error('[Auth] Failed to clear device state on sign-out:', error);
    }

    try {
      await AuthService.logout();
    } catch (error) {
      console.error('[Auth] Sign-out failed:', error);
    }

    setSigningOut(false);
    onClose();
    onLoggedOut();
  };

  const confirmSignOut = () => {
    Alert.alert(
      'Log out?',
      'You will need your phone number and verification code to sign back in. Logged entries stay on your account.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log out', style: 'destructive', onPress: signOut },
      ]
    );
  };

  const initial =
    (typeof userProfile?.gender === 'string' && userProfile.gender.charAt(0).toUpperCase()) ||
    'U';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Same reason as the notification sheet: RN's Modal opens its own native
          window outside the app root's GestureHandlerRootView. */}
      <GestureHandlerRootView
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' }}
      >
        <TouchableOpacity activeOpacity={1} onPress={onClose} style={{ flex: 1 }} />

        <Animated.View
          entering={SlideInDown.duration(300)}
          exiting={SlideOutDown.duration(250)}
          style={{
            maxHeight: Math.min(windowHeight * 0.75, windowHeight - 60),
            backgroundColor: '#020617',
            borderTopLeftRadius: 40,
            borderTopRightRadius: 40,
            borderTopWidth: 1,
            borderColor: 'rgba(255,255,255,0.2)',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 24,
              paddingVertical: 18,
              borderBottomWidth: 1,
              borderBottomColor: 'rgba(255,255,255,0.05)',
            }}
          >
            <View>
              <Text style={{ color: '#ffffff', fontWeight: '900', fontSize: 16 }}>
                Account
              </Text>
              <Text
                style={{
                  color: '#64748b',
                  fontSize: 9,
                  fontWeight: '900',
                  letterSpacing: 2,
                  marginTop: 3,
                }}
              >
                {session?.isDemo ? 'DEMO SESSION' : 'SIGNED IN'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={{ padding: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Close account sheet"
            >
              <X color="#94a3b8" size={24} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={{ paddingVertical: 60, alignItems: 'center' }}>
              <ActivityIndicator color={ACCENT} />
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={{ paddingBottom: 40 }}
              showsVerticalScrollIndicator={false}
            >
              {/* Identity */}
              <View style={{ alignItems: 'center', paddingVertical: 26 }}>
                <View
                  style={{
                    width: 76,
                    height: 76,
                    borderRadius: 30,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'rgba(0,242,254,0.08)',
                    borderWidth: 1,
                    borderColor: 'rgba(0,242,254,0.25)',
                  }}
                >
                  <Text style={{ color: ACCENT, fontSize: 30, fontWeight: '900' }}>
                    {initial}
                  </Text>
                </View>
                <Text
                  style={{
                    color: '#ffffff',
                    fontSize: 17,
                    fontWeight: '900',
                    marginTop: 14,
                  }}
                >
                  {formatPhone(session?.phoneNumber)}
                </Text>
                {!!userProfile && (
                  <Text style={{ color: '#64748b', fontSize: 11, marginTop: 5 }}>
                    {[userProfile.gender, userProfile.age && `${userProfile.age} yrs`,
                      userProfile.weightKg && `${userProfile.weightKg} kg`]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                )}
              </View>

              <Row
                icon={<Phone color="#94a3b8" size={17} />}
                label="Phone"
                value={formatPhone(session?.phoneNumber)}
              />
              <Row
                icon={<Target color={ACCENT} size={17} />}
                label="Daily goal"
                value={`${targetMl} ml`}
              />
              <Row
                icon={<Activity color="#a78bfa" size={17} />}
                label="Activity level"
                value={userProfile?.activityLevel || 'Moderate'}
              />
              <Row
                icon={<User color="#94a3b8" size={17} />}
                label="Fitness goal"
                value={userProfile?.fitnessGoal || 'Not set'}
              />

              {/* Log out */}
              <TouchableOpacity
                onPress={confirmSignOut}
                disabled={signingOut}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Log out"
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginHorizontal: 20,
                  marginTop: 26,
                  paddingVertical: 16,
                  borderRadius: 20,
                  backgroundColor: 'rgba(244,63,94,0.08)',
                  borderWidth: 1,
                  borderColor: 'rgba(244,63,94,0.3)',
                  opacity: signingOut ? 0.6 : 1,
                }}
              >
                {signingOut ? (
                  <ActivityIndicator color="#f43f5e" />
                ) : (
                  <>
                    <LogOut color="#f43f5e" size={18} strokeWidth={2.5} />
                    <Text
                      style={{
                        color: '#f43f5e',
                        fontSize: 13,
                        fontWeight: '900',
                        letterSpacing: 1.2,
                        marginLeft: 10,
                      }}
                    >
                      LOG OUT
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          )}
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
};

export default ProfileSheet;
