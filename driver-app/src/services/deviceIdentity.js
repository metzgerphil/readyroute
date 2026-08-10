import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

import { getSecureItem, setSecureItem } from './secureStorage';

const DEVICE_ID_KEY = 'readyroute_authorized_device_id';

export async function getOrCreateDeviceIdentity() {
  let deviceId = await getSecureItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = Crypto.randomUUID();
    await setSecureItem(DEVICE_ID_KEY, deviceId);
  }
  return {
    device_id: deviceId,
    device_name: `${Platform.OS} ReadyRoute device`
  };
}
