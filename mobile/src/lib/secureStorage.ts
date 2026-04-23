import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

// Supabase's `storage` option expects an AsyncStorage-compatible shape:
//   { getItem, setItem, removeItem } that all return Promises.
// On native we want tokens stored in the OS keychain (expo-secure-store), not
// in plaintext AsyncStorage. On web, SecureStore does not exist, so we fall
// back to AsyncStorage (which on web is backed by localStorage).
//
// We also transparently migrate any legacy AsyncStorage-stored token into
// SecureStore the first time it's read, then delete the plaintext copy.

export interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

// SecureStore keys must match /^[\w.-]+$/ — Supabase uses keys like
// "sb-<project-ref>-auth-token" which are already compliant.

const useSecureStore = Platform.OS !== 'web';

async function migrateFromAsyncStorage(key: string): Promise<string | null> {
  const legacy = await AsyncStorage.getItem(key);
  if (legacy === null) return null;
  // Found plaintext token — move it into SecureStore and wipe the old copy.
  try {
    await SecureStore.setItemAsync(key, legacy);
    await AsyncStorage.removeItem(key);
  } catch {
    // If SecureStore write fails (very old device, etc.) leave the fallback
    // in AsyncStorage so the user is not force-logged-out.
    return legacy;
  }
  return legacy;
}

export const secureStorage: StorageAdapter = {
  async getItem(key) {
    if (!useSecureStore) return AsyncStorage.getItem(key);
    const value = await SecureStore.getItemAsync(key);
    if (value !== null) return value;
    return migrateFromAsyncStorage(key);
  },

  async setItem(key, value) {
    if (!useSecureStore) {
      await AsyncStorage.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },

  async removeItem(key) {
    if (!useSecureStore) {
      await AsyncStorage.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
    // Ensure any leftover legacy copy is also gone.
    await AsyncStorage.removeItem(key);
  },
};
