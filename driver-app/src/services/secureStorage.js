import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import nacl from 'tweetnacl';
import {
  decodeBase64,
  decodeUTF8,
  encodeBase64,
  encodeUTF8
} from 'tweetnacl-util';

const ROUTE_CACHE_KEY = 'readyroute_route_cache_encryption_key_v1';
const ENCRYPTED_VALUE_VERSION = 1;

async function isSecureStoreAvailable() {
  try {
    return await SecureStore.isAvailableAsync();
  } catch (_error) {
    return false;
  }
}

export async function setSecureItem(key, value, options = {}) {
  if (!(await isSecureStoreAvailable())) {
    await AsyncStorage.removeItem(key);
    return false;
  }

  await SecureStore.setItemAsync(key, value, {
    keychainAccessible: options.keychainAccessible || SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
  });
  await AsyncStorage.removeItem(key);
  return true;
}

export async function getSecureItem(key) {
  if (!(await isSecureStoreAvailable())) {
    await AsyncStorage.removeItem(key);
    return null;
  }

  const secureValue = await SecureStore.getItemAsync(key);
  if (secureValue) {
    return secureValue;
  }

  const legacyValue = await AsyncStorage.getItem(key);
  if (!legacyValue) {
    return null;
  }

  await setSecureItem(key, legacyValue);
  return legacyValue;
}

export async function removeSecureItem(key) {
  if (await isSecureStoreAvailable()) {
    await SecureStore.deleteItemAsync(key);
  }
  await AsyncStorage.removeItem(key);
}

async function getRouteCacheEncryptionKey() {
  if (!(await isSecureStoreAvailable())) {
    return null;
  }

  const existingKey = await SecureStore.getItemAsync(ROUTE_CACHE_KEY);
  if (existingKey) {
    return decodeBase64(existingKey);
  }

  const generatedKey = await Crypto.getRandomBytesAsync(nacl.secretbox.keyLength);
  await SecureStore.setItemAsync(ROUTE_CACHE_KEY, encodeBase64(generatedKey), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
  });
  return generatedKey;
}

export async function writeEncryptedCacheItem(storageKey, value) {
  const encryptionKey = await getRouteCacheEncryptionKey();
  if (!encryptionKey) {
    await AsyncStorage.removeItem(storageKey);
    return false;
  }

  const nonce = await Crypto.getRandomBytesAsync(nacl.secretbox.nonceLength);
  const ciphertext = nacl.secretbox(decodeUTF8(value), nonce, encryptionKey);
  await AsyncStorage.setItem(storageKey, JSON.stringify({
    version: ENCRYPTED_VALUE_VERSION,
    nonce: encodeBase64(nonce),
    ciphertext: encodeBase64(ciphertext)
  }));
  return true;
}

export async function readEncryptedCacheItem(storageKey) {
  const rawValue = await AsyncStorage.getItem(storageKey);
  if (!rawValue) {
    return null;
  }

  try {
    const envelope = JSON.parse(rawValue);
    if (
      envelope?.version !== ENCRYPTED_VALUE_VERSION ||
      !envelope?.nonce ||
      !envelope?.ciphertext
    ) {
      await AsyncStorage.removeItem(storageKey);
      return null;
    }

    const encryptionKey = await getRouteCacheEncryptionKey();
    if (!encryptionKey) {
      await AsyncStorage.removeItem(storageKey);
      return null;
    }

    const plaintext = nacl.secretbox.open(
      decodeBase64(envelope.ciphertext),
      decodeBase64(envelope.nonce),
      encryptionKey
    );

    if (!plaintext) {
      await AsyncStorage.removeItem(storageKey);
      return null;
    }

    return encodeUTF8(plaintext);
  } catch (_error) {
    await AsyncStorage.removeItem(storageKey);
    return null;
  }
}

export async function clearRouteCacheEncryptionKey() {
  if (await isSecureStoreAvailable()) {
    await SecureStore.deleteItemAsync(ROUTE_CACHE_KEY);
  }
}

export {
  ENCRYPTED_VALUE_VERSION,
  ROUTE_CACHE_KEY
};
