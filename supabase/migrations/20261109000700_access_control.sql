-- Strata · access control.
-- Supabase grants every table to anon and authenticated by default; we start from nothing
-- and grant exactly what each table needs. RLS is enabled on every table in public, and a
-- test (supabase/tests) fails if any table is ever left without it.

revoke all on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

revoke all on function public.plan_limits(uuid) from public, anon, authenticated;
grant execute on function public.plan_limits(uuid) to service_role;

do $$
declare
  t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end;
$$;

-- Read-only for the owner: rows written by workers with the service role.
do $$
declare
  t text;
begin
  foreach t in array array[
    'subscriptions', 'usage_counters', 'documents', 'document_pages', 'chapters',
    'document_chunks', 'subjects', 'topics', 'topic_sources', 'topic_relations', 'knowledge_items',
    'citations', 'scripts', 'videos', 'flashcards', 'quiz_questions', 'content_items',
    'learning_progress', 'revision_schedules', 'learning_paths', 'learning_path_steps',
    'tutor_threads', 'tutor_messages', 'jobs', 'video_generation_jobs', 'notifications',
    'learning_modes', 'feed_preferences', 'push_tokens', 'material_folders', 'materials',
    'interactions', 'quiz_attempts', 'saved_items', 'study_sessions'
  ] loop
    execute format(
      'create policy "owner can read" on public.%I for select to authenticated using (user_id = (select auth.uid()))',
      t
    );
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end;
$$;

-- profiles: keyed by id rather than user_id.
create policy "owner can read" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "owner can update" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
grant select on public.profiles to authenticated;
grant update (display_name, interface_language, learning_languages, interests, appearance, timezone,
              onboarding_completed_at) on public.profiles to authenticated;

-- plans: public catalogue.
create policy "anyone can read public plans" on public.plans
  for select to anon, authenticated using (is_public);
grant select on public.plans to anon, authenticated;

-- feed_preferences
create policy "owner can update" on public.feed_preferences
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant update (active_mode_id, autoplay, captions_enabled, playback_rate, daily_goal_minutes)
  on public.feed_preferences to authenticated;

-- learning_modes: users create custom modes and edit or delete any of their modes.
create policy "owner can create custom modes" on public.learning_modes
  for insert to authenticated with check (user_id = (select auth.uid()) and preset = 'custom');
create policy "owner can update" on public.learning_modes
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner can delete" on public.learning_modes
  for delete to authenticated using (user_id = (select auth.uid()));
grant insert (id, name, description, content_types, mix_new, mix_review, mix_weak, mix_practice,
              difficulty_bias, target_retention, exam_date, sort_order) on public.learning_modes to authenticated;
grant update (name, description, content_types, mix_new, mix_review, mix_weak, mix_practice,
              difficulty_bias, target_retention, exam_date, sort_order) on public.learning_modes to authenticated;
grant delete on public.learning_modes to authenticated;

-- push_tokens
create policy "owner can insert" on public.push_tokens
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "owner can update" on public.push_tokens
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner can delete" on public.push_tokens
  for delete to authenticated using (user_id = (select auth.uid()));
grant insert (token, platform, device_name) on public.push_tokens to authenticated;
grant update (device_name, last_seen_at) on public.push_tokens to authenticated;
grant delete on public.push_tokens to authenticated;

-- notifications: written by the server; the owner can mark read or dismiss.
create policy "owner can update" on public.notifications
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner can delete" on public.notifications
  for delete to authenticated using (user_id = (select auth.uid()));
grant update (read_at) on public.notifications to authenticated;
grant delete on public.notifications to authenticated;

-- material_folders
create policy "owner can insert" on public.material_folders
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "owner can update" on public.material_folders
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner can delete" on public.material_folders
  for delete to authenticated using (user_id = (select auth.uid()));
grant insert (id, name, parent_id, sort_order) on public.material_folders to authenticated;
grant update (name, parent_id, sort_order) on public.material_folders to authenticated;
grant delete on public.material_folders to authenticated;

-- materials: the owner creates, renames, files and deletes. Status belongs to the server.
create policy "owner can insert" on public.materials
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "owner can update" on public.materials
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner can delete" on public.materials
  for delete to authenticated using (user_id = (select auth.uid()));
grant insert (id, title, kind, original_filename, mime_type, size_bytes, storage_path, checksum_sha256, folder_id)
  on public.materials to authenticated;
grant update (title, folder_id) on public.materials to authenticated;
grant delete on public.materials to authenticated;

-- subjects: the owner may rename what the AI called them.
create policy "owner can update" on public.subjects
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant update (name, description) on public.subjects to authenticated;

-- interactions and quiz_attempts: append-only from the app.
create policy "owner can insert" on public.interactions
  for insert to authenticated with check (user_id = (select auth.uid()));
grant insert (content_item_id, topic_id, learning_mode_id, event, value, session_id)
  on public.interactions to authenticated;

create policy "owner can insert" on public.quiz_attempts
  for insert to authenticated with check (user_id = (select auth.uid()));
grant insert (question_id, content_item_id, selected_option_ids, answer_text, confidence, response_ms)
  on public.quiz_attempts to authenticated;

-- saved_items
create policy "owner can insert" on public.saved_items
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "owner can update" on public.saved_items
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner can delete" on public.saved_items
  for delete to authenticated using (user_id = (select auth.uid()));
grant insert (content_item_id, note) on public.saved_items to authenticated;
grant update (note) on public.saved_items to authenticated;
grant delete on public.saved_items to authenticated;

-- study_sessions
create policy "owner can insert" on public.study_sessions
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "owner can update" on public.study_sessions
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant insert (id, learning_mode_id) on public.study_sessions to authenticated;
grant update (ended_at, active_seconds) on public.study_sessions to authenticated;

-- ai_usage_events: RLS on, no policies, no grants. Service role only.
