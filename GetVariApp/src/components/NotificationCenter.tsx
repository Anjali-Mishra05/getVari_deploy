import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { AlarmClock, BellOff, Check, Droplets, MessageCircle, Monitor, Trash2, Bell } from 'lucide-react-native';

import Sheet, { ICON_HIT_SLOP } from './ui/Sheet';

import NotificationHistory, { isActionable } from '../services/NotificationHistory';
import NotificationService from '../services/NotificationService';
import ChatBus from '../services/ChatBus';
import { formatDeliveredAt, formatClock } from '../utils/notificationFormat';
import type { NotificationRecord } from '../types';

interface NotificationCenterProps {
  visible: boolean;
  onClose: () => void;
}

/** Relative labels ("4m ago") go stale while the sheet sits open. */
const TICK_MS = 30 * 1000;

/** Matches the sheet's exit animation, so hand-offs wait for it to finish. */
const CLOSE_ANIMATION_MS = 320;

const ACCENT = '#00f2fe';

const NotificationRow: React.FC<{
  record: NotificationRecord;
  now: number;
  onOpen: (record: NotificationRecord) => void;
}> = ({ record, now, onOpen }) => {
  const isReminder = record.kind === 'hydration_reminder';
  const opened = record.pressedAt !== null;
  const actionable = isActionable(record);

  // Only an unanswered notification is pressable. Once it is opened — or
  // settled by a newer one — the row is a record, not a control.
  const Container: any = actionable ? TouchableOpacity : View;

  return (
    <Container
      {...(actionable
        ? {
            onPress: () => onOpen(record),
            activeOpacity: 0.7,
            accessibilityRole: 'button',
            accessibilityLabel: `Open ${record.title}`,
          }
        : {})}
      style={{
        flexDirection: 'row',
        paddingVertical: 16,
        paddingHorizontal: 20,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
        // Settled rows recede so the one still asking something stands out.
        opacity: actionable ? 1 : 0.55,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 14,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 14,
          backgroundColor: isReminder ? 'rgba(0,242,254,0.08)' : 'rgba(255,255,255,0.04)',
          borderWidth: 1,
          borderColor: isReminder ? 'rgba(0,242,254,0.2)' : 'rgba(255,255,255,0.08)',
        }}
      >
        {isReminder ? (
          <Droplets color={ACCENT} size={18} />
        ) : (
          <Bell color="#94a3b8" size={18} />
        )}
      </View>

      <View style={{ flex: 1 }}>
        <Text
          style={{ color: '#ffffff', fontSize: 14, fontWeight: '800' }}
          numberOfLines={1}
        >
          {record.title}
        </Text>

        {!!record.body && (
          <Text
            style={{ color: '#94a3b8', fontSize: 12, marginTop: 3, lineHeight: 17 }}
            numberOfLines={2}
          >
            {record.body}
          </Text>
        )}

        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 9 }}>
          <Text
            style={{
              color: '#64748b',
              fontSize: 10,
              fontWeight: '700',
              letterSpacing: 0.6,
            }}
          >
            {formatDeliveredAt(record.deliveredAt, now).toUpperCase()}
          </Text>

          <View
            style={{
              width: 3,
              height: 3,
              borderRadius: 2,
              backgroundColor: '#334155',
              marginHorizontal: 8,
            }}
          />

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 8,
              backgroundColor: opened
                ? 'rgba(16,185,129,0.1)'
                : actionable
                ? 'rgba(0,242,254,0.1)'
                : 'rgba(255,255,255,0.04)',
              borderWidth: 1,
              borderColor: opened
                ? 'rgba(16,185,129,0.25)'
                : actionable
                ? 'rgba(0,242,254,0.28)'
                : 'rgba(255,255,255,0.08)',
            }}
          >
            {opened ? (
              <Check color="#10b981" size={10} strokeWidth={3.5} />
            ) : actionable ? (
              <MessageCircle color={ACCENT} size={10} strokeWidth={3} />
            ) : (
              <BellOff color="#64748b" size={10} strokeWidth={2.5} />
            )}
            <Text
              style={{
                color: opened ? '#10b981' : actionable ? ACCENT : '#64748b',
                fontSize: 9,
                fontWeight: '900',
                letterSpacing: 0.8,
                marginLeft: 5,
              }}
            >
              {opened
                ? `OPENED ${formatClock(record.pressedAt!)}`
                : actionable
                ? 'TAP TO OPEN'
                : 'SETTLED'}
            </Text>
          </View>
        </View>
      </View>
    </Container>
  );
};

