// Native session storage. Supabase sessions can exceed SecureStore's ~2 KB limit, so the
// session is AES-encrypted and kept in SQLite-backed localStorage, while the 256-bit key
// lives in the Keychain / Keystore via SecureStore.
import 'expo-sqlite/localStorage/install';

import * as aesjs from 'aes-js';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const KEY_PREFIX = 'strata.session-key.';

async function keyFor(name: string, create: boolean): Promise<Uint8Array | null> {
  const stored = await SecureStore.getItemAsync(KEY_PREFIX + name);
  if (stored) return aesjs.utils.hex.toBytes(stored);
  if (!create) return null;
  const key = Crypto.getRandomBytes(32);
  await SecureStore.setItemAsync(KEY_PREFIX + name, aesjs.utils.hex.fromBytes(key));
  return key;
}

function storageKey(name: string): string {
  return `strata.session.${name}`;
}

export const encryptedSessionStorage = {
  async getItem(name: string): Promise<string | null> {
    const encrypted = globalThis.localStorage.getItem(storageKey(name));
    if (!encrypted) return null;
    const key = await keyFor(name, false);
    if (!key) return null;
    try {
      const [ivHex, dataHex] = encrypted.split(':');
      const cipher = new aesjs.ModeOfOperation.ctr(key, new aesjs.Counter(aesjs.utils.hex.toBytes(ivHex)));
      return aesjs.utils.utf8.fromBytes(cipher.decrypt(aesjs.utils.hex.toBytes(dataHex)));
    } catch {
      return null;
    }
  },
  async setItem(name: string, value: string): Promise<void> {
    const key = await keyFor(name, true);
    if (!key) return;
    const iv = Crypto.getRandomBytes(16);
    const cipher = new aesjs.ModeOfOperation.ctr(key, new aesjs.Counter(iv));
    const data = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
    globalThis.localStorage.setItem(
      storageKey(name),
      `${aesjs.utils.hex.fromBytes(iv)}:${aesjs.utils.hex.fromBytes(data)}`,
    );
  },
  async removeItem(name: string): Promise<void> {
    globalThis.localStorage.removeItem(storageKey(name));
    await SecureStore.deleteItemAsync(KEY_PREFIX + name);
  },
};
