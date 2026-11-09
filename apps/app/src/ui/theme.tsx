import type { Appearance } from '@strata/shared';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { localPrefs } from '@/lib/local-prefs';

import { palette, type Colors } from './tokens';

type Theme = {
  scheme: 'light' | 'dark';
  colors: Colors;
  preference: Appearance;
  setPreference: (value: Appearance) => void;
};

const ThemeContext = createContext<Theme | null>(null);

function initialPreference(): Appearance {
  const stored = localPrefs.get('appearance');
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreferenceState] = useState<Appearance>(initialPreference);
  const setPreference = useCallback((value: Appearance) => {
    setPreferenceState(value);
    localPrefs.set('appearance', value);
  }, []);
  const scheme = preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;
  const value = useMemo<Theme>(
    () => ({ scheme, colors: palette[scheme], preference, setPreference }),
    [scheme, preference, setPreference],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme must be used inside ThemeProvider');
  return theme;
}