/**
 * The bell menu: every notification this app has delivered, when it arrived,
 * and whether the user ever tapped it.
 *
 * The list is read fresh on open and then kept in step with the log, because
 * a reminder can fire while the sheet is sitting open.
 */
const NotificationCenter: React.FC<NotificationCenterProps> = ({ visible, onClose }) => {
  const [records, setRecords] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [alarmsBatched, setAlarmsBatched] = useState(false);
  /**
   * True when a reminder would quietly arrive as a banner instead of taking
   * over the screen.
   *
   * From Android 14 the full-screen grant is auto-given only to calling and
   * alarm-clock apps; a hydration reminder is neither, so on a modern phone
   * this starts revoked and the feature silently degrades. The user is the
   * only one who can turn it on, and this sheet is where they come looking
   * when reminders are not behaving — the same reasoning as the alarm banner
   * below it.
   */
  const [fullScreenBlocked, setFullScreenBlocked] = useState(false);

  const reload = useCallback(async () => {
    try {
      setRecords(await NotificationHistory.list());
    } catch (error) {
      console.error('[Notifications] Failed to load history:', error);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;

    let cancelled = false;

    const open = async () => {
      setLoading(true);
      // Pick up anything delivered while the app was killed before reading.
      await NotificationService.syncDeliveredFromTray();
      if (cancelled) return;
      await reload();
      if (cancelled) return;
      setLoading(false);
      // Opening the sheet is what clears the badge.
      await NotificationHistory.markAllSeen();

      // Only the user can grant this, so the one place they look for
      // reminders is the right place to tell them it is off.
      const exact = await NotificationService.hasExactAlarmPermission();
      if (!cancelled) setAlarmsBatched(!exact);

      const fullScreen = await NotificationService.fullScreenReminderStatus();
      if (!cancelled) setFullScreenBlocked(!fullScreen.available);
    };

    open();

    const subscription = NotificationHistory.onChange(reload);
    const ticker = setInterval(() => setNow(Date.now()), TICK_MS);

    return () => {
      cancelled = true;
      subscription.remove();
      clearInterval(ticker);
    };
  }, [visible, reload]);

  /**
   * Empties the delivery log.
   *
   * Two things were wrong with this before. It threw away the whole log on a
   * single tap with no way back, and — because the sheet animated itself with
   * a Reanimated layout animation inside a Modal, which leaves Android's touch
   * targets behind — the tap often never arrived at all, which is what made it
   * look like the button did nothing. The animation now belongs to the Modal
   * (see `Sheet`), and the action asks first.
   */
  const clearAll = () => {
    if (records.length === 0) return;
    Alert.alert(
      'Clear notification history?',
      'This removes the delivery log from this device. Your scheduled reminders are not affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await NotificationHistory.clear();
              await reload();
            } catch (error) {
              console.error('[Notifications] Failed to clear history:', error);
              Alert.alert('Could not clear history', 'Please try again.');
            }
          },
        },
      ]
    );
  };

  /**
   * Tapping a row does what tapping the notification itself would have done:
   * marks it opened (settling every earlier reminder) and hands the event to
   * the chat. `force` is what makes this work for a reminder the OS already
   * delivered — see `HydrationPromptEvent`.
   */
  const openInChat = async (record: NotificationRecord) => {
    onClose();
    await NotificationHistory.recordPressById(record.id);

    // The chat lives in its own RN Modal. On Android, opening one modal while
    // another is still dismissing loses the second one entirely, so the event
    // is handed over only after this sheet's exit animation has finished.
    setTimeout(() => {
      ChatBus.openHydrationPrompt(record.id, { force: true });
    }, CLOSE_ANIMATION_MS);
  };

  const deliveredSummary =
    records.length > 0
      ? `${records.length} DELIVERED · ${records.filter(r => r.pressedAt !== null).length} OPENED`
      : 'DELIVERY LOG';

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Notifications"
      subtitle={deliveredSummary}
      heightFraction={0.78}
      headerActions={
        records.length > 0 ? (
          <TouchableOpacity
            onPress={clearAll}
            style={{ padding: 10 }}
            hitSlop={ICON_HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel="Clear notification history"
            testID="clear-notifications"
          >
            <Trash2 color="#94a3b8" size={20} />
          </TouchableOpacity>
        ) : null
      }
    >
          {fullScreenBlocked && (
            <TouchableOpacity
              onPress={() => NotificationService.openFullScreenReminderSettings()}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Allow reminders to open full screen"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginHorizontal: 20,
                marginTop: 14,
                paddingVertical: 12,
                paddingHorizontal: 14,
                borderRadius: 16,
                backgroundColor: 'rgba(0,242,254,0.06)',
                borderWidth: 1,
                borderColor: 'rgba(0,242,254,0.22)',
              }}
            >
              <Monitor color={ACCENT} size={18} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: ACCENT, fontSize: 12, fontWeight: '900' }}>
                  Reminders open in the background
                </Text>
                <Text style={{ color: '#94a3b8', fontSize: 11, lineHeight: 15, marginTop: 2 }}>
                  Tap to let a reminder open full screen, so it is not missed.
                </Text>
              </View>
            </TouchableOpacity>
          )}

          {/*
            Development only, and compiled out of a release build. The real
            cadence is two hours, which would make every manual check of the
            lock-screen takeover a two-hour wait.
          */}
          {__DEV__ && (
            <TouchableOpacity
              onPress={async () => {
                const at = await NotificationService.fireTestReminder(10);
                Alert.alert(
                  'Test reminder queued',
                  `It will fire at ${formatClock(at)}. Lock the phone now to see it take over the screen.`
                );
              }}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Fire a test reminder in ten seconds"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginHorizontal: 20,
                marginTop: 14,
                paddingVertical: 12,
                paddingHorizontal: 14,
                borderRadius: 16,
                backgroundColor: 'rgba(148,163,184,0.06)',
                borderWidth: 1,
                borderStyle: 'dashed',
                borderColor: 'rgba(148,163,184,0.3)',
              }}
            >
              <AlarmClock color="#94a3b8" size={18} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: '#cbd5e1', fontSize: 12, fontWeight: '900' }}>
                  Fire a test reminder (10s)
                </Text>
                <Text style={{ color: '#64748b', fontSize: 11, lineHeight: 15, marginTop: 2 }}>
                  Debug builds only. Lock the phone to watch it come up.
                </Text>
              </View>
            </TouchableOpacity>
          )}

          {alarmsBatched && (
            <TouchableOpacity
              onPress={() => NotificationService.openExactAlarmSettings()}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Allow exact alarms so reminders arrive on time"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginHorizontal: 20,
                marginTop: 14,
                paddingVertical: 12,
                paddingHorizontal: 14,
                borderRadius: 16,
                backgroundColor: 'rgba(234,179,8,0.08)',
                borderWidth: 1,
                borderColor: 'rgba(234,179,8,0.25)',
              }}
            >
              <AlarmClock color="#eab308" size={18} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: '#eab308', fontSize: 12, fontWeight: '900' }}>
                  Reminders are being delayed
                </Text>
                <Text
                  style={{ color: '#94a3b8', fontSize: 11, lineHeight: 15, marginTop: 2 }}
                >
                  Android is batching them. Tap to allow alarms &amp; reminders.
                </Text>
              </View>
            </TouchableOpacity>
          )}

          {loading ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={ACCENT} />
            </View>
          ) : records.length === 0 ? (
            <View
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 48,
              }}
            >
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 24,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'rgba(255,255,255,0.03)',
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.08)',
                  marginBottom: 18,
                }}
              >
                <BellOff color="#475569" size={26} />
              </View>
              <Text
                style={{
                  color: '#94a3b8',
                  fontSize: 13,
                  fontWeight: '700',
                  textAlign: 'center',
                }}
              >
                No notifications yet
              </Text>
              <Text
                style={{
                  color: '#475569',
                  fontSize: 11,
                  lineHeight: 17,
                  textAlign: 'center',
                  marginTop: 8,
                }}
              >
                Hydration reminders will appear here with the time they arrived
                and whether you opened them.
              </Text>
            </View>
          ) : (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: 40 }}
              showsVerticalScrollIndicator={false}
            >
              {records.map(record => (
                <NotificationRow
                  key={record.id}
                  record={record}
                  now={now}
                  onOpen={openInChat}
                />
              ))}
            </ScrollView>
          )}
    </Sheet>
  );
};

export default NotificationCenter;
