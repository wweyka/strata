import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { describeError } from '@/data/errors';
import { AuthShell, TextLink } from '@/features/auth/AuthShell';
import { authCallbackUrl } from '@/features/auth/redirects';
import { db } from '@/lib/supabase';
import { Button, Notice, TextField, space } from '@/ui';

export default function ForgotPassword() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!email.trim()) {
      setError(t('auth.invalidEmail'));
      return;
    }
    setLoading(true);
    const { error: resetError } = await db().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: authCallbackUrl('reset-password'),
    });
    setLoading(false);
    if (resetError) setError(describeError(resetError, t));
    else setSent(true);
  };

  return (
    <AuthShell
      title={t('auth.forgotTitle')}
      subtitle={t('auth.forgotSubtitle')}
      footer={<TextLink href="/sign-in" label={t('auth.backToSignIn')} />}
    >
      {sent ? (
        // Same message whether or not the address has an account, so accounts can't be probed.
        <Notice tone="success">{t('auth.forgotSent', { email: email.trim() })}</Notice>
      ) : (
        <View style={{ gap: space[4] }}>
          <TextField
            label={t('auth.email')}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            returnKeyType="send"
            onSubmitEditing={submit}
          />
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <Button label={t('auth.sendResetLink')} fullWidth loading={loading} onPress={submit} />
        </View>
      )}
    </AuthShell>
  );
}
