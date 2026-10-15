-- Recently deleted projects (2026-10-15). Deleting a project from My projects sets deleted_at instead of removing the
-- row, so the owner can restore it for 30 days; after that the Worker removes it. Deleted projects do not count
-- toward the 50-project limit, so clearing space works straight away.
alter table public.brick_worlds add column if not exists deleted_at timestamptz;
create index if not exists brick_worlds_owner_active on public.brick_worlds(owner_id) where deleted_at is null;

create or replace function public.brick_enforce_world_quota()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('brick-worlds:'||new.owner_id::text,0));
 if (select count(*) from brick_worlds where owner_id=new.owner_id and deleted_at is null) >= 50 then
  raise exception using errcode='P0001', message='brick_world_quota';
 end if;
 return new;
end $$;
