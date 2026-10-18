import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  NativeModules,
  Platform,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Bluetooth, ChevronRight, Info, Radio } from 'lucide-react-native';
import { BleManager, Device } from 'react-native-ble-plx';
import { checkMultiple, requestMultiple, PERMISSIONS, RESULTS } from 'react-native-permissions';

import { ensureRuntimePermissions } from '../utils/runtimePermissions';
import { themed, tone } from '../theme/theme';

/**
 * Connecting the GetVari wearable: the scan, the permissions it needs, the
 * pairing, and the screen that drives them.
 *
 * Shared by onboarding's last step and the dashboard's "+" (connect device)
 * button, so the two are one implementation rather than two copies.
 */

/** One manager for the app: react-native-ble-plx expects a single instance. */
const manager = new BleManager();
const GETVARI_SERVICE_UUID = '0000ffe0-0000-1000-8000-00805f9b34fb';

export type BleState =
  | 'idle'
  | 'checking'
  | 'bluetoothOff'
  | 'requesting'
  | 'scanning'
  | 'devicesFound'
  | 'noDevicesFound'
  | 'connecting'
  | 'connected'
  | 'error';

export interface DeviceConnection {
  bleState: BleState;
  devices: Device[];
  connectedDevice: Device | null;
  scan: () => Promise<void>;
  connect: (device: Device) => Promise<void>;
  /** Stops a scan in progress, e.g. when its screen is closed. */
  stopScan: () => void;
}

const requestPermissions = async () => {
  if (Platform.OS === 'android') {
    const apiLevel = parseInt(String(Platform.Version), 10);
    // Checked first: permissions already granted are never asked for again,
    // and only the missing ones get a dialog. One combined request — three
    // concurrent `request` calls could overlap, and on some phones the
    // overlapping one comes back denied without a dialog.
    const permissions =
      apiLevel >= 31
        ? [
            PERMISSIONS.ANDROID.BLUETOOTH_SCAN,
            PERMISSIONS.ANDROID.BLUETOOTH_CONNECT,
            PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION,
          ]
        : [PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION];
    const result = await ensureRuntimePermissions(permissions, { checkMultiple, requestMultiple, RESULTS });
    return result === 'granted';
  }
  return true;
};

/**
 * The scan and pairing state.
 *
 * `onErrorMessage` receives the scan's error text (and '' when a new scan
 * starts), for a screen that shows errors in its own place — onboarding's
 * line under the card.
 */
