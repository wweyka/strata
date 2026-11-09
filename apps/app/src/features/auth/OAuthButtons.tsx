import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { describeError } from '@/data/errors';
import { env, type OAuthProvider } from '@/lib/env';
import { Button, Notice, space } from '@/ui';

import { OrDivider } from './AuthShell';
import { signInWithProvider } from './oauth';

const NAMES: Record<OAuthProvider, string> = { google: 'Google', apple: 'Apple', github: 'GitHub' };

/** Only providers listed in EXPO_PUBLIC_AUTH_PROVIDERS are shown, so no button is dead. */
export function OAuthButtons() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (env.authProviders.length === 0) return null;
  return (
    <View style={{ gap: space[3] }}>
      <OrDivider label={t('auth.or')} />
      {env.authProviders.map((provider) => (
        <Button
          key={provider}
          variant="secondary"
          fullWidth
          loading={busy === provider}
          disabled={!!busy}
          label={t('auth.continueWith', { provider: NAMES[provider] })}
          onPress={async () => {
            setError(null);
            setBusy(provider);
            try {
              await signInWithProvider(provider);
            } catch (e) {
              setError(describeError(e, t));
            } finally {
              setBusy(null);
            }
          }}
        />
      ))}
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </View>
  );
}
