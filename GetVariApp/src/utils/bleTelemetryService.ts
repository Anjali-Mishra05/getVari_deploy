import { SensorData, ConnectionState } from '../types';
import { supabase } from '../services/SupabaseClient';
import { AuthService } from '../services/AuthService';

export interface BLEDevicePayload {
  heartRate: number;
  activityLoad: number;
  temperature: number;
  humidity: number;
  sweatGSR: number;
  batteryLevel: number;
  rssi: number;
}

export type BLEServiceCallbackMap = {
  data: (data: Partial<SensorData>) => void;
  status: (status: ConnectionState) => void;
  deviceInfo: (info: { name: string; id: string; rssi?: number; batteryLevel?: number }) => void;
};

export class BLETelemetryService {
  private device: any = null;
  private gattServer: any = null;
  private characteristic: any = null;
  private isMockMode: boolean = false;
  private mockIntervalId: any = null;
  private simulatedBattery: number = 95;
  private simulatedRssi: number = -45;
  
  private listeners: { [K in keyof BLEServiceCallbackMap]?: Set<BLEServiceCallbackMap[K]> } = {};

  // Custom GATT Profile UUIDs
  public static readonly SERVICE_UUID = '0000ffe0-0000-1000-8000-00805f9b34fb';
  public static readonly CHARACTERISTIC_UUID = '0000ffe1-0000-1000-8000-00805f9b34fb';

  constructor() {
    this.listeners = {
      data: new Set(),
      status: new Set(),
      deviceInfo: new Set(),
    };
  }

  // Subscribe to service events
  public addEventListener<K extends keyof BLEServiceCallbackMap>(event: K, callback: BLEServiceCallbackMap[K]) {
    if (!this.listeners[event]) {
      this.listeners[event] = new Set() as any;
    }
    this.listeners[event]!.add(callback);
  }

  // Unsubscribe from service events
  public removeEventListener<K extends keyof BLEServiceCallbackMap>(event: K, callback: BLEServiceCallbackMap[K]) {
    if (this.listeners[event]) {
      this.listeners[event]!.delete(callback);
    }
  }

  // Emit event to all subscribers
  private emit<K extends keyof BLEServiceCallbackMap>(event: K, ...args: Parameters<BLEServiceCallbackMap[K]>) {
    if (this.listeners[event]) {
      this.listeners[event]!.forEach((cb: any) => cb(...args));
    }
  }

  // Scan & pair GetVari devices
  public async scanAndConnect(mockMode: boolean = false, mockDeviceType?: string): Promise<void> {
    this.isMockMode = mockMode;
    this.emit('status', 'syncing');

    if (this.isMockMode) {
      // Simulate Bluetooth search and connection delays
      await new Promise((resolve) => setTimeout(resolve, 1500));
      
      this.simulatedBattery = mockDeviceType === 'WHOOP_BAND_4' ? 31 : mockDeviceType === 'OURA_RING_F4' ? 68 : 95;
      this.simulatedRssi = mockDeviceType === 'WHOOP_BAND_4' ? -84 : mockDeviceType === 'OURA_RING_F4' ? -72 : -45;
      const deviceName = mockDeviceType === 'WHOOP_BAND_4' ? 'WHOOP Strainer' : mockDeviceType === 'OURA_RING_F4' ? 'Oura Ring Gen3' : 'GetVari Core ESP32_v1';
      const deviceId = mockDeviceType === 'WHOOP_BAND_4' ? 'WHOOP_BAND_4' : mockDeviceType === 'OURA_RING_F4' ? 'OURA_RING_F4' : 'GETVARI_ESP32_A7';

      this.emit('status', 'connected');
      this.emit('deviceInfo', {
        name: deviceName,
        id: deviceId,
        rssi: this.simulatedRssi,
        batteryLevel: this.simulatedBattery
      });

      this.saveDeviceToSupabase(deviceName, deviceId, this.simulatedBattery);
      this.startMockTelemetryStream(mockDeviceType);
      return;
    }

    // Web Bluetooth API Execution
    const nav = navigator as any;
    if (!nav.bluetooth) {
      this.emit('status', 'disconnected');
      throw new Error('Web Bluetooth is not supported in this browser. Please use Simulated Hardware Mode.');
    }

    try {
      this.device = await nav.bluetooth.requestDevice({
        filters: [
          { namePrefix: 'GetVari' },
          { services: [BLETelemetryService.SERVICE_UUID] }
        ],
        optionalServices: [BLETelemetryService.SERVICE_UUID]
      });

      // Handle unexpected hardware disconnections
      this.device.addEventListener('gattserverdisconnected', this.handleDisconnection.bind(this));

      this.gattServer = await this.device.gatt.connect();
      const service = await this.gattServer.getPrimaryService(BLETelemetryService.SERVICE_UUID);
      this.characteristic = await service.getCharacteristic(BLETelemetryService.CHARACTERISTIC_UUID);

      // Start notifications for sensor broadcasts
      await this.characteristic.startNotifications();
      this.characteristic.addEventListener('characteristicvaluechanged', this.handleNotification.bind(this));

      this.emit('status', 'connected');
      this.emit('deviceInfo', {
        name: this.device.name || 'GetVari Device',
        id: this.device.id,
        rssi: -50, // Default estimated signal strength
        batteryLevel: 100 // Updated via characteristics
      });

      this.saveDeviceToSupabase(this.device.name || 'GetVari Device', this.device.id, 100);

    } catch (err: any) {
      this.emit('status', 'disconnected');
      throw err;
    }
  }

