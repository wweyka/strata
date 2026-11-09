-- Strata · learning activity, progress, spaced repetition, paths and the AI tutor.

-- Append-only event log written by the app.
create table public.interactions (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  content_item_id uuid,
  topic_id uuid,
  learning_mode_id uuid,
  event public.interaction_event not null,
  value jsonb not null default '{}'::jsonb
    check (jsonb_typeof(value) = 'object' and pg_column_size(value) <= 2048),
  session_id uuid,
  created_at timestamptz not null default now(),
  foreign key (content_item_id, user_id) references public.content_items (id, user_id)
    on delete set null (content_item_id),
  foreign key (topic_id, user_id) references public.topics (id, user_id) on delete set null (topic_id),
  foreign key (learning_mode_id, user_id) references public.learning_modes (id, user_id)
    on delete set null (learning_mode_id)
);
create index interactions_user_time_idx on public.interactions (user_id, created_at desc);
create index interactions_user_item_idx on public.interactions (user_id, content_item_id);

create table public.quiz_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  question_id uuid not null,
  content_item_id uuid,
  selected_option_ids text[] not null default '{}' check (cardinality(selected_option_ids) <= 20),
  answer_text text check (char_length(answer_text) <= 4000),
  is_correct boolean,
  confidence smallint check (confidence between 1 and 3),
  response_ms integer check (response_ms between 0 and 3600000),
  created_at timestamptz not null default now(),
  foreign key (question_id, user_id) references public.quiz_questions (id, user_id) on delete cascade,
  foreign key (content_item_id, user_id) references public.content_items (id, user_id)
    on delete set null (content_item_id)
);
create index quiz_attempts_user_time_idx on public.quiz_attempts (user_id, created_at desc);
create index quiz_attempts_question_idx on public.quiz_attempts (user_id, question_id);

-- Grading happens in the database: whatever the client sends as is_correct is replaced.
-- Choice questions are graded exactly; short answers by normalised match (a miss stays
-- ungraded for the AI grader); open prompts are never auto-graded.
create or replace function public.grade_quiz_attempt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  q public.quiz_questions;
begin
  select * into q from public.quiz_questions where id = new.question_id and user_id = new.user_id;
  new.is_correct := case q.format
    when 'single_choice' then
      array(select distinct x from unnest(new.selected_option_ids) x order by x)
        = array(select distinct x from unnest(q.correct_option_ids) x order by x)
    when 'multiple_choice' then
      array(select distinct x from unnest(new.selected_option_ids) x order by x)
        = array(select distinct x from unnest(q.correct_option_ids) x order by x)
    when 'true_false' then
      array(select distinct x from unnest(new.selected_option_ids) x order by x)
        = array(select distinct x from unnest(q.correct_option_ids) x order by x)
    when 'short_answer' then
      case
        when q.answer_text is not null and new.answer_text is not null
             and lower(btrim(new.answer_text)) = lower(btrim(q.answer_text)) then true
        else null
      end
    else null
  end;
  return new;
end;
$$;
create trigger quiz_attempts_grade before insert on public.quiz_attempts
  for each row execute function public.grade_quiz_attempt();

create table public.learning_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  topic_id uuid not null,
  status public.mastery_status not null default 'not_explored',
  mastery real not null default 0 check (mastery between 0 and 1),
  exposures integer not null default 0 check (exposures >= 0),
  correct_count integer not null default 0 check (correct_count >= 0),
  incorrect_count integer not null default 0 check (incorrect_count >= 0),
  time_spent_s integer not null default 0 check (time_spent_s >= 0),
  first_seen_at timestamptz,
  last_interacted_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, topic_id),
  foreign key (topic_id, user_id) references public.topics (id, user_id) on delete cascade
);
create index learning_progress_status_idx on public.learning_progress (user_id, status);
create trigger learning_progress_updated_at before update on public.learning_progress
  for each row execute function public.set_updated_at();

-- FSRS scheduling state, per topic or per flashcard.
create table public.revision_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  topic_id uuid,
  flashcard_id uuid,
  state public.revision_state not null default 'new',
  stability real not null default 0 check (stability >= 0),
  difficulty real not null default 0 check (difficulty >= 0),
  due_at timestamptz not null default now(),
  last_review_at timestamptz,
  reps integer not null default 0 check (reps >= 0),
  lapses integer not null default 0 check (lapses >= 0),
  scheduler text not null default 'fsrs',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(topic_id, flashcard_id) = 1),
  unique (user_id, topic_id),
  unique (user_id, flashcard_id),
  foreign key (topic_id, user_id) references public.topics (id, user_id) on delete cascade,
  foreign key (flashcard_id, user_id) references public.flashcards (id, user_id) on delete cascade
);
create index revision_schedules_due_idx on public.revision_schedules (user_id, due_at);
create trigger revision_schedules_updated_at before update on public.revision_schedules
  for each row execute function public.set_updated_at();

create table public.saved_items (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  content_item_id uuid not null,
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  primary key (user_id, content_item_id),
  foreign key (content_item_id, user_id) references public.content_items (id, user_id) on delete cascade
);

create table public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  learning_mode_id uuid,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  active_seconds integer not null default 0 check (active_seconds between 0 and 86400),
  check (ended_at is null or ended_at >= started_at),
  unique (id, user_id),
  foreign key (learning_mode_id, user_id) references public.learning_modes (id, user_id)
    on delete set null (learning_mode_id)
);
create index study_sessions_user_idx on public.study_sessions (user_id, started_at desc);

create table public.learning_paths (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject_id uuid,
  material_id uuid,
  title text not null check (char_length(title) between 1 and 200),
  description text check (char_length(description) <= 2000),
  status text not null default 'draft' check (status in ('draft', 'active', 'completed', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (subject_id, user_id) references public.subjects (id, user_id) on delete set null (subject_id),
  foreign key (material_id, user_id) references public.materials (id, user_id) on delete set null (material_id)
);
create trigger learning_paths_updated_at before update on public.learning_paths
  for each row execute function public.set_updated_at();

create table public.learning_path_steps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  path_id uuid not null,
  ordinal integer not null check (ordinal >= 0),
  topic_id uuid not null,
  unique (path_id, ordinal),
  foreign key (path_id, user_id) references public.learning_paths (id, user_id) on delete cascade,
  foreign key (topic_id, user_id) references public.topics (id, user_id) on delete cascade
);

create table public.tutor_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  content_item_id uuid,
  topic_id uuid,
  title text check (char_length(title) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (content_item_id, user_id) references public.content_items (id, user_id)
    on delete set null (content_item_id),
  foreign key (topic_id, user_id) references public.topics (id, user_id) on delete set null (topic_id)
);
create index tutor_threads_user_idx on public.tutor_threads (user_id, updated_at desc);
create trigger tutor_threads_updated_at before update on public.tutor_threads
  for each row execute function public.set_updated_at();

create table public.tutor_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  thread_id uuid not null,
  role public.tutor_role not null,
  content text not null check (char_length(content) between 1 and 20000),
  basis public.content_basis,
  model text,
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  created_at timestamptz not null default now(),
  foreign key (thread_id, user_id) references public.tutor_threads (id, user_id) on delete cascade
);
create index tutor_messages_thread_idx on public.tutor_messages (thread_id, created_at);
