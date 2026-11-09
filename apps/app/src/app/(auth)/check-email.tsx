import { useLocalSearchParams } from 'expo-router';
import { MailCheck } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { describeError } from '@/data/errors';
import { AuthShell, TextLink } from '@/features/auth/AuthShell';
import { authCallbackUrl } from '@/features/auth/redirects';
import { db } from '@/lib/supabase';
import { Button, Notice, Text, space, useTheme } from '@/ui';

const COOLDOWN = 60;

export default function CheckEmail() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { email } = useLocalSearchParams<{ email?: string }>();
  const [cooldown, setCooldown] = useState(COOLDOWN);
  const [status, setStatus] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const resend = async () => {
    if (!email) return;
    setSending(true);
    setStatus(null);
    const { error } = await db().auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: authCallbackUrl() },
    });
    setSending(false);
    if (error) setStatus({ tone: 'danger', text: describeError(error, t) });
    else {
      setStatus({ tone: 'success', text: t('auth.resent') });
      setCooldown(COOLDOWN);
    }
  };

  return (
    <AuthShell
      title={t('auth.checkEmailTitle')}
      subtitle={email ? t('auth.checkEmailBody', { email }) : t('auth.checkEmailBodyGeneric')}
      footer={<TextLink href="/sign-in" label={t('auth.backToSignIn')} />}
    >
      <View style={{ flexDirection: 'row', gap: space[3], alignItems: 'center' }}>
        <MailCheck size={22} color={colors.accent} />
        <Text variant="small" color="textMuted" style={{ flex: 1 }}>
          {t('auth.checkEmailHint')}
        </Text>
      </View>
      {status ? <Notice tone={status.tone}>{status.text}</Notice> : null}
      {email ? (
        <Button
          variant="secondary"
          fullWidth
          loading={sending}
          disabled={cooldown > 0}
          label={cooldown > 0 ? t('auth.resendIn', { seconds: cooldown }) : t('auth.resend')}
          onPress={resend}
        />
      ) : null}
    </AuthShell>
  );
}
