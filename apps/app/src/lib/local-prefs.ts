// Small device-local values (e.g. last appearance) read synchronously at startup to avoid a
// theme flash before the profile loads. Synced preferences live in the profile, not here.
import 'expo-sqlite/localStorage/install';

export const localPrefs = {
  get(key: string): string | null {
    try {
      return globalThis.localStorage?.getItem(`strata.${key}`) ?? null;
    } catch {
      return null;
    }
  },
  set(key: string, value: string | null): void {
    try {
      if (value === null) globalThis.localStorage?.removeItem(`strata.${key}`);
      else globalThis.localStorage?.setItem(`strata.${key}`, value);
    } catch {
      // Storage unavailable (private mode); the synced profile value still applies.
    }
  },
};
