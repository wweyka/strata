import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { describeError } from '@/data/errors';
import { AuthShell } from '@/features/auth/AuthShell';
import { db } from '@/lib/supabase';
import { Button, Notice, TextField, space } from '@/ui';

export default function ResetPassword() {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async () => {
    setError(null);
    if (password.length < 8) return setError(t('auth.passwordTooShort'));
    if (password !== confirm) return setError(t('auth.passwordsDiffer'));
    setLoading(true);
    const { error: updateError } = await db().auth.updateUser({ password });
    setLoading(false);
    if (updateError) setError(describeError(updateError, t));
    else setDone(true);
  };

  return (
    <AuthShell title={t('auth.resetTitle')} subtitle={done ? undefined : t('auth.resetSubtitle')}>
      {done ? (
        <View style={{ gap: space[4] }}>
          <Notice tone="success">{t('auth.resetDone')}</Notice>
          <Button label={t('common.continue')} fullWidth onPress={() => router.replace('/')} />
        </View>
      ) : (
        <View style={{ gap: space[4] }}>
          <TextField
            label={t('auth.newPassword')}
            value={password}
            onChangeText={setPassword}
            password
            autoComplete="new-password"
            textContentType="newPassword"
            hint={t('auth.passwordHint')}
          />
          <TextField
            label={t('auth.confirmPassword')}
            value={confirm}
            onChangeText={setConfirm}
            password
            autoComplete="new-password"
            returnKeyType="go"
            onSubmitEditing={submit}
          />
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <Button label={t('auth.savePassword')} fullWidth loading={loading} onPress={submit} />
        </View>
      )}
    </AuthShell>
  );
}
