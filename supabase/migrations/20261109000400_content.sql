-- Strata · generated content: scripts, videos, flashcards, questions and the feed unit.

create table public.scripts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  topic_id uuid not null,
  objective text not null check (char_length(objective) between 1 and 500),
  style public.video_style not null,
  language text not null check (public.is_language_tag(language)),
  level smallint check (level between 1 and 5),
  status public.content_status not null default 'draft',
  -- [{ narration, on_screen_text, visual: { renderer, params }, basis, citations: [chunk_id] }]
  scenes jsonb not null default '[]'::jsonb check (jsonb_typeof(scenes) = 'array'),
  est_duration_s integer check (est_duration_s > 0),
  faithfulness_score real check (faithfulness_score between 0 and 1),
  model text,
  prompt_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (topic_id, user_id) references public.topics (id, user_id) on delete cascade
);
create index scripts_topic_idx on public.scripts (topic_id);
create trigger scripts_updated_at before update on public.scripts
  for each row execute function public.set_updated_at();

create table public.videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  script_id uuid not null,
  topic_id uuid not null,
  status public.video_status not null default 'queued',
  duration_s numeric(7, 2) check (duration_s > 0),
  width integer check (width > 0),
  height integer check (height > 0),
  mp4_path text,
  hls_path text,
  poster_path text,
  captions jsonb not null default '[]'::jsonb check (jsonb_typeof(captions) = 'array'),
  renderer text,
  providers jsonb not null default '{}'::jsonb,
  cost_usd numeric(10, 4) check (cost_usd >= 0),
  validation jsonb,
  created_at timestamptz not null default now(),
  ready_at timestamptz,
  unique (id, user_id),
  foreign key (script_id, user_id) references public.scripts (id, user_id) on delete cascade,
  foreign key (topic_id, user_id) references public.topics (id, user_id) on delete cascade
);
create index videos_topic_idx on public.videos (topic_id);

create table public.flashcards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  topic_id uuid not null,
  front text not null check (char_length(front) between 1 and 1000),
  back text not null check (char_length(back) between 1 and 4000),
  hint text check (char_length(hint) <= 500),
  basis public.content_basis not null,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (topic_id, user_id) references public.topics (id, user_id) on delete cascade
);
create index flashcards_topic_idx on public.flashcards (topic_id);

create table public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  topic_id uuid not null,
  format public.question_format not null,
  prompt text not null check (char_length(prompt) between 1 and 2000),
  -- [{ "id": "a", "text": "..." }]
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  correct_option_ids text[] not null default '{}',
  answer_text text check (char_length(answer_text) <= 4000),
  explanation text check (char_length(explanation) <= 4000),
  difficulty smallint check (difficulty between 1 and 5),
  basis public.content_basis not null,
  created_at timestamptz not null default now(),
  check (format in ('short_answer', 'open_prompt') or cardinality(correct_option_ids) >= 1),
  unique (id, user_id),
  foreign key (topic_id, user_id) references public.topics (id, user_id) on delete cascade
);
create index quiz_questions_topic_idx on public.quiz_questions (topic_id);

-- The feed unit. Heavy formats link to their own table; light ones carry a payload.
create table public.content_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  topic_id uuid not null,
  type public.content_type not null,
  status public.content_status not null default 'draft',
  title text not null check (char_length(title) between 1 and 200),
  language text not null default 'en' check (public.is_language_tag(language)),
  difficulty smallint check (difficulty between 1 and 5),
  style public.video_style,
  variant_of uuid,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  video_id uuid,
  flashcard_id uuid,
  quiz_question_id uuid,
  estimated_seconds integer check (estimated_seconds > 0),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  constraint content_items_video_link check ((type = 'video') = (video_id is not null)),
  constraint content_items_flashcard_link check ((type = 'flashcard') = (flashcard_id is not null)),
  constraint content_items_question_link
    check ((type in ('quiz', 'question_card')) = (quiz_question_id is not null)),
  unique (id, user_id),
  foreign key (topic_id, user_id) references public.topics (id, user_id) on delete cascade,
  foreign key (variant_of, user_id) references public.content_items (id, user_id) on delete set null (variant_of),
  foreign key (video_id, user_id) references public.videos (id, user_id) on delete cascade,
  foreign key (flashcard_id, user_id) references public.flashcards (id, user_id) on delete cascade,
  foreign key (quiz_question_id, user_id) references public.quiz_questions (id, user_id) on delete cascade
);
create index content_items_feed_idx on public.content_items (user_id, status, type);
create index content_items_topic_idx on public.content_items (topic_id);
create index content_items_published_idx on public.content_items (user_id, published_at desc);