export const useDeviceConnection = (
  options: { onErrorMessage?: (message: string) => void } = {}
): DeviceConnection => {
  const [bleState, setBleState] = useState<BleState>('idle');
  const [devices, setDevices] = useState<Device[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);

  const onErrorRef = useRef(options.onErrorMessage);
  onErrorRef.current = options.onErrorMessage;
  const setErrorMsg = (message: string) => onErrorRef.current?.(message);

  /**
   * The scan's timers, held so a new scan — or leaving the screen — cancels
   * the previous one. Left running, the old ten-second timeout would fire
   * into a scan that had already been restarted and stop it early.
   */
  const scanFlushRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearScanTimers = () => {
    if (scanFlushRef.current) clearInterval(scanFlushRef.current);
    if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
    scanFlushRef.current = null;
    scanTimeoutRef.current = null;
  };

  useEffect(() => {
    return () => {
      manager.stopDeviceScan();
      clearScanTimers();
    };
  }, []);

  const stopScan = useCallback(() => {
    manager.stopDeviceScan();
    clearScanTimers();
    setBleState(current => (current === 'scanning' ? 'idle' : current));
  }, []);

  const handleScanBLE = async () => {
    if (bleState === 'scanning') return;

    setBleState('checking');
    setDevices([]);

    const currentState = await manager.state();
    // A phone with no Bluetooth LE at all: say so, rather than asking the
    // user to "turn on" something the phone does not have.
    if (currentState === 'Unsupported') {
      setBleState('idle');
      Alert.alert(
        'Bluetooth not supported',
        "This phone doesn't support Bluetooth LE, so the wearable can't connect. You can continue and log water manually."
      );
      return;
    }
    if (currentState !== 'PoweredOn') {
      setBleState('bluetoothOff');
      Alert.alert(
        "Bluetooth is turned off",
        "Please turn on Bluetooth to scan and connect to your device.",
        [
          { text: "Cancel", onPress: () => setBleState('idle'), style: "cancel" },
          {
            text: "Turn On",
            onPress: async () => {
              if (Platform.OS === 'android') {
                try {
                  // Listen for state change BEFORE enabling
                  const sub = manager.onStateChange((state) => {
                    console.log('[DeviceConnect] Bluetooth state changed:', state);
                    if (state === 'PoweredOn') {
                      sub.remove();
                      // Small delay to ensure stack is ready
                      setTimeout(handleScanBLE, 800);
                    }
                  }, true);

                  const { BluetoothModule } = NativeModules;
                  if (BluetoothModule) {
                    const enabled = await BluetoothModule.enableBluetooth();
                    if (!enabled) {
                      sub.remove();
                      setBleState('idle');
                    }
                  } else {
                    console.warn('[DeviceConnect] BluetoothModule is not registered');
                    Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS');
                    setBleState('idle');
                  }
                } catch (e) {
                  console.error('[DeviceConnect] Native enable failed:', e);
                  Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS');
                  setBleState('idle');
                }
              } else {
                Linking.openSettings();
              }
            }
          }
        ]
      );
      return;
    }

    const hasPermission = await requestPermissions();
    if (!hasPermission) {
      setBleState('error');
      Alert.alert(
        "Permissions Required",
        "GetVari needs Bluetooth and Location access to find your device.",
        [
          { text: "Cancel", style: "cancel", onPress: () => setBleState('idle') },
          { text: "Open Settings", onPress: () => Linking.openSettings() }
        ]
      );
      return;
    }

    setBleState('scanning');
    setErrorMsg('');

    /**
     * The scan used to run its full ten seconds every time and re-render this
     * screen on every advertisement packet. Three separate costs:
     *
     *  - it never stopped early, so finding the wearable in one second still
     *    meant waiting nine more;
     *  - `setDevices` was called per packet, and the RSSI branch fired a fresh
     *    render whenever any nearby device's signal moved 5 dBm. With a dozen
     *    BLE devices in range that is several full re-renders a second of a
     *    screen carrying SVG gradients and entering animations;
     *  - every device in range went into the list, so the user's own wearable
     *    arrived somewhere in a pile of headphones and TVs.
     *
     * Results are now collected into a ref and flushed on an interval, the
     * scan stops the moment a GetVari device appears, and GetVari devices sort
     * to the top. The ten seconds is now only the ceiling for *not* finding it.
     */
    const found = new Map<string, Device>();
    let dirty = false;

    const isGetVariDevice = (device: Device): boolean =>
      Boolean(
        (device.serviceUUIDs && device.serviceUUIDs.includes(GETVARI_SERVICE_UUID)) ||
          (device.name && device.name.toLowerCase().includes('getvari'))
      );

    /** The wearable first, then everything else strongest-signal first. */
    const flush = () => {
      if (!dirty) return;
      dirty = false;
      setDevices(
        [...found.values()].sort((a, b) => {
          const byKind = Number((b as any).isGetVari) - Number((a as any).isGetVari);
          return byKind !== 0 ? byKind : (b.rssi ?? -999) - (a.rssi ?? -999);
        })
      );
    };

    const stop = (next: (current: string) => string) => {
      manager.stopDeviceScan();
      clearScanTimers();
      dirty = true;
      flush();
      setBleState(current => next(current) as typeof current);
    };

    manager.startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
      if (error) {
        if (error.message.includes('powered off')) {
          stop(() => 'bluetoothOff');
        } else {
          console.log('[DeviceConnect] BLE Scan Error:', error.message);
          setErrorMsg(error.message);
          stop(() => 'error');
        }
        return;
      }

      if (!device) return;

      const known = found.get(device.id);
      if (!known) {
        (device as any).isGetVari = isGetVariDevice(device);
        found.set(device.id, device);
        dirty = true;
        console.log('[DeviceConnect] Found new device:', device.name || 'Unnamed', device.id);

        // The wearable is the whole point of this screen. Once it is in the
        // list there is nothing left to wait for.
        if ((device as any).isGetVari) {
          stop(current => (current === 'scanning' ? 'devicesFound' : current));
          return;
        }
      } else if (Math.abs((known.rssi || 0) - (device.rssi || 0)) > 5) {
        (device as any).isGetVari = (known as any).isGetVari;
        found.set(device.id, device);
        dirty = true;
      }
    });

    // Batched rather than per packet: the list only has to look live, and four
    // updates a second is well past what anyone can read.
    scanFlushRef.current = setInterval(flush, 250);

    // The ceiling, not the duration — a scan that finds the wearable stops as
    // soon as it does.
    scanTimeoutRef.current = setTimeout(() => {
      stop(current =>
        current === 'scanning' ? (found.size > 0 ? 'devicesFound' : 'noDevicesFound') : current
      );
    }, 10000);
  };

  const connectToDevice = async (device: Device) => {
    manager.stopDeviceScan();
    try {
      const connected = await manager.connectToDevice(device.id);
      await connected.discoverAllServicesAndCharacteristics();
      setConnectedDevice(connected);
      setBleState('connected');
    } catch (e: any) {
      console.error('Connection error:', e);
      Alert.alert("Connection Failed", `Could not connect to ${device.name || 'device'}`);
      setBleState('idle');
    }
  };

  return {
    bleState,
    devices,
    connectedDevice,
    scan: handleScanBLE,
    connect: connectToDevice,
    stopScan,
  };
};

