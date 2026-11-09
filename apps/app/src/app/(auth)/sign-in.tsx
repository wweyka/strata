import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { describeError } from '@/data/errors';
import { AuthShell, TextLink } from '@/features/auth/AuthShell';
import { OAuthButtons } from '@/features/auth/OAuthButtons';
import { db } from '@/lib/supabase';
import { Button, Notice, Text, TextField, space, type TextFieldRef } from '@/ui';

export default function SignIn() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const passwordRef = useRef<TextFieldRef>(null);

  const submit = async () => {
    setError(null);
    setUnconfirmed(false);
    if (!email.trim() || !password) {
      setError(t('auth.fillBoth'));
      return;
    }
    setLoading(true);
    const { error: signInError } = await db().auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (signInError) {
      setUnconfirmed(/email not confirmed/i.test(signInError.message));
      setError(describeError(signInError, t));
    }
    // On success the auth guard routes to onboarding or the app.
  };

  return (
    <AuthShell
      title={t('auth.signInTitle')}
      subtitle={t('auth.signInSubtitle')}
      footer={
        <View style={{ flexDirection: 'row', gap: space[1], alignItems: 'center' }}>
          <Text variant="small" color="textMuted">
            {t('auth.noAccount')}
          </Text>
          <TextLink href="/sign-up" label={t('auth.createOne')} />
        </View>
      }
    >
      <View style={{ gap: space[4] }}>
        <TextField
          label={t('auth.email')}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
        />
        <TextField
          ref={passwordRef}
          label={t('auth.password')}
          value={password}
          onChangeText={setPassword}
          password
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
        <View style={{ alignSelf: 'flex-end' }}>
          <TextLink href="/forgot-password" label={t('auth.forgotPassword')} />
        </View>
        {error ? (
          <Notice tone="danger">
            <View style={{ gap: space[2] }}>
              <Text variant="small">{error}</Text>
              {unconfirmed ? (
                <Button
                  size="sm"
                  variant="secondary"
                  label={t('auth.resendConfirmation')}
                  onPress={() => router.push({ pathname: '/check-email', params: { email: email.trim() } })}
                />
              ) : null}
            </View>
          </Notice>
        ) : null}
        <Button label={t('auth.signIn')} fullWidth loading={loading} onPress={submit} />
      </View>
      <OAuthButtons />
    </AuthShell>
  );
}
