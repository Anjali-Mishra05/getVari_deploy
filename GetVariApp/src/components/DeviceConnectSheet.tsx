import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { CircleAlert } from 'lucide-react-native';

import Sheet from './ui/Sheet';
import { DeviceConnectPanel, useDeviceConnection } from './DeviceConnect';
import { themed, useThemeMode } from '../theme/theme';

interface DeviceConnectSheetProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * The dashboard's "+" (connect device): onboarding's connection screen, in a
 * sheet, so a user can connect the wearable after setup — or reconnect it.
 *
 * Mounted with the dashboard rather than only while open, so a device paired
 * here still shows as connected the next time the sheet is opened. Closing it
 * stops a scan that is still running.
 */
const DeviceConnectSheet: React.FC<DeviceConnectSheetProps> = ({ visible, onClose }) => {
  useThemeMode();
  // The scan's error text, shown under the panel as onboarding shows it under its card.
  const [errorMsg, setErrorMsg] = useState('');
  const connection = useDeviceConnection({ onErrorMessage: setErrorMsg });

  const close = () => {
    connection.stopScan();
    onClose();
  };

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title="Connect device"
      subtitle="GETVARI WEARABLE"
      heightFraction={0.75}
      scrollable
    >
      <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 28 }}>
        <Text className={themed('text-[12px] text-neutral-400 mb-5')}>Connect the proprietary GetVari wearable.</Text>
        <DeviceConnectPanel connection={connection} showHeading={false} />
        {!!errorMsg && (
          <View className={themed('flex-row items-center gap-2 mt-3')}>
            <CircleAlert size={12} color="#f87171" />
            <Text className={themed('text-[10px] text-red-400 font-mono flex-1')}>{errorMsg}</Text>
          </View>
        )}
      </View>
    </Sheet>
  );
};

export default DeviceConnectSheet;
