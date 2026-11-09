-- Strata · durable job queue for ingestion and generation work.
-- Workers (service role) claim jobs with FOR UPDATE SKIP LOCKED; users can read their own jobs.

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  parent_id uuid references public.jobs (id) on delete cascade,
  kind text not null check (kind ~ '^[a-z_]+$'),
  status public.job_status not null default 'queued',
  priority smallint not null default 100,
  stage text,
  progress real not null default 0 check (progress between 0 and 1),
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error jsonb,
  attempts smallint not null default 0 check (attempts >= 0),
  max_attempts smallint not null default 3 check (max_attempts between 1 and 20),
  run_after timestamptz not null default now(),
  locked_by text,
  locked_at timestamptz,
  heartbeat_at timestamptz,
  idempotency_key text,
  subject_type text,
  subject_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);
create unique index jobs_idempotency_idx on public.jobs (kind, idempotency_key)
  where idempotency_key is not null
    and status in ('queued', 'running', 'waiting_external', 'awaiting_credentials');
create index jobs_claim_idx on public.jobs (priority, run_after) where status = 'queued';
create index jobs_user_idx on public.jobs (user_id, created_at desc);
create index jobs_subject_idx on public.jobs (subject_type, subject_id);
create index jobs_running_idx on public.jobs (heartbeat_at) where status = 'running';
create trigger jobs_updated_at before update on public.jobs
  for each row execute function public.set_updated_at();

alter table public.ai_usage_events
  add constraint ai_usage_events_job_fk foreign key (job_id) references public.jobs (id) on delete set null;

create table public.video_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  video_id uuid not null unique,
  job_id uuid references public.jobs (id) on delete set null,
  stage public.video_stage not null default 'queued',
  attempts smallint not null default 0 check (attempts >= 0),
  provider_tasks jsonb not null default '{}'::jsonb,
  error jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (video_id, user_id) references public.videos (id, user_id) on delete cascade
);
create trigger video_generation_jobs_updated_at before update on public.video_generation_jobs
  for each row execute function public.set_updated_at();

-- Wake idle workers when work arrives.
create or replace function public.notify_job_queued()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'queued' then
    perform pg_notify('strata_jobs', new.kind);
  end if;
  return new;
end;
$$;
create trigger jobs_notify after insert or update of status on public.jobs
  for each row execute function public.notify_job_queued();

-- Claim the next runnable job of the given kinds. Ties go to users with fewer running
-- jobs, so one large upload cannot starve everyone else.
create or replace function public.claim_job(p_worker text, p_kinds text[])
returns setof public.jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  update public.jobs j
     set status = 'running',
         locked_by = p_worker,
         locked_at = now(),
         heartbeat_at = now(),
         attempts = j.attempts + 1
   where j.id = (
     select q.id
       from public.jobs q
      where q.status = 'queued'
        and q.run_after <= now()
        and q.kind = any (p_kinds)
      order by q.priority,
               (select count(*) from public.jobs r where r.user_id = q.user_id and r.status = 'running'),
               q.run_after
      for update skip locked
      limit 1
   )
  returning j.*;
end;
$$;

-- Put jobs whose worker stopped sending heartbeats back in the queue (or fail them).
create or replace function public.requeue_stale_jobs(p_timeout interval default interval '2 minutes')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.jobs
     set status = case when attempts >= max_attempts then 'failed'::public.job_status else 'queued'::public.job_status end,
         locked_by = null,
         locked_at = null,
         error = coalesce(error, '{}'::jsonb) || jsonb_build_object('reason', 'worker_heartbeat_lost'),
         finished_at = case when attempts >= max_attempts then now() else null end,
         run_after = now() + interval '30 seconds'
   where status = 'running'
     and heartbeat_at < now() - p_timeout;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.claim_job(text, text[]) from public, anon, authenticated;
revoke all on function public.requeue_stale_jobs(interval) from public, anon, authenticated;
grant execute on function public.claim_job(text, text[]) to service_role;
grant execute on function public.requeue_stale_jobs(interval) to service_role;

-- Called by the app after a file upload finishes. Confirms the object exists in the
-- user's own folder, moves the material to "queued" and enqueues ingestion exactly once.
create or replace function public.complete_material_upload(p_material_id uuid)
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
  if m.status <> 'uploading' then
    return m;
  end if;
  if not exists (
    select 1 from storage.objects o where o.bucket_id = 'materials' and o.name = m.storage_path
  ) then
    raise exception 'The file has not finished uploading.' using errcode = 'P0001', hint = 'upload_missing';
  end if;

  update public.materials
     set status = 'queued', stage = 'queued', progress = 0, error = null
   where id = m.id
  returning * into m;

  insert into public.jobs (user_id, kind, priority, payload, idempotency_key, subject_type, subject_id)
  values (m.user_id, 'ingest_material', 100, jsonb_build_object('material_id', m.id),
          'material:' || m.id::text, 'material', m.id)
  on conflict do nothing;

  insert into public.usage_counters (user_id, metric, period_start, used)
  values (m.user_id, 'materials', date_trunc('month', now())::date, 1)
  on conflict (user_id, metric, period_start) do update set used = public.usage_counters.used + 1, updated_at = now();

  return m;
end;
$$;
revoke all on function public.complete_material_upload(uuid) from public, anon;
grant execute on function public.complete_material_upload(uuid) to authenticated, service_role;