/**
 * The connection screen: the wearable card with its Scan button and status,
 * and the list of devices found. `showHeading` draws the screen's own title,
 * for a host (onboarding) that has none of its own.
 */
export const DeviceConnectPanel: React.FC<{ connection: DeviceConnection; showHeading?: boolean }> = ({
  connection,
  showHeading = true,
}) => {
  const { bleState, devices, connectedDevice, scan, connect } = connection;
  return (
    <>
      {showHeading && (
        <>
          <Text className={themed('text-2xl font-black text-white mb-1')}>Sensor Synaptic Connect</Text>
          <Text className={themed('text-[12px] text-neutral-400 mb-10')}>Connect the proprietary GetVari wearable.</Text>
        </>
      )}

      <View className={themed('w-full p-6 bg-white/[0.02] border border-white/5 rounded-3xl mb-4')}>
        <View className={themed('flex-row justify-between items-start mb-6')}>
          <View>
            <View className={themed('bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded self-start mb-2')}>
              <Text className={themed('text-[8px] text-amber-500 font-mono font-bold uppercase tracking-widest')}>Prototyping Node</Text>
            </View>
            <View className={themed('flex-row items-center gap-2')}>
              <Radio size={16} color={tone('#00f2fe', '#0891b2')} />
              <Text className={themed('text-white font-black text-[15px]')}>
                {connectedDevice?.name || 'GetVari Wearable Node'}
              </Text>
            </View>
            <Text className={themed('text-neutral-500 text-[10px] mt-1')}>Pairs directly over standard BLE.</Text>
          </View>
          <TouchableOpacity
            onPress={scan}
            disabled={bleState === 'scanning' || !!connectedDevice}
            className={themed(`px-4 py-2 rounded-xl items-center justify-center ${connectedDevice ? 'bg-white/5 border border-white/10' : 'bg-[#00f2fe]'}`)}
          >
            <Text className={themed(`text-[11px] font-black uppercase ${connectedDevice ? 'text-neutral-500' : 'text-[#01040a]'}`)}>
              {connectedDevice ? 'Connected' : bleState === 'scanning' ? 'Scanning...' : (devices.length > 0 ? 'Scan Again' : 'Scan BLE')}
            </Text>
          </TouchableOpacity>
        </View>

        {bleState === 'scanning' && (
          <View className={themed('space-y-2')}>
            <View className={themed('flex-row justify-between')}>
              <Text className={themed('text-[9px] text-[#00f2fe] font-mono')}>SCANNING CARRIER WAVE...</Text>
              <ActivityIndicator size="small" color={tone('#00f2fe', '#0891b2')} style={{ transform: [{ scale: 0.6 }] }} />
            </View>
            <View className={themed('h-1.5 w-full bg-white/5 rounded-full overflow-hidden mt-2')}>
              <View style={{ width: '65%' }} className={themed('h-full bg-[#00f2fe]')} />
            </View>
          </View>
        )}

        {bleState === 'noDevicesFound' && (
          <View className={themed('mt-2')}>
            <Text className={themed('text-[10px] text-red-400 font-medium text-center')}>No BLE devices found. Make sure your device is nearby and try again.</Text>
          </View>
        )}

        {connectedDevice && (
          <View className={themed('bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-xl flex-row items-center gap-3')}>
            <Info size={14} color={tone('#10b981', '#047857')} />
            <Text className={themed('text-[10px] text-emerald-500 font-medium flex-1')}>
              {connectedDevice.name || 'Device'} paired successfully. Real-time streaming link established.
            </Text>
          </View>
        )}
      </View>

      {devices.length > 0 && !connectedDevice && (
        <View className={themed('space-y-2')}>
          <Text className={themed('text-[10px] text-neutral-500 font-mono uppercase tracking-widest mb-2')}>Available Devices</Text>
          {devices.map((device) => (
            <TouchableOpacity key={device.id} onPress={() => connect(device)} className={themed('w-full p-4 bg-white/5 border border-white/10 rounded-2xl flex-row items-center justify-between')}>
              <View className={themed('flex-row items-center gap-3')}>
                <Bluetooth size={16} color={tone('#a3b3cc', '#52525b')} />
                <View>
                  <Text className={themed('text-white font-bold text-sm')}>{device.name || 'Unnamed Device'}</Text>
                  <Text className={themed('text-[10px] text-neutral-500 font-mono')}>{device.id}</Text>
                </View>
              </View>
              <View className={themed('flex-row items-center gap-2')}>
                <Text className={themed('text-[10px] text-neutral-500 font-mono')}>{device.rssi} dBm</Text>
                <ChevronRight size={14} color="#64748b" />
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </>
  );
};
