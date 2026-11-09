-- Row Level Security and data-isolation tests. Run with `supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(47);

-- ---------------------------------------------------------------- schema-wide guarantees
select is(
  (select count(*) from pg_tables where schemaname = 'public' and not rowsecurity),
  0::bigint, 'every table in public has row level security enabled');

select is(
  (select count(*) from pg_tables where schemaname = 'public'),
  38::bigint, 'the schema has the 38 documented tables');

select is(
  (select count(*) from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'anon' and table_name <> 'plans'),
  0::bigint, 'anon has no privileges on any table except plans');

-- ---------------------------------------------------------------- sign-up bootstrap
insert into auth.users (id, email, raw_user_meta_data, aud, role)
values
  ('11111111-1111-4111-8111-111111111111', 'ada@example.test',
   '{"display_name": "Ada", "interface_language": "ru"}', 'authenticated', 'authenticated'),
  ('22222222-2222-4222-8222-222222222222', 'ben@example.test', '{}', 'authenticated', 'authenticated');

select is((select display_name from profiles where id = '11111111-1111-4111-8111-111111111111'),
  'Ada', 'profile is created from sign-up metadata');
select is((select learning_languages from profiles where id = '11111111-1111-4111-8111-111111111111'),
  array['ru'], 'learning language defaults to the interface language');
select is((select count(*) from learning_modes where user_id = '11111111-1111-4111-8111-111111111111'),
  6::bigint, 'six preset learning modes are created');
select is(
  (select m.preset::text from feed_preferences f join learning_modes m on m.id = f.active_mode_id
    where f.user_id = '11111111-1111-4111-8111-111111111111'),
  'balanced', 'the balanced mode is active by default');
select is((select plan_id from subscriptions where user_id = '11111111-1111-4111-8111-111111111111'),
  'free', 'every new user starts on the free plan');

-- Fixtures written by the server (service role) for user B.
insert into topics (id, user_id, title, slug)
values ('bbbbbbbb-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'Subnetting', 'subnetting');
insert into flashcards (id, user_id, topic_id, front, back, basis)
values ('bbbbbbbb-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222',
        'bbbbbbbb-0000-4000-8000-000000000001', 'What is a /24?', '256 addresses', 'source');
insert into content_items (id, user_id, topic_id, type, title, flashcard_id, status)
values ('bbbbbbbb-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222',
        'bbbbbbbb-0000-4000-8000-000000000001', 'flashcard', 'Subnet sizes',
        'bbbbbbbb-0000-4000-8000-000000000002', 'ready');

-- Fixtures for user A.
insert into topics (id, user_id, title, slug)
values ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'OSI model', 'osi-model');
insert into quiz_questions (id, user_id, topic_id, format, prompt, options, correct_option_ids, basis)
values ('aaaaaaaa-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111',
        'aaaaaaaa-0000-4000-8000-000000000001', 'single_choice', 'Which layer routes packets?',
        '[{"id":"a","text":"Transport"},{"id":"b","text":"Network"}]', '{b}', 'source');

-- ---------------------------------------------------------------- as user A
set local role authenticated;
set local request.jwt.claims to '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated"}';

select is((select count(*) from profiles), 1::bigint, 'a user sees only their own profile');
select is((select count(*) from learning_modes), 6::bigint, 'a user sees only their own learning modes');
select is((select count(*) from topics), 1::bigint, 'a user sees only their own topics');
select is((select count(*) from content_items), 0::bigint, 'another user''s content is invisible');

update profiles set display_name = 'Hacked' where id = '22222222-2222-4222-8222-222222222222';
select lives_ok($$ update profiles set display_name = 'Ada L.' where id = auth.uid() $$,
  'a user can rename themselves');
select throws_ok($$ update profiles set created_at = now() where id = auth.uid() $$,
  '42501', null, 'protected profile columns cannot be changed');

select throws_ok(
  $$ update feed_preferences set active_mode_id = (
       select id from learning_modes where false union all select '00000000-0000-4000-8000-000000000000'::uuid limit 1) $$,
  '23503', null, 'the active mode must be one of the user''s own modes');

select lives_ok(
  $$ insert into learning_modes (name, content_types, mix_new, mix_review, mix_weak, mix_practice)
     values ('Commute', '{flashcard,flashcard,quiz}', 20, 40, 20, 20) $$,
  'a user can create a custom mode');
select is((select content_types::text[] from learning_modes where name = 'Commute'),
  array['flashcard', 'quiz'], 'content types are de-duplicated');
select throws_ok(
  $$ insert into learning_modes (name, content_types, mix_new, mix_review, mix_weak, mix_practice)
     values ('Bad mix', '{quiz}', 50, 50, 50, 50) $$,
  '23514', null, 'a mode''s mix must add up to 100');

select throws_ok(
  $$ insert into materials (title, kind, mime_type, size_bytes, storage_path)
     values ('Not mine', 'pdf', 'application/pdf', 1000,
             '22222222-2222-4222-8222-222222222222/x/book.pdf') $$,
  '23514', null, 'a material cannot point at another user''s storage folder');
select throws_ok(
  $$ insert into materials (title, kind, mime_type, size_bytes, storage_path)
     values ('Too big', 'pdf', 'application/pdf', 900000000,
             '11111111-1111-4111-8111-111111111111/big/book.pdf') $$,
  'P0001', null, 'the plan''s file size limit is enforced');
select lives_ok(
  $$ insert into materials (id, title, kind, mime_type, size_bytes, storage_path)
     values ('aaaaaaaa-0000-4000-8000-0000000000ff', 'Networking 101', 'pdf', 'application/pdf', 2048,
             '11111111-1111-4111-8111-111111111111/aaaaaaaa-0000-4000-8000-0000000000ff/book.pdf') $$,
  'a user can add a material in their own folder');
select is((select status::text from materials where id = 'aaaaaaaa-0000-4000-8000-0000000000ff'),
  'uploading', 'a new material starts as uploading');
select throws_ok($$ update materials set status = 'ready' $$,
  '42501', null, 'material status is owned by the server');
select lives_ok($$ update materials set title = 'Computer Networks' $$, 'a user can rename a material');
select throws_ok($$ select public.complete_material_upload('aaaaaaaa-0000-4000-8000-0000000000ff') $$,
  'P0001', null, 'completing an upload requires the file to exist');

select lives_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('materials', '11111111-1111-4111-8111-111111111111/aaaaaaaa-0000-4000-8000-0000000000ff/book.pdf') $$,
  'a user can upload into their own storage folder');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('materials', '22222222-2222-4222-8222-222222222222/evil.pdf') $$,
  '42501', null, 'a user cannot upload into another user''s folder');

select is((select status::text from public.complete_material_upload('aaaaaaaa-0000-4000-8000-0000000000ff')),
  'queued', 'completing the upload queues the material');
select lives_ok($$ select public.complete_material_upload('aaaaaaaa-0000-4000-8000-0000000000ff') $$,
  'completing an upload twice is harmless');
select is((select count(*) from jobs where kind = 'ingest_material'), 1::bigint,
  'exactly one ingestion job is queued and visible to its owner');

select lives_ok($$ insert into interactions (event, value) values ('impression', '{"source":"test"}') $$,
  'a user can log an interaction');
select throws_ok(
  $$ insert into interactions (event, content_item_id) values ('view_start', 'bbbbbbbb-0000-4000-8000-000000000003') $$,
  '23503', null, 'an interaction cannot reference another user''s content');
select throws_ok(
  $$ insert into quiz_attempts (question_id, selected_option_ids, is_correct)
     values ('aaaaaaaa-0000-4000-8000-000000000002', '{a}', true) $$,
  '42501', null, 'the client cannot set is_correct');
select lives_ok(
  $$ insert into quiz_attempts (question_id, selected_option_ids) values
       ('aaaaaaaa-0000-4000-8000-000000000002', '{b}'),
       ('aaaaaaaa-0000-4000-8000-000000000002', '{a}') $$,
  'a user can answer a question');
select is((select array_agg(is_correct order by id) from quiz_attempts), array[true, false],
  'answers are graded by the database');

select throws_ok($$ select count(*) from ai_usage_events $$, '42501', null, 'cost ledger is not readable by users');
select throws_ok($$ select * from public.claim_job('w', '{ingest_material}') $$, '42501', null,
  'users cannot claim worker jobs');
select throws_ok($$ select public.plan_limits('22222222-2222-4222-8222-222222222222') $$, '42501', null,
  'users cannot read other users'' plan limits');

-- ---------------------------------------------------------------- as user B
set local request.jwt.claims to '{"sub": "22222222-2222-4222-8222-222222222222", "role": "authenticated"}';
select is((select count(*) from materials), 0::bigint, 'user B cannot see user A''s materials');
select is((select count(*) from jobs), 0::bigint, 'user B cannot see user A''s jobs');
select is((select count(*) from storage.objects), 0::bigint, 'user B cannot see user A''s files');
select throws_ok($$ select public.complete_material_upload('aaaaaaaa-0000-4000-8000-0000000000ff') $$,
  'P0002', null, 'user B cannot complete user A''s upload');
select is((select display_name from profiles), null, 'user A''s attempt to rename user B had no effect');

-- ---------------------------------------------------------------- anonymous visitor
set local role anon;
set local request.jwt.claims to '{"role": "anon"}';
select is((select count(*) from plans), 1::bigint, 'anyone can read the public plan catalogue');
select throws_ok($$ select count(*) from profiles $$, '42501', null, 'anonymous visitors cannot read profiles');

-- ---------------------------------------------------------------- service role (workers)
set local role service_role;
select is((select kind from public.claim_job('worker-1', '{ingest_material}')), 'ingest_material',
  'a worker can claim the queued job');

-- ---------------------------------------------------------------- account deletion
reset role;
delete from auth.users where id = '11111111-1111-4111-8111-111111111111';
select is(
  (select count(*) from materials where user_id = '11111111-1111-4111-8111-111111111111')
  + (select count(*) from learning_modes where user_id = '11111111-1111-4111-8111-111111111111')
  + (select count(*) from jobs where user_id = '11111111-1111-4111-8111-111111111111'),
  0::bigint, 'deleting an account removes all of its data');

select * from finish();
rollback;
