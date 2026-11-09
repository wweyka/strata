-- Strata · identity, preferences, learning modes, notifications, plans and usage.

-- Profiles: one row per auth user, created by handle_new_user().
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) between 1 and 80),
  interface_language text not null default 'en' check (public.is_language_tag(interface_language)),
  learning_languages text[] not null default '{en}'
    check (cardinality(learning_languages) between 1 and 10 and public.are_language_tags(learning_languages)),
  interests text[] not null default '{}'
    check (cardinality(interests) <= 30),
  appearance public.appearance not null default 'system',
  timezone text not null default 'UTC' check (char_length(timezone) <= 64),
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Learning modes: named bundles of allowed content types and a feed mix.
-- Preset modes keep name null so the app shows the name in the user's language.
create table public.learning_modes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text check (char_length(btrim(name)) between 1 and 40),
  preset public.mode_preset not null default 'custom',
  description text check (char_length(description) <= 200),
  content_types public.content_type[] not null check (cardinality(content_types) between 1 and 7),
  mix_new smallint not null default 25 check (mix_new between 0 and 100),
  mix_review smallint not null default 25 check (mix_review between 0 and 100),
  mix_weak smallint not null default 25 check (mix_weak between 0 and 100),
  mix_practice smallint not null default 25 check (mix_practice between 0 and 100),
  difficulty_bias smallint not null default 0 check (difficulty_bias between -2 and 2),
  target_retention numeric(3, 2) not null default 0.90 check (target_retention between 0.70 and 0.97),
  exam_date date,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learning_modes_mix_total check (mix_new + mix_review + mix_weak + mix_practice = 100),
  constraint learning_modes_custom_named check (preset <> 'custom' or name is not null),
  unique (id, user_id)
);
create index learning_modes_user_idx on public.learning_modes (user_id, sort_order);

-- De-duplicate and order content types so equality checks are stable.
create or replace function public.normalize_learning_mode()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.content_types := array(
    select distinct t from unnest(new.content_types) as t order by t
  );
  new.name := nullif(btrim(new.name), '');
  return new;
end;
$$;
create trigger learning_modes_normalize before insert or update on public.learning_modes
  for each row execute function public.normalize_learning_mode();
create trigger learning_modes_updated_at before update on public.learning_modes
  for each row execute function public.set_updated_at();

-- Feed preferences: one row per user. The active mode must belong to the same user.
create table public.feed_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  active_mode_id uuid,
  autoplay boolean not null default true,
  captions_enabled boolean not null default true,
  playback_rate numeric(3, 2) not null default 1.00 check (playback_rate between 0.50 and 2.00),
  daily_goal_minutes smallint not null default 15 check (daily_goal_minutes between 5 and 240),
  updated_at timestamptz not null default now(),
  foreign key (active_mode_id, user_id) references public.learning_modes (id, user_id)
    on delete set null (active_mode_id)
);
create trigger feed_preferences_updated_at before update on public.feed_preferences
  for each row execute function public.set_updated_at();

-- Expo push tokens, one per device.
create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  token text not null check (char_length(token) between 1 and 255),
  platform text not null check (platform in ('ios', 'android', 'web')),
  device_name text check (char_length(device_name) <= 80),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (user_id, token)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind public.notification_kind not null,
  title text not null check (char_length(title) between 1 and 200),
  body text check (char_length(body) <= 1000),
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

-- Plans: limits are data, so a paid tier later is a new row plus a billing adapter.
create table public.plans (
  id text primary key check (id ~ '^[a-z0-9_]+$'),
  name text not null,
  is_public boolean not null default true,
  limits jsonb not null,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);

insert into public.plans (id, name, limits) values (
  'free', 'Free',
  jsonb_build_object(
    'materials_per_month', 20,
    'pages_per_month', 2000,
    'max_file_mb', 100,
    'storage_mb', 2048,
    'videos_per_month', 20,
    'tutor_messages_per_day', 50,
    'generated_clips', false,
    'avatar_instructor', false
  )
);

create table public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan_id text not null default 'free' references public.plans (id),
  status text not null default 'active' check (status in ('active', 'trialing', 'past_due', 'cancelled')),
  current_period_end timestamptz,
  billing_provider text,
  external_customer_id text,
  external_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

create table public.usage_counters (
  user_id uuid not null references auth.users (id) on delete cascade,
  metric text not null check (metric ~ '^[a-z_]+$'),
  period_start date not null,
  used bigint not null default 0 check (used >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, metric, period_start)
);

-- Ledger of every AI provider call. Service role only: no policies are granted.
create table public.ai_usage_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  job_id uuid,
  provider text not null,
  model text,
  operation text not null,
  input_units bigint check (input_units >= 0),
  output_units bigint check (output_units >= 0),
  unit text,
  cost_usd numeric(12, 6) check (cost_usd >= 0),
  latency_ms integer check (latency_ms >= 0),
  status text not null default 'ok' check (status in ('ok', 'error', 'refused', 'timeout')),
  created_at timestamptz not null default now()
);
create index ai_usage_events_user_idx on public.ai_usage_events (user_id, created_at desc);
create index ai_usage_events_time_idx on public.ai_usage_events (created_at);

-- Returns the caller's plan limits (or a given user's, for the service role).
create or replace function public.plan_limits(p_user_id uuid default auth.uid())
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p.limits, (select limits from public.plans where id = 'free'))
  from (select 1) as one
  left join public.subscriptions s on s.user_id = p_user_id and s.status in ('active', 'trialing')
  left join public.plans p on p.id = s.plan_id;
$$;

-- New user bootstrap: profile, subscription, six learning modes and feed preferences,
-- all in the sign-up transaction.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lang text := coalesce(nullif(new.raw_user_meta_data ->> 'interface_language', ''), 'en');
  v_name text := nullif(btrim(coalesce(
    new.raw_user_meta_data ->> 'display_name',
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    ''
  )), '');
  v_default uuid;
begin
  if not public.is_language_tag(v_lang) then
    v_lang := 'en';
  end if;

  insert into public.profiles (id, display_name, interface_language, learning_languages)
  values (new.id, left(v_name, 80), v_lang, array[split_part(v_lang, '-', 1)]);

  insert into public.subscriptions (user_id) values (new.id);

  insert into public.learning_modes
    (user_id, preset, content_types, mix_new, mix_review, mix_weak, mix_practice, target_retention, sort_order)
  values
    (new.id, 'balanced', '{video,visual_explainer,summary,flashcard,quiz,question_card,exercise}', 35, 25, 20, 20, 0.90, 0),
    (new.id, 'quick_revision', '{flashcard,quiz,summary,question_card}', 10, 50, 25, 15, 0.90, 1),
    (new.id, 'exam_preparation', '{quiz,exercise,flashcard,video,question_card}', 10, 30, 40, 20, 0.95, 2),
    (new.id, 'deep_learning', '{video,visual_explainer,exercise,summary}', 45, 15, 15, 25, 0.90, 3),
    (new.id, 'new_knowledge', '{video,visual_explainer,summary}', 70, 10, 10, 10, 0.85, 4),
    (new.id, 'language_practice', '{flashcard,question_card,quiz,video}', 30, 30, 20, 20, 0.90, 5);

  select id into v_default from public.learning_modes where user_id = new.id and preset = 'balanced';
  insert into public.feed_preferences (user_id, active_mode_id) values (new.id, v_default);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
