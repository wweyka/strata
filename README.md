# Strata

An AI learning platform built from the learner's own materials. People upload books, notes, slides and
images; Strata extracts the knowledge structure, grounded in their pages, and turns it into a personal feed of
explanations, videos, cards and quizzes that they control. *Strata is a working name.*

Architecture and roadmap: see the design document linked in the project, and `docs/` here.

## Repository

```
apps/app/          Expo app (iOS, Android, web) · Expo Router · React Native Web
  src/app/         routes: (auth), onboarding, (app) tabs: discover, library, paths, practice, profile
  src/ui/          design system: tokens, theme, components
  src/data/        Supabase queries and mutations (TanStack Query)
  src/i18n/        English, Spanish, Russian
  e2e/             end-to-end browser check of the whole Phase 1 flow
packages/shared/   domain enums (mirroring SQL), schemas, upload helpers
services/ai/       Python FastAPI service and Postgres-backed job worker (uv)
supabase/          migrations, pgTAP row-level security tests, local config
scripts/           contract checks: SQL enums ↔ TypeScript, translation key parity
docs/              environment and credentials reference
```

## Status

**Phase 1 (foundation) is complete:** design system with light and dark themes, email sign-up with confirmation,
sign-in, password reset, OAuth wiring, onboarding (languages, interests, first upload), responsive navigation
(sidebar on wide screens, tab bar on phones), Library uploads into private storage, Discover with learning modes
and content-type toggles, Learning Paths and Practice views, Profile with synced preferences, learning-mode editor,
AI feature status, sign-out and full account deletion.

**Phase 2 (material management) is complete:** the worker reads PDF (including bookmarks and scanned pages),
Word (.docx), PowerPoint (.pptx), EPUB, web pages, Markdown, plain text and photos; splits them into passages with
page numbers; builds a search index (Voyage embeddings); and has Claude extract chapters, topics, key ideas and
prerequisite links. Every key idea that claims to come from the material must quote it, and the quote is checked
word for word against the passage before it is stored; anything else is stored only if the AI declared it as its own
addition, and the app labels it that way. The Library shows live progress, failures with a reason and a retry,
chapters, topics, and the source quote and page behind each key idea. Nothing is generated for the feed yet: that is
on demand, from this knowledge, in Phase 3.

Until `ANTHROPIC_API_KEY` and `VOYAGE_API_KEY` are configured (see [docs/environment.md](docs/environment.md)),
uploads are stored and queued, and the app shows them as **waiting for AI setup**. Nothing is simulated.

## Running locally

Requirements: Node 22, [uv](https://docs.astral.sh/uv/), the [Supabase CLI](https://supabase.com/docs/guides/local-development) (3.1 or newer, as pinned in CI) and Docker.

```bash
npm install
supabase start                       # Postgres, Auth, Storage, Realtime, Mailpit; applies migrations

cp apps/app/.env.example apps/app/.env.local          # fill in the anon key printed by supabase start
cp services/ai/.env.example services/ai/.env          # fill in the service role key

cd services/ai && uv sync
uv run strata-api                                     # API on http://127.0.0.1:8000
uv run strata-worker                                  # job worker (separate terminal)

npm run web                                           # app at http://localhost:8081
```

On Windows, use `copy` instead of `cp`, and keep the clone in a path without `#`, which can break the Expo
bundler. `strata-api` and `strata-worker` pick an event loop that works on Windows.

Every variable is described in [docs/environment.md](docs/environment.md).

## Checks

```bash
npm run check:enums && npm run check:i18n             # contracts
npm run typecheck && npm run lint                     # app and shared package
supabase test db                                      # 47 row-level security tests
cd services/ai && uv run ruff check . && STRATA_TEST_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres uv run pytest
npm run e2e                                           # browser flow; needs the web build served on :8081
```

CI runs all of these except the browser flow on every pull request.

## Security and privacy

- Every table has row-level security; users can only read and write their own rows, and server-owned columns
  (statuses, plans, usage) are not writable from the app.
- Uploaded files live in private buckets under the owner's folder. They are never public and never shared.
- Provider keys and the service role key exist only on the AI service. The app holds the public anon key only.
- Native sessions are encrypted at rest (AES key in the Keychain / Keystore).
- Account deletion removes stored files first, then the user; all derived data cascades.
