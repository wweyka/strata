-- Strata · foundation: extensions, enums and shared helpers.
-- Every enum value below is mirrored in packages/shared/src/enums.ts (checked in CI).

create extension if not exists vector with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create type public.appearance as enum ('system', 'light', 'dark');

create type public.content_type as enum (
  'video', 'question_card', 'flashcard', 'quiz', 'visual_explainer', 'exercise', 'summary'
);

create type public.mode_preset as enum (
  'balanced', 'quick_revision', 'exam_preparation', 'deep_learning', 'new_knowledge',
  'language_practice', 'custom'
);

create type public.material_kind as enum ('pdf', 'document', 'presentation', 'image', 'text', 'note', 'other');

create type public.material_status as enum (
  'uploading', 'queued', 'processing', 'ready', 'failed', 'awaiting_credentials'
);

create type public.job_status as enum (
  'queued', 'running', 'waiting_external', 'succeeded', 'failed', 'cancelled', 'awaiting_credentials'
);

create type public.content_status as enum ('draft', 'generating', 'ready', 'failed', 'archived');

-- Whether a statement is supported by the user's own material or added by the AI.
create type public.content_basis as enum ('source', 'ai_supplement');

create type public.knowledge_kind as enum (
  'definition', 'fact', 'example', 'formula', 'objective', 'misconception', 'key_term'
);

create type public.relation_type as enum (
  'prerequisite', 'part_of', 'related', 'contrasts', 'example_of', 'applies_to'
);

create type public.question_format as enum (
  'single_choice', 'multiple_choice', 'true_false', 'short_answer', 'open_prompt'
);

create type public.mastery_status as enum (
  'not_explored', 'in_progress', 'practiced', 'mastered', 'needs_revision'
);

create type public.interaction_event as enum (
  'impression', 'view_start', 'view_progress', 'complete', 'skip', 'save', 'unsave',
  'like', 'dislike', 'too_easy', 'too_hard', 'tutor_open', 'source_open'
);

create type public.video_status as enum ('queued', 'generating', 'ready', 'failed', 'awaiting_credentials');

create type public.video_style as enum (
  'code_walkthrough', 'animated_diagram', 'equation_steps', 'simulation', 'timeline_map',
  'dialogue', 'illustrated', 'instructor'
);

create type public.video_stage as enum (
  'queued', 'scripting', 'storyboarding', 'narrating', 'rendering_scenes', 'generating_media',
  'composing', 'validating', 'publishing', 'done', 'failed', 'awaiting_credentials'
);

create type public.revision_state as enum ('new', 'learning', 'review', 'relearning');

create type public.tutor_role as enum ('user', 'assistant');

create type public.notification_kind as enum (
  'material_ready', 'material_failed', 'content_ready', 'revision_due', 'system'
);

-- Keeps updated_at honest on every table that has one.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Language tags we accept: "en", "pt-BR".
create or replace function public.is_language_tag(tag text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select tag ~ '^[a-z]{2,3}(-[A-Z]{2})?$';
$$;

create or replace function public.are_language_tags(tags text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and(public.is_language_tag(t)), true) from unnest(tags) as t;
$$;
