import '@/i18n';

import { Geist_400Regular } from '@expo-google-fonts/geist/400Regular';
import { Geist_500Medium } from '@expo-google-fonts/geist/500Medium';
import { Geist_600SemiBold } from '@expo-google-fonts/geist/600SemiBold';
import { InstrumentSerif_400Regular } from '@expo-google-fonts/instrument-serif/400Regular';
import { InstrumentSerif_400Regular_Italic } from '@expo-google-fonts/instrument-serif/400Regular_Italic';
import { QueryClient, QueryClientProvider, focusManager, onlineManager } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useProfile } from '@/data/profile';
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { ConfigMissing } from '@/features/ConfigMissing';
import { ProfileSync } from '@/features/ProfileSync';
import { env } from '@/lib/env';
import { db } from '@/lib/supabase';
import { Button, ErrorState, Screen, ThemeProvider, useTheme } from '@/ui';
import { useTranslation } from 'react-i18next';

SplashScreen.preventAutoHideAsync().catch(() => {});

// Refetch when the app returns to the foreground on native (the browser handles web).
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => focusManager.setFocused(state === 'active'));
}
onlineManager.setOnline(true);

function RootNavigator() {
  const { session, initializing } = useAuth();
  const profile = useProfile();
  const { colors, scheme } = useTheme();

  const signedIn = !!session;
  const profileReady = !signedIn || profile.isSuccess || profile.isError;
  const onboarded = !!profile.data?.onboarding_completed_at;
  const ready = !initializing && profileReady;

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.background).catch(() => {});
  }, [colors.background]);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  if (signedIn && profile.isError) {
    return <ProfileUnavailable onRetry={() => profile.refetch()} />;
  }

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {signedIn ? <ProfileSync /> : null}
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="index" />
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && !onboarded}>
          <Stack.Screen name="onboarding/index" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && onboarded}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="reset-password" />
        </Stack.Protected>
        <Stack.Screen name="auth/callback" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    InstrumentSerif_400Regular,
    InstrumentSerif_400Regular_Italic,
  });
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 2, refetchOnWindowFocus: true },
          mutations: { retry: 0 },
        },
      }),
  );

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        {env.isConfigured ? (
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <RootNavigator />
            </AuthProvider>
          </QueryClientProvider>
        ) : (
          <ConfigMissingRoot />
        )}
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function ConfigMissingRoot() {
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);
  return <ConfigMissing />;
}

function ProfileUnavailable({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <Screen>
      <ErrorState message={t('errors.profileUnavailable')} onRetry={onRetry} />
      <Button
        variant="ghost"
        label={t('profile.signOut')}
        onPress={() => db().auth.signOut()}
        style={{ alignSelf: 'center' }}
      />
    </Screen>
  );
}
