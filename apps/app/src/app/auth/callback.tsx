import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AuthShell } from '@/features/auth/AuthShell';
import { db } from '@/lib/supabase';
import { Button, Notice, Text, space, useTheme } from '@/ui';

/**
 * Landing route for email confirmation, password recovery and OAuth (PKCE). Exchanges the
 * one-time code for a session, then hands over to the auth guard.
 */
export default function AuthCallback() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{
    code?: string;
    next?: string;
    error?: string;
    error_description?: string;
  }>();
  const [error, setError] = useState<string | null>(null);
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    (async () => {
      // Providers may report errors in the query or, for some flows, in the URL fragment.
      const hash =
        Platform.OS === 'web' && typeof window !== 'undefined'
          ? new URLSearchParams(window.location.hash.replace(/^#/, ''))
          : null;
      const description = params.error_description ?? hash?.get('error_description');
      if (description) {
        setError(description.replace(/\+/g, ' '));
        return;
      }
      if (!params.code) {
        setError(t('callback.missingCode'));
        return;
      }
      const { error: exchangeError } = await db().auth.exchangeCodeForSession(params.code);
      if (exchangeError) {
        setError(t('callback.exchangeFailed'));
        return;
      }
      router.replace(params.next === 'reset-password' ? '/reset-password' : '/');
    })();
  }, [params.code, params.error_description, params.next, t]);

  if (!error) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[3], backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.textMuted} />
        <Text variant="small" color="textMuted">
          {t('callback.signingIn')}
        </Text>
      </View>
    );
  }

  return (
    <AuthShell title={t('callback.title')}>
      <Notice tone="danger">{error}</Notice>
      <Button label={t('auth.signIn')} fullWidth onPress={() => router.replace('/sign-in')} />
    </AuthShell>
  );
}
