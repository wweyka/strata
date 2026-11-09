-- Strata · live updates for processing progress. Realtime applies the same RLS policies.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.jobs, public.materials;
  end if;
end;
$$;
