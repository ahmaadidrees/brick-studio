-- Students share personal worlds with their class (docs/flows/CONTRACTS-V2.md, "Data model").
-- Personal worlds keep class_id null; sharing resolves the owner's class through brick_students.class_id
-- at read time. Nothing is renamed and `kind` values are unchanged. Safe to re-run.
alter table public.brick_worlds add column if not exists class_visibility text not null default 'private';
alter table public.brick_worlds drop constraint if exists brick_worlds_class_visibility_check;
alter table public.brick_worlds add constraint brick_worlds_class_visibility_check check (class_visibility in ('private','class'));
alter table public.brick_worlds add column if not exists class_can_edit boolean not null default false;
alter table public.brick_worlds add column if not exists hidden_by_teacher boolean not null default false;
-- When the owner last shared it (null while private). The API's `sharedAt`; updated_at changes on every save.
alter table public.brick_worlds add column if not exists class_shared_at timestamptz;
alter table public.brick_classes add column if not exists students_can_share boolean not null default true;
-- Classmates' shared worlds are listed by owner; the owner index already covers owner_id lookups.
create index if not exists brick_worlds_shared_idx on public.brick_worlds(owner_id) where kind='personal' and class_visibility='class';

-- Live commits: a shared personal world accepts edits from classmates (and the class teacher) only while
-- class_can_edit, collaboration_open, students_can_share and not hidden_by_teacher all hold. The owner
-- always edits. Rename/restore stay owner-only on personal worlds. Everything else is unchanged from 0002.
create or replace function public.brick_commit_world(
 p_world_id uuid,p_expected_revision integer,p_document jsonb,p_title text,p_reason text,
 p_actor_id uuid,p_session_id uuid,p_auth_version integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare w brick_worlds; s brick_students; c brick_classes; owner_class uuid; teacher boolean:=false;
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
  if w.owner_id<>p_actor_id then
   if w.class_visibility<>'class' or not w.class_can_edit or w.hidden_by_teacher then return jsonb_build_object('error','access_revoked'); end if;
   select class_id into owner_class from brick_students where user_id=w.owner_id for share;
   if not found then return jsonb_build_object('error','access_revoked'); end if;
   select * into c from brick_classes where id=owner_class for share;
   if not found or not c.collaboration_open or not c.students_can_share then return jsonb_build_object('error','access_revoked'); end if;
   if teacher then
    if c.teacher_id<>p_actor_id then return jsonb_build_object('error','access_revoked'); end if;
   else
    if c.id<>s.class_id then return jsonb_build_object('error','access_revoked'); end if;
   end if;
   if p_reason in ('restore','rename') or (p_title is not null and p_title<>w.title) then return jsonb_build_object('error','access_revoked'); end if;
  end if;
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

-- Live join permissions (one round trip, never returns world JSON). Personal worlds: the owner always
-- enters as an editor; classmates enter a shared world as viewers (canEdit false) or, with class_can_edit,
-- as editors, while collaboration_open and students_can_share hold and the teacher has not hidden it;
-- the class teacher may always look at a shared world and edits only when class_can_edit. Unsharing or
-- hiding makes the next re-authorization fail for everyone but the owner, which closes their sockets.
create or replace function public.brick_authorize_world(p_world_id uuid,p_user_id uuid,p_session_id uuid,p_auth_version integer,p_teacher_allowed boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare w record; s brick_students; c brick_classes; owner_class uuid; teacher boolean:=false; display_name text; can_edit boolean:=true;
begin
 if p_user_id is null or p_session_id is null or p_auth_version is null or p_world_id is null then return jsonb_build_object('error','session_revoked'); end if;
 if p_teacher_allowed and p_auth_version=0 then
  perform 1 from brick_teacher_sessions where session_id=p_session_id and user_id=p_user_id and not revoked;
  if not found then return jsonb_build_object('error','session_revoked'); end if;
  teacher:=true; display_name:='Teacher';
 else
  select * into s from brick_students where user_id=p_user_id;
  if not found or s.auth_version<>p_auth_version then return jsonb_build_object('error','session_revoked'); end if;
  perform 1 from brick_sessions where session_id=p_session_id and user_id=p_user_id and auth_version=s.auth_version;
  if not found then return jsonb_build_object('error','session_revoked'); end if;
  if s.suspended then return jsonb_build_object('error','suspended'); end if;
  if s.reset_required then return jsonb_build_object('error','password_change_required'); end if;
  display_name:=s.username;
 end if;
 select id,owner_id,class_id,kind,class_visibility,class_can_edit,hidden_by_teacher into w from brick_worlds where id=p_world_id;
 if not found then return jsonb_build_object('error','not_found'); end if;
 if w.kind='personal' then
  if w.owner_id<>p_user_id then
   if w.class_visibility<>'class' then return jsonb_build_object('error','private_world'); end if;
   select class_id into owner_class from brick_students where user_id=w.owner_id;
   if not found then return jsonb_build_object('error','private_world'); end if;
   select * into c from brick_classes where id=owner_class;
   if teacher then
    if c.teacher_id<>p_user_id then return jsonb_build_object('error','not_found'); end if;
   else
    if c.id<>s.class_id then return jsonb_build_object('error','not_found'); end if;
    if w.hidden_by_teacher then return jsonb_build_object('error','world_hidden'); end if;
    if not c.collaboration_open then return jsonb_build_object('error','class_closed'); end if;
    if not c.students_can_share then return jsonb_build_object('error','sharing_disabled'); end if;
   end if;
   can_edit:=w.class_can_edit;
  end if;
 else
  select * into c from brick_classes where id=w.class_id;
  if teacher then
   if c.teacher_id<>p_user_id then return jsonb_build_object('error','not_found'); end if;
  else
   if c.id<>s.class_id then return jsonb_build_object('error','not_found'); end if;
   if not c.collaboration_open then return jsonb_build_object('error','class_closed'); end if;
   if w.kind='group' then
    perform 1 from brick_world_members where world_id=w.id and user_id=p_user_id;
    if not found then return jsonb_build_object('error','not_found'); end if;
   end if;
  end if;
 end if;
 return jsonb_build_object('userId',p_user_id,'username',display_name,'role',case when teacher then 'teacher' else 'student' end,
  'worldId',w.id,'classId',w.class_id,'canEdit',can_edit,'isTeacher',teacher,'isOwner',w.owner_id=p_user_id,'authVersion',p_auth_version,'sessionId',p_session_id);
end $$;
-- brick_authorize_world_batch (0005) calls brick_authorize_world by name and needs no change.
revoke all on function public.brick_commit_world(uuid,integer,jsonb,text,text,uuid,uuid,integer),
 public.brick_authorize_world(uuid,uuid,uuid,integer,boolean) from public,anon,authenticated;
grant execute on function public.brick_commit_world(uuid,integer,jsonb,text,text,uuid,uuid,integer),
 public.brick_authorize_world(uuid,uuid,uuid,integer,boolean) to service_role;
