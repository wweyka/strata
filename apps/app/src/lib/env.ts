// Public configuration only. EXPO_PUBLIC_* values are embedded in the app bundle, so they must
// never hold secrets: the anon key is public by design and protected by row-level security.
// Each variable is read with a static property access so Expo can inline it at build time.

export const OAUTH_PROVIDERS = ['google', 'apple', 'github'] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.replace(/\/+$/, '') : undefined;
}

const supabaseUrl = clean(process.env.EXPO_PUBLIC_SUPABASE_URL);
const supabaseAnonKey = clean(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

export const env = {
  supabaseUrl,
  supabaseAnonKey,
  /** Base URL of the Strata AI service (services/ai). Optional during Phase 1. */
  apiUrl: clean(process.env.EXPO_PUBLIC_API_URL),
  /** OAuth providers enabled in Supabase Auth, e.g. "google,apple". Buttons show only for these. */
  authProviders: String(process.env.EXPO_PUBLIC_AUTH_PROVIDERS ?? '')
    .split(',')
    .map((p: string) => p.trim().toLowerCase())
    .filter((p): p is OAuthProvider => (OAUTH_PROVIDERS as readonly string[]).includes(p)),
  isConfigured: Boolean(supabaseUrl && supabaseAnonKey),
};
