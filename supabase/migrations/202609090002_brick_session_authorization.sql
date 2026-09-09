create table public.brick_teacher_sessions (
 session_id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
 revoked boolean not null default false, created_at timestamptz not null default now()
);
alter table public.brick_teacher_sessions enable row level security;
revoke all on public.brick_teacher_sessions from anon,authenticated;
grant all on public.brick_teacher_sessions to service_role;
create table public.brick_credential_locks (
 user_id uuid primary key references public.brick_students(user_id) on delete cascade,
 token uuid not null, expires_at timestamptz not null
);
alter table public.brick_credential_locks enable row level security;
revoke all on public.brick_credential_locks from anon,authenticated;
grant all on public.brick_credential_locks to service_role;
create function public.brick_acquire_credential_lock(p_user_id uuid,p_token uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare acquired integer;
begin
 insert into brick_credential_locks(user_id,token,expires_at) values(p_user_id,p_token,now()+interval '5 minutes')
 on conflict(user_id) do update set token=excluded.token,expires_at=excluded.expires_at
 where brick_credential_locks.expires_at<now();
 get diagnostics acquired=row_count;
 return acquired=1;
end $$;
revoke all on function public.brick_acquire_credential_lock(uuid,uuid) from public,anon,authenticated;
grant execute on function public.brick_acquire_credential_lock(uuid,uuid) to service_role;

-- Authorize in the same transaction as CAS, locking permission rows against a
-- simultaneous reset, suspension, group removal or class closure.
create function public.brick_commit_world(
 p_world_id uuid,p_expected_revision integer,p_document jsonb,p_title text,p_reason text,
 p_actor_id uuid,p_session_id uuid,p_auth_version integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare w brick_worlds; s brick_students; c brick_classes; teacher boolean:=false;
begin
 select * into w from brick_worlds where id=p_world_id for update;
 if not found then return jsonb_build_object('error','not_found'); end if;
 perform 1 from brick_teacher_sessions where session_id=p_session_id and user_id=p_actor_id and not revoked for share;
 teacher:=found;
 if not teacher then
  select * into s from brick_students where user_id=p_actor_id for share;
  if not found or s.suspended or s.reset_required or s.auth_version<>p_auth_version then
   return jsonb_build_object('error','access_revoked');
  end if;
  perform 1 from brick_sessions where session_id=p_session_id and user_id=p_actor_id and auth_version=s.auth_version for share;
  if not found then return jsonb_build_object('error','access_revoked'); end if;
 end if;
 if w.kind='personal' then
  if w.owner_id<>p_actor_id then return jsonb_build_object('error','access_revoked'); end if;
 else
  select * into c from brick_classes where id=w.class_id for share;
  if teacher then
   if c.teacher_id<>p_actor_id then return jsonb_build_object('error','access_revoked'); end if;
  else
   if c.id<>s.class_id or not c.collaboration_open then return jsonb_build_object('error','access_revoked'); end if;
   if w.kind='group' then
    perform 1 from brick_world_members where world_id=w.id and user_id=p_actor_id for share;
    if not found then return jsonb_build_object('error','access_revoked'); end if;
   end if;
   if p_reason in ('restore','rename') or (p_title is not null and p_title<>w.title) then return jsonb_build_object('error','access_revoked'); end if;
  end if;
 end if;
 if not brick_take_rate_limit('save:'||p_actor_id::text,100,10) then return jsonb_build_object('error','rate_limited'); end if;
 return brick_save_world(p_world_id,p_expected_revision,p_document,p_title,p_reason);
end $$;
revoke all on function public.brick_commit_world(uuid,integer,jsonb,text,text,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.brick_commit_world(uuid,integer,jsonb,text,text,uuid,uuid,integer) to service_role;