  // Terminate connection
  public disconnect(): void {
    this.stopMockTelemetryStream();
    
    if (this.gattServer && this.gattServer.connected) {
      this.gattServer.disconnect();
    }
    
    this.device = null;
    this.gattServer = null;
    this.characteristic = null;
    this.isMockMode = false;
    this.emit('status', 'disconnected');
  }

  private async saveDeviceToSupabase(name: string, deviceId: string, battery: number) {
    try {
      const userId = await AuthService.getCurrentUserId();
      if (!userId) return;

      await supabase
        .from('getvari_devices')
        .upsert({
          user_id: userId,
          device_id: deviceId,
          name: name,
          battery_level: battery,
          last_synced: new Date().toISOString(),
        });
    } catch (error) {
      console.error('Error saving device to Supabase:', error);
    }
  }

  // Handle characteristic notification packets
  private handleNotification(event: any): void {
    const value = event.target.value;
    if (!value) return;

    try {
      // 1. Binary payload decoding
      if (value.byteLength === 7) {
        const heartRate = value.getUint8(0);
        const activityLoad = value.getUint8(1);
        const tempInt = value.getUint8(2);
        const tempDec = value.getUint8(3);
        const temperature = tempInt + tempDec / 10.0;
        const humidity = value.getUint8(4);
        const batteryLevel = value.getUint8(5);
        const rssiRaw = value.getInt8(6); // signed int8 for negative RSSI values

        this.emit('data', {
          heartRate,
          activityLoad,
          temperature,
          humidity,
          batteryLevel,
          rssi: rssiRaw === 0 ? -50 : rssiRaw,
          lastUpdated: new Date().toISOString()
        });

        this.emit('deviceInfo', {
          name: this.device?.name || 'GetVari Core',
          id: this.device?.id || 'ESP32_GATT',
          rssi: rssiRaw === 0 ? -50 : rssiRaw,
          batteryLevel
        });

        if (batteryLevel < 15) {
          this.emit('status', 'low_battery');
        }
      } 
      // 2. Fallback: JSON utf-8 string decoding
      else {
        const decoder = new TextDecoder('utf-8');
        const jsonStr = decoder.decode(value);
        const parsed = JSON.parse(jsonStr);

        const decodedData: Partial<SensorData> = {
          heartRate: parsed.hr ?? parsed.heartRate,
          activityLoad: parsed.act ?? parsed.activityLoad,
          temperature: parsed.temp ?? parsed.temperature,
          humidity: parsed.hum ?? parsed.humidity,
          batteryLevel: parsed.bat ?? parsed.batteryLevel,
          rssi: parsed.rssi ?? -55,
          lastUpdated: new Date().toISOString()
        };

        this.emit('data', decodedData);
        this.emit('deviceInfo', {
          name: this.device?.name || 'GetVari Core',
          id: this.device?.id || 'ESP32_GATT',
          rssi: decodedData.rssi,
          batteryLevel: decodedData.batteryLevel
        });

        if (decodedData.batteryLevel && decodedData.batteryLevel < 15) {
          this.emit('status', 'low_battery');
        }
      }
    } catch (err) {
      console.error('Error decoding GATT packet: ', err);
    }
  }

