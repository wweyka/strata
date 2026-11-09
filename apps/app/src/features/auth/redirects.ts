import * as Linking from 'expo-linking';

/** Where Supabase Auth sends email links and OAuth results back to. */
export function authCallbackUrl(next?: 'reset-password'): string {
  return Linking.createURL('/auth/callback', next ? { queryParams: { next } } : undefined);
}
