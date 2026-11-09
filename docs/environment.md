# Environment and credentials

Strata has three places that hold configuration. Secrets live only on the server side.

| Where | What | Who can see it |
| --- | --- | --- |
| Supabase project | Database, Auth, Storage, Realtime | Configured in the Supabase dashboard |
| App (`apps/app`) | `EXPO_PUBLIC_*` values | **Public.** Embedded in every app bundle |
| AI service (`services/ai`) | Service role key, database URL, AI provider keys | Server only |

Never put a secret in an `EXPO_PUBLIC_*` variable, and never commit a `.env` file.

## App (`apps/app/.env.local`, EAS environment variables, or your web host)

| Variable | Required | Value |
| --- | --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | yes | Project URL, e.g. `https://<ref>.supabase.co` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | yes | The **publishable** key (`sb_publishable_…`) or the legacy `anon` key. Public by design; row-level security protects the data. |
| `EXPO_PUBLIC_API_URL` | Phase 1: for account deletion and the AI status panel | Base URL of the AI service, e.g. `https://api.example.com` |
| `EXPO_PUBLIC_AUTH_PROVIDERS` | no | Comma-separated OAuth providers you enabled in Supabase Auth: `google`, `apple`, `github`. Only these buttons are shown. |

Without the two Supabase values the app shows a "not configured" screen instead of failing.

## AI service (`services/ai/.env` locally; your host's secret store in production)

| Variable | Required | Value |
| --- | --- | --- |
| `SUPABASE_URL` | yes | Same project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | The **secret** key (`sb_secret_…`) or the legacy `service_role` key. Bypasses row-level security: server only. |
| `SUPABASE_DB_URL` | yes | Postgres connection string (dashboard → Connect → Session pooler, port 5432). Used by the job worker. |
| `SUPABASE_JWT_SECRET` | only for legacy projects | Projects using JWT signing keys are verified against the public JWKS instead. |
| `ALLOWED_ORIGINS` | yes for web | Comma-separated web origins allowed to call the API, e.g. `https://app.example.com` |
| `ENVIRONMENT` | no | `development` enables `/docs`; anything else hides it |
| `RATE_LIMIT_PER_MINUTE`, `RATE_LIMIT_EXPENSIVE_PER_MINUTE` | no | Per-user limits, default 60 and 10 |

### AI provider keys

Each key is optional to start. A missing key never breaks the app: jobs that need it are parked as
**awaiting credentials**, the app says so, and they resume automatically when the worker restarts with the key.

| Variable | Used for | Needed from |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Knowledge extraction, scripts, quizzes, tutor, fact checks (Claude) | Phase 2 |
| `VOYAGE_API_KEY` | Embeddings and reranking for search and the tutor | Phase 2 |
| `ELEVENLABS_API_KEY` | Video narration with word timings | Phase 3 |
| `GEMINI_API_KEY` | Illustrations and optional generated clips | Phase 3 (optional) |
| `HEYGEN_API_KEY` | Optional virtual-instructor style | Phase 3 (optional) |

## Supabase project settings

1. **Run the migrations:** `supabase link --project-ref <ref>` then `supabase db push`.
2. **Authentication → URL Configuration:** Site URL = your web app URL. Redirect URLs:
   `https://<your-web-app>/auth/callback`, `strata://**` (native app), and `exp://**` for Expo Go during development.
3. **Authentication → Sign In / Providers → Email:** keep "Confirm email" on. Configure custom SMTP before launch
   (the built-in sender is rate-limited and meant for testing).
4. **Storage → Settings:** set the global file size limit to at least 100 MB so the `materials` bucket limit applies.
   The Free plan caps uploads at 50 MB, so larger files need a paid plan.
5. **OAuth (optional):** enable providers under Authentication → Sign In / Providers, then list them in `EXPO_PUBLIC_AUTH_PROVIDERS`.

## Local development

`supabase start` prints local URLs and keys. Use the printed publishable (anon) key for the app and the
secret (service role) key for the AI service. Emails are caught by Mailpit at http://127.0.0.1:54324.