  // Handle sudden dropoffs
  private handleDisconnection(): void {
    this.emit('status', 'disconnected');
    this.disconnect();
  }

  // In-Browser telemetry mock engine
  private startMockTelemetryStream(presetName?: string): void {
    this.stopMockTelemetryStream();

    let step = 0;
    this.mockIntervalId = setInterval(() => {
      step++;
      
      // Gradually drain battery over mock duration
      if (step % 20 === 0 && this.simulatedBattery > 1) {
        this.simulatedBattery -= 1;
      }

      // Slightly fluctuate signal strength
      const rssiNoise = Math.floor(Math.random() * 5) - 2;
      this.simulatedRssi = Math.max(-95, Math.min(-30, this.simulatedRssi + rssiNoise));

      let payload: Partial<SensorData> = {};

      if (presetName === 'OURA_RING_F4') {
        // Sleepy / Calmer states
        payload = {
          heartRate: 60 + Math.floor(Math.random() * 4) - 2,
          activityLoad: 5 + Math.floor(Math.random() * 2),
          temperature: 36.4 + (Math.random() * 0.2 - 0.1),
          humidity: 45 + Math.floor(Math.random() * 3) - 1,
          sweatGSR: 0.8 + (Math.random() * 0.1),
          batteryLevel: this.simulatedBattery,
          rssi: this.simulatedRssi,
          lastUpdated: new Date().toISOString()
        };
      } else if (presetName === 'WHOOP_BAND_4') {
        // Moderate athletic states
        payload = {
          heartRate: 110 + Math.floor(Math.random() * 12) - 6,
          activityLoad: 65 + Math.floor(Math.random() * 10) - 5,
          temperature: 25.5 + (Math.random() * 0.6 - 0.3),
          humidity: 60 + Math.floor(Math.random() * 4) - 2,
          sweatGSR: 5.4 + (Math.random() * 0.6),
          batteryLevel: this.simulatedBattery,
          rssi: this.simulatedRssi,
          lastUpdated: new Date().toISOString()
        };
      } else {
        // Default GetVari ESP32 stream: office / general activity
        const hrsCycle = Math.sin(step / 10) * 15;
        payload = {
          heartRate: Math.round(80 + hrsCycle + (Math.random() * 4 - 2)),
          activityLoad: Math.round(Math.max(10, Math.min(100, 30 + hrsCycle * 1.5 + (Math.random() * 6 - 3)))),
          temperature: parseFloat((23.0 + (Math.random() * 0.4 - 0.2)).toFixed(1)),
          humidity: Math.round(Math.max(20, Math.min(95, 50 + (Math.random() * 2 - 1)))),
          sweatGSR: parseFloat((2.0 + (Math.random() * 0.4 - 0.2)).toFixed(2)),
          batteryLevel: this.simulatedBattery,
          rssi: this.simulatedRssi,
          lastUpdated: new Date().toISOString()
        };
      }

      this.emit('data', payload);
      this.emit('deviceInfo', {
        name: presetName === 'WHOOP_BAND_4' ? 'WHOOP Strainer' : presetName === 'OURA_RING_F4' ? 'Oura Ring Gen3' : 'GetVari Core ESP32_v1',
        id: presetName === 'WHOOP_BAND_4' ? 'WHOOP_BAND_4' : presetName === 'OURA_RING_F4' ? 'OURA_RING_F4' : 'GETVARI_ESP32_A7',
        rssi: this.simulatedRssi,
        batteryLevel: this.simulatedBattery
      });

      if (this.simulatedBattery < 15) {
        this.emit('status', 'low_battery');
      }
    }, 1500);
  }

  private stopMockTelemetryStream(): void {
    if (this.mockIntervalId) {
      clearInterval(this.mockIntervalId);
      this.mockIntervalId = null;
    }
  }
}
