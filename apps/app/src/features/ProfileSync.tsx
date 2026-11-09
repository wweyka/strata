import { useEffect } from 'react';

import { useProfile } from '@/data/profile';
import { setInterfaceLanguage } from '@/i18n';
import { useTheme } from '@/ui';

/** Applies synced preferences (language, appearance) from the profile on every device. */
export function ProfileSync() {
  const { data: profile } = useProfile();
  const { preference, setPreference } = useTheme();
  useEffect(() => {
    if (!profile) return;
    setInterfaceLanguage(profile.interface_language);
    if (profile.appearance !== preference) setPreference(profile.appearance);
    // Only react to profile changes; local changes write through to the profile.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.interface_language, profile?.appearance]);
  return null;
}
