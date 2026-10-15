-- Serialize project restoration and creation against the same active-project quota.
-- Separate migration so databases that already have trash support receive this fix too.
create or replace function public.brick_enforce_world_quota()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.deleted_at is not null then return new; end if;
 if tg_op = 'UPDATE' then
  if old.deleted_at is null and old.owner_id = new.owner_id then return new; end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('brick-worlds:'||new.owner_id::text,0));
 if (select count(*) from brick_worlds where owner_id=new.owner_id and deleted_at is null and id<>new.id) >= 50 then
  raise exception using errcode='P0001', message='brick_world_quota';
 end if;
 return new;
end $$;

drop trigger if exists brick_world_quota on public.brick_worlds;
create trigger brick_world_quota before insert or update of deleted_at, owner_id on public.brick_worlds
for each row execute function public.brick_enforce_world_quota();
