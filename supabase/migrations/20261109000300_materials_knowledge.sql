-- Strata · materials, parsed documents and the per-user knowledge graph.
-- Composite foreign keys (id, user_id) guarantee that every reference stays inside one user's data.

create table public.material_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  parent_id uuid,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (parent_id, user_id) references public.material_folders (id, user_id) on delete cascade,
  check (parent_id is null or parent_id <> id)
);
create index material_folders_user_idx on public.material_folders (user_id, parent_id);
create trigger material_folders_updated_at before update on public.material_folders
  for each row execute function public.set_updated_at();

create table public.materials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  folder_id uuid,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  kind public.material_kind not null,
  original_filename text check (char_length(original_filename) <= 255),
  mime_type text not null check (char_length(mime_type) between 1 and 127),
  size_bytes bigint not null check (size_bytes > 0),
  -- Object path inside the private "materials" bucket; must start with the owner's id.
  storage_path text not null unique
    check (split_part(storage_path, '/', 1) = user_id::text and storage_path !~ '\.\.'),
  checksum_sha256 text check (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  language text check (language is null or public.is_language_tag(language)),
  page_count integer check (page_count >= 0),
  status public.material_status not null default 'uploading',
  stage text,
  progress real not null default 0 check (progress between 0 and 1),
  error jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (folder_id, user_id) references public.material_folders (id, user_id)
    on delete set null (folder_id)
);
create index materials_user_idx on public.materials (user_id, created_at desc);
create index materials_folder_idx on public.materials (user_id, folder_id);
create index materials_checksum_idx on public.materials (user_id, checksum_sha256);
create trigger materials_updated_at before update on public.materials
  for each row execute function public.set_updated_at();

-- Enforce the plan's file size and monthly upload limits at insert time.
create or replace function public.enforce_material_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limits jsonb := public.plan_limits(new.user_id);
  v_max_bytes bigint := coalesce((v_limits ->> 'max_file_mb')::bigint, 100) * 1024 * 1024;
  v_per_month integer := coalesce((v_limits ->> 'materials_per_month')::integer, 20);
  v_this_month integer;
begin
  if new.size_bytes > v_max_bytes then
    raise exception 'File is larger than your plan allows (% MB).', v_max_bytes / 1024 / 1024
      using errcode = 'P0001', hint = 'file_too_large';
  end if;
  select count(*) into v_this_month from public.materials
   where user_id = new.user_id and created_at >= date_trunc('month', now());
  if v_this_month >= v_per_month then
    raise exception 'Monthly upload limit reached (% materials).', v_per_month
      using errcode = 'P0001', hint = 'quota_exceeded';
  end if;
  return new;
end;
$$;
create trigger materials_enforce_limits before insert on public.materials
  for each row execute function public.enforce_material_limits();

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  material_id uuid not null,
  parser text not null,
  parser_version text not null,
  page_count integer check (page_count >= 0),
  language text,
  outline jsonb,
  layout_path text,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (material_id, user_id) references public.materials (id, user_id) on delete cascade
);
create index documents_material_idx on public.documents (material_id);

create table public.document_pages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  document_id uuid not null,
  page_number integer not null check (page_number >= 1),
  image_path text,
  has_text_layer boolean,
  ocr_confidence real check (ocr_confidence between 0 and 1),
  unique (document_id, page_number),
  unique (id, user_id),
  foreign key (document_id, user_id) references public.documents (id, user_id) on delete cascade
);

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text check (char_length(description) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name),
  unique (id, user_id)
);
create trigger subjects_updated_at before update on public.subjects
  for each row execute function public.set_updated_at();

create table public.chapters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  document_id uuid not null,
  parent_id uuid,
  title text not null check (char_length(title) between 1 and 300),
  level smallint not null default 1 check (level between 1 and 6),
  ordinal integer not null,
  page_start integer check (page_start >= 1),
  page_end integer,
  summary text,
  created_at timestamptz not null default now(),
  check (page_end is null or page_start is null or page_end >= page_start),
  unique (id, user_id),
  foreign key (document_id, user_id) references public.documents (id, user_id) on delete cascade,
  foreign key (parent_id, user_id) references public.chapters (id, user_id) on delete cascade
);
create index chapters_document_idx on public.chapters (document_id, ordinal);

