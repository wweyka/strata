-- Strata · Phase 2 ingestion: knowledge belongs to the material it came from, one parsed document
-- per material, topics disappear with their last source, and failed materials can be retried.

-- Each knowledge item records its material, so deleting or re-processing a material removes exactly
-- what it contributed, even inside a topic shared with other materials.
alter table public.knowledge_items add column material_id uuid;
alter table public.knowledge_items
  add constraint knowledge_items_material_fk foreign key (material_id, user_id)
  references public.materials (id, user_id) on delete cascade;
create index knowledge_items_material_idx on public.knowledge_items (material_id);

-- One parsed document per material (re-processing replaces it).
drop index if exists public.documents_material_idx;
alter table public.documents add constraint documents_material_key unique (material_id);

-- A topic exists because some material teaches it. When its last source goes (material deleted
-- or re-processed), the topic and everything generated from it go too.
create or replace function public.prune_orphan_topics()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.topics t
   where t.id in (select distinct o.topic_id from old_sources o)
     and not exists (select 1 from public.topic_sources s where s.topic_id = t.id);
  return null;
end;
$$;
revoke all on function public.prune_orphan_topics() from public, anon, authenticated;
create trigger topic_sources_prune after delete on public.topic_sources
  referencing old table as old_sources
  for each statement execute function public.prune_orphan_topics();

-- Called by the app to try a failed material again. Files that can never be read are refused.
create or replace function public.retry_material_processing(p_material_id uuid)
returns public.materials
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.materials;
begin
  select * into m from public.materials
   where id = p_material_id and user_id = auth.uid()
   for update;
  if not found then
    raise exception 'Material not found.' using errcode = 'P0002', hint = 'not_found';
  end if;
  if m.status <> 'failed' then
    return m;
  end if;
  if m.error ->> 'reason' in ('unsupported_format', 'unreadable_file', 'no_text', 'checksum_mismatch') then
    raise exception 'This file cannot be processed. Upload a different copy instead.'
      using errcode = 'P0001', hint = 'not_retryable';
  end if;

  update public.materials
     set status = 'queued', stage = 'queued', progress = 0, error = null
   where id = m.id
  returning * into m;

  insert into public.jobs (user_id, kind, priority, payload, idempotency_key, subject_type, subject_id)
  values (m.user_id, 'ingest_material', 100, jsonb_build_object('material_id', m.id),
          'material:' || m.id::text, 'material', m.id)
  on conflict do nothing;
  return m;
end;
$$;
revoke all on function public.retry_material_processing(uuid) from public, anon;
grant execute on function public.retry_material_processing(uuid) to authenticated, service_role;

-- Accept only the file types the pipeline can read (older .doc/.ppt/.odt/.rtf files are refused at
-- upload with a hint to save them as .docx, .pptx or PDF, instead of failing later).
update storage.buckets
   set allowed_mime_types = array[
     'application/pdf',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
     'application/epub+zip',
     'application/vnd.openxmlformats-officedocument.presentationml.presentation',
     'text/plain',
     'text/markdown',
     'text/html',
     'image/png',
     'image/jpeg',
     'image/webp',
     'image/heic'
   ]
 where id = 'materials';
