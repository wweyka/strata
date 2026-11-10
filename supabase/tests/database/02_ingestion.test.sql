-- Phase 2 ingestion: retrying failed materials, and what deleting a material removes.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(14);

insert into auth.users (id, email, raw_user_meta_data, aud, role)
values
  ('33333333-3333-4333-8333-333333333333', 'cy@example.test', '{}', 'authenticated', 'authenticated'),
  ('44444444-4444-4444-8444-444444444444', 'di@example.test', '{}', 'authenticated', 'authenticated');

-- Two processed materials for user C that both teach "Subnetting"; only the first teaches "IPv4".
insert into materials (id, user_id, title, kind, mime_type, size_bytes, storage_path, status, error)
values
  ('c0000000-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333', 'Book', 'pdf',
   'application/pdf', 10, '33333333-3333-4333-8333-333333333333/book.pdf', 'ready', null),
  ('c0000000-0000-4000-8000-000000000002', '33333333-3333-4333-8333-333333333333', 'Notes', 'text',
   'text/plain', 10, '33333333-3333-4333-8333-333333333333/notes.txt', 'ready', null),
  ('c0000000-0000-4000-8000-000000000003', '33333333-3333-4333-8333-333333333333', 'Broken', 'pdf',
   'application/pdf', 10, '33333333-3333-4333-8333-333333333333/broken.pdf', 'failed',
   '{"reason": "provider_rejected"}'),
  ('c0000000-0000-4000-8000-000000000004', '33333333-3333-4333-8333-333333333333', 'Scrambled', 'pdf',
   'application/pdf', 10, '33333333-3333-4333-8333-333333333333/scrambled.pdf', 'failed',
   '{"reason": "unreadable_file"}');
insert into documents (id, user_id, material_id, parser, parser_version)
values
  ('d0000000-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333',
   'c0000000-0000-4000-8000-000000000001', 'pdfium', 'x'),
  ('d0000000-0000-4000-8000-000000000002', '33333333-3333-4333-8333-333333333333',
   'c0000000-0000-4000-8000-000000000002', 'plain', 'x');
insert into chapters (id, user_id, document_id, title, ordinal)
values
  ('e0000000-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333',
   'd0000000-0000-4000-8000-000000000001', 'Addressing', 0),
  ('e0000000-0000-4000-8000-000000000002', '33333333-3333-4333-8333-333333333333',
   'd0000000-0000-4000-8000-000000000002', 'Notes', 0);
insert into topics (id, user_id, title, slug)
values
  ('f0000000-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333', 'IPv4', 'ipv4'),
  ('f0000000-0000-4000-8000-000000000002', '33333333-3333-4333-8333-333333333333', 'Subnetting', 'subnetting');
insert into topic_sources (topic_id, chapter_id, user_id, material_id)
values
  ('f0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001',
   '33333333-3333-4333-8333-333333333333', 'c0000000-0000-4000-8000-000000000001'),
  ('f0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001',
   '33333333-3333-4333-8333-333333333333', 'c0000000-0000-4000-8000-000000000001'),
  ('f0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000002',
   '33333333-3333-4333-8333-333333333333', 'c0000000-0000-4000-8000-000000000002');
insert into knowledge_items (user_id, topic_id, material_id, kind, content, basis)
values
  ('33333333-3333-4333-8333-333333333333', 'f0000000-0000-4000-8000-000000000002',
   'c0000000-0000-4000-8000-000000000001', 'fact', 'From the book.', 'source'),
  ('33333333-3333-4333-8333-333333333333', 'f0000000-0000-4000-8000-000000000002',
   'c0000000-0000-4000-8000-000000000002', 'fact', 'From the notes.', 'source');

select throws_ok(
  $$ insert into documents (user_id, material_id, parser, parser_version)
     values ('33333333-3333-4333-8333-333333333333', 'c0000000-0000-4000-8000-000000000001', 'pdfium', 'x') $$,
  '23505', null, 'a material has at most one parsed document');

-- ---------------------------------------------------------------- retrying (as user C)
set local role authenticated;
set local request.jwt.claims to '{"sub": "33333333-3333-4333-8333-333333333333", "role": "authenticated"}';

select is((select status::text from retry_material_processing('c0000000-0000-4000-8000-000000000003')),
  'queued', 'a failed material can be retried');
select is((select count(*) from jobs where subject_id = 'c0000000-0000-4000-8000-000000000003'
             and kind = 'ingest_material' and status = 'queued'),
  1::bigint, 'retrying queues one ingestion job');
select is((select error from materials where id = 'c0000000-0000-4000-8000-000000000003'),
  null, 'retrying clears the old error');
select lives_ok($$ select retry_material_processing('c0000000-0000-4000-8000-000000000003') $$,
  'retrying twice is harmless');
select is((select count(*) from jobs where subject_id = 'c0000000-0000-4000-8000-000000000003'),
  1::bigint, 'and does not queue a second job');
select is((select status::text from retry_material_processing('c0000000-0000-4000-8000-000000000001')),
  'ready', 'a ready material is left alone');
select throws_ok($$ select retry_material_processing('c0000000-0000-4000-8000-000000000004') $$,
  'P0001', null, 'a file that can never be read is not retried');

-- User D cannot retry (or learn about) user C's material.
set local request.jwt.claims to '{"sub": "44444444-4444-4444-8444-444444444444", "role": "authenticated"}';
select throws_ok($$ select retry_material_processing('c0000000-0000-4000-8000-000000000003') $$,
  'P0002', null, 'another user''s material is not found');

set local role anon;
select throws_ok($$ select retry_material_processing('c0000000-0000-4000-8000-000000000003') $$,
  '42501', null, 'signed-out visitors cannot call retry');
reset role;

-- ---------------------------------------------------------------- deleting a material
delete from materials where id = 'c0000000-0000-4000-8000-000000000001';

select is((select count(*) from topics where id = 'f0000000-0000-4000-8000-000000000001'),
  0::bigint, 'a topic taught only by the deleted material is removed');
select is((select count(*) from topics where id = 'f0000000-0000-4000-8000-000000000002'),
  1::bigint, 'a topic another material still teaches is kept');
select is((select array_agg(content) from knowledge_items where topic_id = 'f0000000-0000-4000-8000-000000000002'),
  array['From the notes.'], 'only the deleted material''s knowledge items go');
select is((select count(*) from documents where material_id = 'c0000000-0000-4000-8000-000000000001'),
  0::bigint, 'its parsed document goes too');

select * from finish();
rollback;