create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  document_id uuid not null,
  chapter_id uuid,
  ordinal integer not null,
  content text not null check (char_length(content) between 1 and 20000),
  token_count integer not null check (token_count > 0),
  page_start integer check (page_start >= 1),
  page_end integer,
  heading_path text[] not null default '{}',
  source_kind text not null default 'text' check (source_kind in ('text', 'ocr', 'figure', 'table')),
  language text,
  embedding extensions.vector(1024),
  fts tsvector generated always as (to_tsvector('simple', content)) stored,
  created_at timestamptz not null default now(),
  check (page_end is null or page_start is null or page_end >= page_start),
  unique (document_id, ordinal),
  unique (id, user_id),
  foreign key (document_id, user_id) references public.documents (id, user_id) on delete cascade,
  foreign key (chapter_id, user_id) references public.chapters (id, user_id) on delete set null (chapter_id)
);
create index document_chunks_user_idx on public.document_chunks (user_id);
create index document_chunks_fts_idx on public.document_chunks using gin (fts);
create index document_chunks_embedding_idx on public.document_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

create table public.topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject_id uuid,
  parent_topic_id uuid,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  summary text check (char_length(summary) <= 4000),
  difficulty smallint check (difficulty between 1 and 5),
  importance real not null default 0.5 check (importance between 0 and 1),
  language text,
  embedding extensions.vector(1024),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (parent_topic_id is null or parent_topic_id <> id),
  unique (user_id, slug),
  unique (id, user_id),
  foreign key (subject_id, user_id) references public.subjects (id, user_id) on delete set null (subject_id),
  foreign key (parent_topic_id, user_id) references public.topics (id, user_id) on delete set null (parent_topic_id)
);
create index topics_subject_idx on public.topics (user_id, subject_id);
create index topics_embedding_idx on public.topics using hnsw (embedding extensions.vector_cosine_ops);
create trigger topics_updated_at before update on public.topics
  for each row execute function public.set_updated_at();

create table public.topic_sources (
  topic_id uuid not null,
  chapter_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  material_id uuid not null,
  primary key (topic_id, chapter_id),
  foreign key (topic_id, user_id) references public.topics (id, user_id) on delete cascade,
  foreign key (chapter_id, user_id) references public.chapters (id, user_id) on delete cascade,
  foreign key (material_id, user_id) references public.materials (id, user_id) on delete cascade
);
create index topic_sources_material_idx on public.topic_sources (user_id, material_id);

create table public.topic_relations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  from_topic_id uuid not null,
  to_topic_id uuid not null,
  relation public.relation_type not null,
  weight real not null default 1 check (weight between 0 and 1),
  basis public.content_basis not null,
  created_at timestamptz not null default now(),
  check (from_topic_id <> to_topic_id),
  unique (from_topic_id, to_topic_id, relation),
  foreign key (from_topic_id, user_id) references public.topics (id, user_id) on delete cascade,
  foreign key (to_topic_id, user_id) references public.topics (id, user_id) on delete cascade
);
create index topic_relations_to_idx on public.topic_relations (user_id, to_topic_id);

create table public.knowledge_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  topic_id uuid not null,
  kind public.knowledge_kind not null,
  term text check (char_length(term) <= 200),
  content text not null check (char_length(content) between 1 and 4000),
  basis public.content_basis not null,
  confidence real check (confidence between 0 and 1),
  ordinal integer not null default 0,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (topic_id, user_id) references public.topics (id, user_id) on delete cascade
);
create index knowledge_items_topic_idx on public.knowledge_items (topic_id, kind);

-- A citation can only point at a chunk of the same user's own material.
create table public.citations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  chunk_id uuid not null,
  subject_type text not null check (subject_type in (
    'knowledge_item', 'content_item', 'script_scene', 'flashcard', 'quiz_question', 'tutor_message'
  )),
  subject_id uuid not null,
  scene_index smallint check (scene_index >= 0),
  page_number integer check (page_number >= 1),
  quote text check (char_length(quote) <= 1000),
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (chunk_id, user_id) references public.document_chunks (id, user_id) on delete cascade
);
create index citations_subject_idx on public.citations (subject_type, subject_id);
create index citations_chunk_idx on public.citations (chunk_id);
