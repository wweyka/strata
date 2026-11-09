import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import type { OAuthProvider } from '@/lib/env';
import { db } from '@/lib/supabase';

import { authCallbackUrl } from './redirects';

WebBrowser.maybeCompleteAuthSession();

/** Sign in with an OAuth provider configured in Supabase Auth (PKCE flow). */
export async function signInWithProvider(provider: OAuthProvider): Promise<'redirected' | 'signed_in' | 'cancelled'> {
  const redirectTo = authCallbackUrl();
  if (Platform.OS === 'web') {
    const { error } = await db().auth.signInWithOAuth({ provider, options: { redirectTo } });
    if (error) throw error;
    return 'redirected';
  }
  const { data, error } = await db().auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return 'cancelled';
  const url = new URL(result.url);
  const code = url.searchParams.get('code');
  const description = url.searchParams.get('error_description');
  if (description) throw new Error(description);
  if (!code) throw new Error('No authorization code returned.');
  const { error: exchangeError } = await db().auth.exchangeCodeForSession(code);
  if (exchangeError) throw exchangeError;
  return 'signed_in';
}
