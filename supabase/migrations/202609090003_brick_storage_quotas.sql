-- Hard storage/cardinality boundaries also apply to concurrent API requests.
-- Advisory transaction locks serialize inserts for one owner/class, without
-- blocking unrelated classrooms. These limits do not delete existing worlds.
create function public.brick_enforce_student_quota()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('brick-students:'||new.class_id::text,0));
 if (select count(*) from brick_students where class_id=new.class_id) >= 150 then
  raise exception using errcode='P0001', message='brick_student_quota';
 end if;
 return new;
end $$;
create trigger brick_student_quota before insert on public.brick_students
for each row execute function public.brick_enforce_student_quota();

create function public.brick_enforce_world_quota()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('brick-worlds:'||new.owner_id::text,0));
 if (select count(*) from brick_worlds where owner_id=new.owner_id) >= 50 then
  raise exception using errcode='P0001', message='brick_world_quota';
 end if;
 return new;
end $$;
create trigger brick_world_quota before insert on public.brick_worlds
for each row execute function public.brick_enforce_world_quota();

-- JSONB storage/compression must not bypass the API's uncompressed size bound.
alter table public.brick_worlds add constraint brick_world_document_size
 check(octet_length(document::text)<=2000000);
alter table public.brick_checkpoints add constraint brick_checkpoint_document_size
 check(octet_length(document::text)<=2000000);

-- The normal save RPC keeps 30 snapshots. Also cap snapshots to 8 MB/world,
-- so large documents cannot silently consume 60 MB of recovery history each.
-- The world row is already locked by the save RPC during checkpoint insertion.
create function public.brick_bound_checkpoint_bytes()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 delete from brick_checkpoints where id in (
  select id from (
   select id, sum(octet_length(document::text)) over
    (order by created_at desc,id desc rows unbounded preceding) as total_bytes
   from brick_checkpoints where world_id=new.world_id
  ) ranked where total_bytes>8000000
 );
 return new;
end $$;
create trigger brick_checkpoint_byte_budget after insert on public.brick_checkpoints
for each row execute function public.brick_bound_checkpoint_bytes();

revoke all on function public.brick_enforce_student_quota(),
 public.brick_enforce_world_quota(),public.brick_bound_checkpoint_bytes()
 from public,anon,authenticated;
