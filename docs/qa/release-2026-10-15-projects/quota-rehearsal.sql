do $$
declare actor uuid := gen_random_uuid(); first_world uuid; second_world uuid;
begin
 insert into auth.users(id) values(actor);
 insert into public.brick_worlds(owner_id,kind,title,document) select actor,'personal','Release quota transaction fixture','{}'::jsonb from generate_series(1,50);
 begin
  insert into public.brick_worlds(owner_id,kind,title,document) values(actor,'personal','Should fail','{}');
  raise exception 'quota_insert_not_enforced';
 exception when sqlstate 'P0001' then if sqlerrm<>'brick_world_quota' then raise; end if; end;
 select id into first_world from public.brick_worlds where owner_id=actor limit 1;
 update public.brick_worlds set deleted_at=now() where id=first_world;
 insert into public.brick_worlds(owner_id,kind,title,document) values(actor,'personal','Replacement','{}');
 begin
  update public.brick_worlds set deleted_at=null where id=first_world;
  raise exception 'quota_restore_not_enforced';
 exception when sqlstate 'P0001' then if sqlerrm<>'brick_world_quota' then raise; end if; end;
 select id into second_world from public.brick_worlds where owner_id=actor and deleted_at is null limit 1;
 update public.brick_worlds set deleted_at=now() where id=second_world;
 update public.brick_worlds set deleted_at=null where id=first_world;
 update public.brick_worlds set deleted_at=null where id=first_world;
 if (select count(*) from public.brick_worlds where owner_id=actor and deleted_at is null)<>50 then raise exception 'active_count_incorrect'; end if;
end $$;
select 'insert, delete, replacement, rejected restore, successful restore, unchanged active update all passed; transaction rolled back' as result;
