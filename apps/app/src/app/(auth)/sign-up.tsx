import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { describeError } from '@/data/errors';
import { AuthShell, TextLink } from '@/features/auth/AuthShell';
import { OAuthButtons } from '@/features/auth/OAuthButtons';
import { authCallbackUrl } from '@/features/auth/redirects';
import { db } from '@/lib/supabase';
import { Button, Notice, Text, TextField, space, type TextFieldRef } from '@/ui';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignUp() {
  const { t, i18n } = useTranslation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string; name?: string }>({});
  const emailRef = useRef<TextFieldRef>(null);
  const passwordRef = useRef<TextFieldRef>(null);

  const submit = async () => {
    setError(null);
    const errors: typeof fieldErrors = {};
    if (name.trim().length > 80) errors.name = t('auth.nameTooLong');
    if (!EMAIL.test(email.trim())) errors.email = t('auth.invalidEmail');
    if (password.length < 8) errors.password = t('auth.passwordTooShort');
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    setLoading(true);
    const { data, error: signUpError } = await db().auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: authCallbackUrl(),
        data: { display_name: name.trim() || undefined, interface_language: i18n.language },
      },
    });
    setLoading(false);
    if (signUpError) {
      setError(describeError(signUpError, t));
      return;
    }
    // With email confirmation on, there is no session until the link is opened.
    if (!data.session) router.replace({ pathname: '/check-email', params: { email: email.trim() } });
  };

  return (
    <AuthShell
      title={t('auth.signUpTitle')}
      subtitle={t('auth.signUpSubtitle')}
      footer={
        <>
          <View style={{ flexDirection: 'row', gap: space[1], alignItems: 'center' }}>
            <Text variant="small" color="textMuted">
              {t('auth.haveAccount')}
            </Text>
            <TextLink href="/sign-in" label={t('auth.signIn')} />
          </View>
          <Text variant="caption" color="textFaint" align="center">
            {t('auth.privacyNote')}
          </Text>
        </>
      }
    >
      <View style={{ gap: space[4] }}>
        <TextField
          label={t('auth.name')}
          value={name}
          onChangeText={setName}
          autoComplete="name"
          textContentType="name"
          returnKeyType="next"
          error={fieldErrors.name}
          hint={t('auth.nameHint')}
          onSubmitEditing={() => emailRef.current?.focus()}
        />
        <TextField
          ref={emailRef}
          label={t('auth.email')}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="next"
          error={fieldErrors.email}
          onSubmitEditing={() => passwordRef.current?.focus()}
        />
        <TextField
          ref={passwordRef}
          label={t('auth.password')}
          value={password}
          onChangeText={setPassword}
          password
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          hint={t('auth.passwordHint')}
          error={fieldErrors.password}
          onSubmitEditing={submit}
        />
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Button label={t('auth.createAccount')} fullWidth loading={loading} onPress={submit} />
      </View>
      <OAuthButtons />
    </AuthShell>
  );
}
