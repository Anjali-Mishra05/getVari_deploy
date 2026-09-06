import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, View } from 'react-native';
import { Activity, LogOut, Moon, Pencil, Phone, Target } from 'lucide-react-native';

import Button from './ui/Button';
import { profileNeedsPhysicianLimit } from '../utils/hydrationTarget';
import Sheet from './ui/Sheet';

import { AuthService, StoredSession } from '../services/AuthService';
import NotificationService from '../services/NotificationService';
import NotificationHistory from '../services/NotificationHistory';
import HydrationPromptSession from '../services/HydrationPromptSession';
import { describeSleepWindow, normaliseSleepSchedule } from '../utils/sleepWindow';
import useAppConfig from '../hooks/useAppConfig';

interface ProfileSheetProps {
  visible: boolean;
  onClose: () => void;
  /** The onboarding profile blob, when it has been loaded. */
  userProfile: any;
  /**
   * The daily goal, or null when there is none to show.
   *
   * Null now means two different things — the profile has not loaded yet, and
   * a fluid-restricted diagnosis whose physician limit is missing — so the row
   * reads `userProfile` to tell them apart rather than saying "Loading…"
   * forever at a user whose goal is never going to arrive.
   */
  targetMl: number | null;
  /** Called once the session is gone, so the app can leave the signed-in area. */
  onLoggedOut: () => void;
  /**
   * Opens the profile editor. The editor is rendered by the screen rather than
   * nested inside this sheet, so the two never fight over the same native
   * modal window — this only asks for the swap.
   */
  onEditProfile: () => void;
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
  onEditProfile,
}) => {
  const appConfig = useAppConfig();
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
      // The next account on this device has its own sleep window.
      await NotificationService.clearSleepSchedule();
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

  const activityLabel =
    appConfig.activityLevels.find(level => level.id === userProfile?.activityLevel)?.title ??
    'Not set';

  const sleepSchedule = normaliseSleepSchedule(userProfile);
  const sleepWindowLabel = sleepSchedule ? describeSleepWindow(sleepSchedule) : 'Not set';

  const initial =
    (typeof userProfile?.fullName === 'string' && userProfile.fullName.charAt(0).toUpperCase()) ||
    (typeof userProfile?.gender === 'string' && userProfile.gender.charAt(0).toUpperCase()) ||
    'U';

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Account"
      subtitle={session?.isDemo ? 'DEMO SESSION' : 'SIGNED IN'}
      heightFraction={0.75}
    >
          {loading ? (
            <View style={{ paddingVertical: 60, alignItems: 'center' }}>
              <ActivityIndicator color={ACCENT} />
            </View>
          ) : (
            // `flex: 1` so the list scrolls inside the panel's fixed height
            // rather than overflowing past its rounded bottom edge.
            <ScrollView
              style={{ flex: 1 }}
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
                  {userProfile?.fullName || formatPhone(session?.phoneNumber)}
                </Text>
                {!!userProfile && (
                  <Text style={{ color: '#64748b', fontSize: 11, marginTop: 5 }}>
                    {[userProfile.gender, userProfile.age && `${userProfile.age} yrs`,
                      userProfile.weightKg && `${userProfile.weightKg} kg`]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                )}

                <Button
                  label="Edit details"
                  onPress={onEditProfile}
                  variant="secondary"
                  size="sm"
                  icon={<Pencil color={ACCENT} size={13} strokeWidth={2.5} />}
                  style={{
                    marginTop: 16,
                    backgroundColor: 'rgba(0,242,254,0.08)',
                    borderColor: 'rgba(0,242,254,0.25)',
                  }}
                  textStyle={{ color: ACCENT, letterSpacing: 1.2, textTransform: 'uppercase' }}
                  accessibilityLabel="Edit personal details"
                />
              </View>

              <Row
                icon={<Phone color="#94a3b8" size={17} />}
                label="Phone"
                value={formatPhone(session?.phoneNumber)}
              />
              <Row
                icon={<Target color={ACCENT} size={17} />}
                label="Daily goal"
                value={
                  targetMl !== null
                    ? `${targetMl} ml`
                    : profileNeedsPhysicianLimit(userProfile)
                    ? 'Add your doctor’s limit'
                    : 'Loading…'
                }
              />
              {/* The activity level is shown by its configured title, not by
                  its stored id, and says "Not set" rather than defaulting to
                  "Moderate" — a value the user never chose should not be
                  presented back to them as though they had.

                  The "Fitness goal" row that used to sit here was removed:
                  nothing in onboarding or the editor ever collects that field,
                  so it read "Not set" for every user who has ever installed
                  the app. */}
              <Row
                icon={<Activity color="#a78bfa" size={17} />}
                label="Activity level"
                value={activityLabel}
              />
              <Row
                icon={<Moon color="#818cf8" size={17} />}
                label="Sleep window (alerts paused)"
                value={sleepWindowLabel}
              />

              {/* Log out */}
              <Button
                label="LOG OUT"
                onPress={confirmSignOut}
                variant="danger"
                size="lg"
                loading={signingOut}
                icon={<LogOut color="#f43f5e" size={18} strokeWidth={2.5} />}
                style={{ marginHorizontal: 20, marginTop: 26 }}
                textStyle={{ letterSpacing: 1.2 }}
                accessibilityLabel="Log out"
              />
        </ScrollView>
      )}
    </Sheet>
  );
};

export default ProfileSheet;
